// Alerts cron — POST /api/cron/alerts
//
// The reflex loop, end to end (zero LLM):
//   for each tenant → for each LIVE console:
//     1. trend = 14 days of confirmed snapshots → computeConsoleTrend
//     2. todayAlerts = translator alerts from today's latest snapshot
//     3. brain = computeAlerts (hysteresis via alert_state)
//     4. send  = renderAlertDigest → email (Resend) + WhatsApp (Cloud API),
//                skipping channels without creds or a destination
//     5. audit = every decision logged to alert_log (sent / skipped / failed)
//
// Fire-and-forget by design: one tenant failing never blocks another. With no
// RESEND_API_KEY / WHATSAPP_TOKEN the run is a full DRY RUN — everything is
// computed and logged as skipped-no-creds, which makes local verification
// possible without a single real message.
// Schedule: after the evening sync window (e.g. 20:30 IST daily), plus an
// optional CRON_SECRET header check for production.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, workflows, tenants } from "@/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { computeConsoleTrend } from "@/lib/domain/trends";
import { computeAlerts, type AlertDecision } from "@/lib/domain/alerts";
import { istDay } from "@/lib/domain/trends";
import { loadAlertStates, saveAlertStates, logAlerts } from "@/lib/data/alert-store";
import { sendEmail, sendWhatsApp, renderAlertDigest } from "@/lib/util/channels";
import type { ArchetypeId } from "@/lib/pipeline/archetypes";

export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("x-cron-secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allTenants = await db.select().from(tenants);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const today = istDay(new Date());
    const report: { tenant: string; decisions: number; sent: number; skipped: number; via: string[] }[] = [];

    for (const t of allTenants) {
      try {
        // Live consoles only — drafts never alarm.
        const heads = await db
          .select()
          .from(workflows)
          .where(and(eq(workflows.tenantId, t.id), eq(workflows.isActive, true)));
        const consoles = heads.filter((w) => (w.config as Record<string, unknown>)?.archetype);
        if (!consoles.length) continue;

        const memberIds = consoles.map((c) => c.id);
        const snaps = await db
          .select({ workflowId: events.workflowId, createdAt: events.createdAt, payload: events.payload })
          .from(events)
          .where(and(inArray(events.workflowId, memberIds), eq(events.status, "confirmed"), gte(events.createdAt, since)))
          .orderBy(events.createdAt);

        const states = await loadAlertStates(t.id, consoles.map((c) => c.lineageId));
        const perConsole: { consoleTitle: string; messages: string[] }[] = [];
        const stateSaves: { lineageId: string; rule: string; state: import("@/lib/domain/alerts").QuietState }[] = [];
        const logRows: Parameters<typeof logAlerts>[0] = [];
        const decisions: (AlertDecision & { lineageId: string })[] = [];

        for (const c of consoles) {
          const cfg = c.config as Record<string, unknown>;
          const consoleSnaps = snaps.filter((s) => s.workflowId === c.id);
          const trend = computeConsoleTrend(
            cfg.archetype as ArchetypeId,
            (cfg.archetypeConfig as Record<string, unknown>) ?? null,
            consoleSnaps.map((s) => ({ createdAt: s.createdAt, payload: (s.payload ?? null) as Record<string, unknown> | null })),
          );
          if (!trend.hasData) continue;

          const newestDay = trend.days[trend.days.length - 1];
          const todayAlerts = newestDay?.day === today ? newestDay.alerts : [];

          const key = (rule: string) => `${c.lineageId}|${rule}`;
          const cStates: Record<string, import("@/lib/domain/alerts").QuietState> = {};
          for (const rule of ["headline-drop", "headline-spike", "translator-alerts"]) {
            const s = states[key(rule)];
            if (s) cStates[rule] = s; // omit nulls — they would poison nextStates
          }
          const { decisions: ds, nextStates } = computeAlerts({
            lineageId: c.lineageId,
            consoleTitle: String(cfg.title ?? cfg.productName ?? c.id),
            trend,
            todayAlerts,
            states: cStates,
          });

          for (const rule of Object.keys(nextStates)) {
            stateSaves.push({ lineageId: c.lineageId, rule, state: nextStates[rule] });
          }
          for (const d of ds) {
            decisions.push({ ...d, lineageId: c.lineageId });
            perConsole.push({
              consoleTitle: String(cfg.title ?? cfg.productName ?? c.id),
              messages: [d.message.replace(/^.. /, "")], // strip emoji prefix; renderer adds its own
            });
            logRows.push({
              tenantId: t.id,
              lineageId: c.lineageId,
              rule: d.rule,
              severity: d.severity,
              message: d.message,
              channels: [], // filled after send
              status: "pending",
            });
          }
        }

        if (!decisions.length) {
          report.push({ tenant: t.name, decisions: 0, sent: 0, skipped: 0, via: [] });
          continue;
        }

        // Persist hysteresis BEFORE sending (at-most-once per reminder window).
        await saveAlertStates(t.id, stateSaves);

        // Send via whatever channels exist.
        const via: string[] = [];
        let sent = 0;
        let skipped = 0;
        const digest = renderAlertDigest(t.name, perConsole);
        const channelsTried: { name: string; result: Awaited<ReturnType<typeof sendEmail>> }[] = [];
        if (t.alertEmail) {
          const r = await sendEmail({ to: t.alertEmail, subject: `OpsDesk alerts — ${decisions.length} item${decisions.length > 1 ? "s" : ""}`, text: digest });
          channelsTried.push({ name: "email", result: r });
        }
        if (t.alertPhone) {
          const r = await sendWhatsApp({ to: t.alertPhone, text: digest });
          channelsTried.push({ name: "whatsapp", result: r });
        }
        if (!channelsTried.length) {
          channelsTried.push({ name: "none", result: { channel: "email", status: "skipped-no-creds", detail: "no alert destinations set" } });
        }
        for (const ch of channelsTried) {
          if (ch.result.status === "sent") {
            sent++;
            via.push(ch.name);
          } else {
            skipped++;
          }
        }

        await logAlerts(
          logRows.map((r) => ({
            ...r,
            channels: channelsTried.map((c) => c.name === "none" ? "none" : c.name),
            status: channelsTried.every((c) => c.result.status === "skipped-no-creds") ? "skipped-no-creds" : (channelsTried.some((c) => c.result.status === "sent") ? "sent" : "failed"),
            detail: { channels: channelsTried.map((c) => ({ channel: c.name, status: c.result.status, detail: c.result.detail })) },
          })),
        );

        report.push({ tenant: t.name, decisions: decisions.length, sent, skipped, via });
      } catch (tenantError) {
        console.error(`[cron/alerts] tenant ${t.name} failed (continuing):`, tenantError);
        report.push({ tenant: t.name, decisions: -1, sent: 0, skipped: 0, via: ["error"] });
      }
    }

    return NextResponse.json({ success: true, ranAt: new Date().toISOString(), dryRun: !process.env.RESEND_API_KEY && !process.env.WHATSAPP_TOKEN, report });
  } catch (e) {
    console.error("[cron/alerts]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
