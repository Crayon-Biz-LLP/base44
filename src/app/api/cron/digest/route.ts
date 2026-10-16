import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, workflows, tenants } from "@/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";
import { translateRecords } from "@/lib/infra/translators";

type DigestColumn = { key?: string; label?: string; target?: number | string };
type DigestSchema = { entryPersonaDimension?: string; columns?: DigestColumn[]; [k: string]: unknown };
type CubeRecord = { cell?: Record<string, string>; value?: number | string; type?: string; target?: number | string };

export async function POST() {
  try {
    const today = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
    const p = formatter.formatToParts(today).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {} as Record<string, string>);
    // Derive the IST<->UTC offset (UTC+5:30, no DST) so the digest window is a
    // TRUE IST day, not UTC midnight of the IST calendar date.
    const wallAsUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second), today.getMilliseconds());
    const istOffsetMs = wallAsUTC - today.getTime();
    const startOfDay = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), 0, 0, 0) - istOffsetMs);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    const startOfYesterday = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);
    const endOfYesterday = new Date(startOfDay.getTime() - 1);

    const allTenants = await db.select().from(tenants);
    const digests = [];

    for (const t of allTenants) {
      const dailyEvents = await db.select().from(events).where(
        and(
          eq(events.tenantId, t.id),
          gte(events.createdAt, startOfDay),
          lte(events.createdAt, endOfDay)
        )
      );

      if (dailyEvents.length === 0) continue;

      const yesterdayEvents = await db.select().from(events).where(
        and(
          eq(events.tenantId, t.id),
          gte(events.createdAt, startOfYesterday),
          lte(events.createdAt, endOfYesterday)
        )
      );

      // Pre-fetch workflows for column targets
      const tenantWorkflows = await db.select().from(workflows).where(eq(workflows.tenantId, t.id));
      const workflowsMap = new Map(tenantWorkflows.map(w => [w.id, w.config]));

      let salesTotal = 0;
      const missedTargets: string[] = [];
      const staffStats: Record<string, { totalActual: number, totalTarget: number, todayPct: number, prevPct: number | null }> = {};

      const extractStats = (evList: Record<string, unknown>[], isToday: boolean) => {
        for (const ev of evList) {
          const raw: unknown = ev.payload;
          const config: { schema?: DigestSchema } = (workflowsMap.get(ev.workflowId as string) as { schema?: DigestSchema }) || {};
          const schema = config.schema || {};
          
          let gridPayload: Record<string, unknown>[] = [];
          let listPayload: Record<string, unknown>[] = [];
          let recordsPayload: CubeRecord[] = [];
          
          if (Array.isArray(raw)) gridPayload = raw;
          else if (raw && typeof raw === "object") {
            const bag = raw as { [key: string]: unknown };
            if (Array.isArray(bag.grid)) gridPayload = bag.grid;
            else if (Array.isArray(bag.list)) listPayload = bag.list;
            else if (Array.isArray(bag.records)) recordsPayload = bag.records;
          }
          
          // Switch based on schema version mapping
          const schemaVersion = (ev.schemaVersion as number) || 1;

          if (schemaVersion === 2 && recordsPayload.length > 0) {
             // Decode V2 Payload (Cube Records)
             const personaDimKey = schema.entryPersonaDimension;
             for (const rec of recordsPayload) {
                // Find performer
                let performer = ev.filledBy as string;
                if (!performer && personaDimKey && rec.cell?.[personaDimKey]) {
                   performer = rec.cell?.[personaDimKey] ?? performer;
                }
                if (!performer) performer = "Unknown";
                
                if (!staffStats[performer]) {
                   staffStats[performer] = { totalActual: 0, totalTarget: 0, todayPct: 0, prevPct: null };
                }
                
                const val = Number(rec.value) || 0;
                
                if (isToday) {
                   if (rec.type === 'currency') salesTotal += val;
                   
                   if (rec.target && Number(rec.target) > 0) {
                      staffStats[performer].totalTarget += Number(rec.target);
                      staffStats[performer].totalActual += val;
                      
                      if (val < Number(rec.target)) {
                         const cellName = Object.values(rec.cell ?? {}).join(" ");
                         missedTargets.push(`${performer}: ${cellName} (${val}/${rec.target})`);
                      }
                   }
                } else {
                   if (rec.target && Number(rec.target) > 0) {
                      staffStats[performer].totalTarget += Number(rec.target);
                      staffStats[performer].totalActual += val;
                   }
                }
             }
          } else {
            // Decode V1 & V3 (Native Grid/List)
            // They share the same payload shape: { grid: [...] } or { list: [...] }
            const gridCols = schema.columns || [];
            for (const row of gridPayload) {
              if (!row || typeof row !== 'object') continue;

              const performer = (row.row || row.staff || ev.filledBy || ev.locationId) as string;
              if (performer && !staffStats[performer]) {
                staffStats[performer] = { totalActual: 0, totalTarget: 0, todayPct: 0, prevPct: null };
              }

              if (isToday) {
                const valueSourceKeys = Object.keys(row).filter(k => !['row', 'target', 'percent_achieved', 'primitive', 'staff', 'metric', 'key', 'label', 'actual', 'value'].includes(k));
                if (row.primitive === 'gross_sales' || row.primitive === 'digital' || row.primitive === 'cash') {
                  salesTotal += Number(row.actual || row.value || 0);
                } else if (valueSourceKeys.length > 0) {
                  salesTotal += Number(row[valueSourceKeys[0]]) || 0;
                }
                
                if (row.percent_achieved !== null && row.percent_achieved !== undefined) {
                   if (performer) staffStats[performer].todayPct = Number(row.percent_achieved);
                }

                // Check missed targets
                let hasColTargets = false;
                for (const col of gridCols) {
                  if (col.target && Number(col.target) > 0) {
                    hasColTargets = true;
                    const cKey = col.key || (col.label ? col.label.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+(.)/g, (_: string, c: string) => c.toUpperCase()).replace(/^(.)/, (c: string) => c.toLowerCase()) : '');
                    const act = Number(row[cKey] !== undefined ? row[cKey] : row[col.label ?? ""]) || 0;
                    const tgt = Number(col.target);
                    if (act < tgt && performer) {
                      missedTargets.push(`${performer}: ${col.label} (${act}/${tgt})`);
                    }
                  }
                }

                if (!hasColTargets) {
                  const tgt = Number(row.target);
                  if (row.target !== '-' && !isNaN(tgt) && tgt > 0 && valueSourceKeys.length > 0) {
                    const act = row.actual !== undefined ? Number(row.actual) : (valueSourceKeys.length === 1 ? Number(row[valueSourceKeys[0]]) : NaN);
                    if (!isNaN(act) && act < tgt && performer) {
                      const what = row.row ? valueSourceKeys.join(', ') : (row.metric || row.key || valueSourceKeys.join(', '));
                      missedTargets.push(`${performer}: ${what} (${act}/${tgt})`);
                    }
                  }
                }
              } else {
                // Yesterday
                if (row.percent_achieved !== null && row.percent_achieved !== undefined && performer) {
                  staffStats[performer].prevPct = Number(row.percent_achieved);
                }
              }
            }
          }
        }
      };

      // Archetype-translator path: Studio-built consoles stamp their archetype
      // + config on the workflow and push generic records via the sync bridge.
      // The translator turns those records into facts/alerts per archetype.
      const consoleVerdicts: string[] = [];
      for (const wf of tenantWorkflows) {
        const wfConfig = (wf.config ?? {}) as Record<string, unknown>;
        const archetype = wfConfig.archetype as string | undefined;
        if (!archetype) continue; // legacy workflow → legacy decode below
        const wfRecords: Record<string, unknown>[] = [];
        for (const ev of dailyEvents) {
          if (ev.workflowId !== wf.id) continue;
          const raw: unknown = ev.payload;
          const bag = (raw && typeof raw === "object" ? raw : {}) as { records?: unknown };
          if (Array.isArray(bag.records)) wfRecords.push(...(bag.records as Record<string, unknown>[]));
        }
        const facts = translateRecords(archetype, wfRecords, (wfConfig.archetypeConfig ?? null) as Record<string, unknown> | null);
        if (!facts.lines.length && !facts.alerts.length) continue;
        const title = String(wfConfig.title ?? wf.id);
        consoleVerdicts.push(
          `🖥 *${title}* (${archetype})\n${facts.lines.slice(0, 6).map((l) => `• ${l}`).join("\n")}` +
            (facts.alerts.length ? `\n⚠️ ${facts.alerts.slice(0, 3).join("\n⚠️ ")}` : "\n✅ All clear")
        );
      }

      extractStats(dailyEvents, true);
      
      // Reset totals for yesterday to calculate prevPct correctly
      for (const p in staffStats) {
         staffStats[p].totalActual = 0;
         staffStats[p].totalTarget = 0;
      }
      
      extractStats(yesterdayEvents, false);

      const leaderLines = Object.entries(staffStats)
        .sort((a, b) => b[1].todayPct - a[1].todayPct)
        .map(([staff, stats], i) => {
          let badge = "⚠️";
          if (stats.todayPct >= 100) badge = "🌟";
          else if (stats.todayPct >= 80) badge = "📈";

          let growthStr = "";
          if (stats.prevPct !== null) {
            const diff = stats.todayPct - stats.prevPct;
            growthStr = ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% vs yest)`;
          }
          return `${i + 1}. ${staff}: ${stats.todayPct.toFixed(1)}% ${badge}${growthStr}`;
        });

      // Format WhatsApp Message
      const consoleBlock = consoleVerdicts.length ? `🗂 *Console Verdicts:*\n${consoleVerdicts.join("\n\n")}\n\n` : "";
      const waMessage = `*Daily Ops Verdict: ${t.name}* 📊\n📅 ${startOfDay.toISOString().split('T')[0]}\n\n💰 *Est. Total Value:* ₹${salesTotal.toLocaleString()}\n\n🏆 *Team Performance:*\n${leaderLines.join('\n') || 'N/A'}\n\n${consoleBlock}⚠️ *Missed Targets / Alerts:*\n${missedTargets.length > 0 ? missedTargets.map(m => `• ${m}`).join('\n') : 'All targets hit! ✅'}\n\n_Generated by Autonomous Ops Desk_`;

      digests.push({
        tenant: t.name,
        channels: ['whatsapp', 'email'],
        message: waMessage
      });
      
      // In a real app, send via Twilio/WhatsApp API here
    }

    return NextResponse.json({ success: true, digests });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
