import { NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { resolveDateRange, DashboardSpec } from "@/lib/domain/dashboard-spec";
import { eq, and, gte, lte, type SQL } from "drizzle-orm";
import { requireOwnerTenant } from "@/lib/auth/auth";

type GridRow = { row?: string; label?: string; staff?: string; target?: number | string; percent_achieved?: number; [col: string]: unknown };
type ListItem = { key?: string; id?: string; label?: string; value?: number | string; [col: string]: unknown };
type EventPayload = { grid?: GridRow[]; list?: ListItem[]; records?: unknown };
type RawPoint = { date: string; entity: string; value: number; target: number };

export async function POST(req: Request) {
  try {
    const spec: DashboardSpec = await req.json();

    const guard = await requireOwnerTenant();
    if (!guard.ok) return guard.response;
    const tenantId = guard.tenantId;

    if (!spec.widgets || spec.widgets.length === 0) {
      return NextResponse.json({ widgets: [] });
    }

    // 1. Determine all workflow IDs and max date range needed
    const workflowIds = Array.from(new Set(spec.widgets.map(w => w.workflowId)));
    
    // 2. We could optimize by fetching per widget, but fetching all events for these workflows 
    // in the broadest date range and aggregating in memory is simpler for MVP scale.
    // For safety, let's just process per widget since they might have different date ranges.
    
    const computedWidgets = [];

    for (let i = 0; i < spec.widgets.length; i++) {
      const widget = spec.widgets[i];
      const { start, end } = resolveDateRange(widget.dateRange);
      const startDate = new Date(start);
      const endDate = new Date(end);

      const conditions: SQL[] = [
        eq(events.tenantId, tenantId),
        gte(events.createdAt, startDate),
        lte(events.createdAt, endDate)
      ];
      
      if (widget.workflowId) {
        conditions.push(eq(events.workflowId, widget.workflowId));
      }

      const widgetEvents = await db.select().from(events).where(and(...conditions));
      console.log(`Widget ${i} - Range: ${startDate.toISOString()} to ${endDate.toISOString()} - Found events: ${widgetEvents.length}`);

      if (widgetEvents.length === 0) {
        computedWidgets.push({ id: `w_${i}`, spec: widget, empty: true, data: null });
        continue;
      }

      // Aggregate data
      let data: unknown = null;

      // Extract raw points depending on metric
      const rawPoints: RawPoint[] = [];
      
      for (const ev of widgetEvents) {
        const payload = ev.payload as EventPayload | null;
        if (!payload) continue;

        const dayStr = new Date(ev.createdAt).toLocaleDateString("en-IN", { 
          timeZone: "Asia/Kolkata", month: 'short', day: 'numeric' 
        });

        // Grid format rows
        if (payload.grid && Array.isArray(payload.grid)) {
          for (const row of payload.grid) {
            const rowId = row.row || row.label || row.staff || "unknown";
            
            // Filter by rowLabel if specified — match against the human label OR the row id
            if (widget.metric.rowLabel &&
                String(row.label || "").toLowerCase() !== String(widget.metric.rowLabel).toLowerCase() &&
                rowId.toLowerCase() !== String(widget.metric.rowLabel).toLowerCase()) continue;

            // Which column to extract?
            const metricKeys = Object.keys(row).filter(k => 
              k !== 'row' && k !== 'label' && k !== 'staff' && k !== 'target' && k !== 'percent_achieved'
            );

            const keysToAggregate = widget.metric.primitive ? 
              metricKeys.filter(k => k === widget.metric.primitive) : 
              metricKeys;

            for (const key of keysToAggregate) {
              let val = 0;
              if (widget.metric.kind === 'percent_achieved') {
                const actual = Number(row[key]) || 0;
                const target = Number(row.target) || 0;
                val = row.percent_achieved !== undefined ? row.percent_achieved : (target > 0 ? (actual / target) * 100 : 0);
              } else if (widget.metric.kind === 'actual' || widget.metric.kind === 'value') {
                val = Number(row[key]) || 0;
              } else if (widget.metric.kind === 'count') {
                val = 1;
              }

              let groupingEntity = "Submission";
              if (widget.entity === "staff") groupingEntity = rowId;
              else if (widget.entity === "metric") groupingEntity = key;

              rawPoints.push({
                date: dayStr,
                entity: groupingEntity,
                value: val,
                target: Number(row.target) || 0
              });
            }
          }
        } 
        // List format rows
        else if (payload.list && Array.isArray(payload.list)) {
          for (const item of payload.list) {
            const itemKey = item.key || item.id || item.label;
            
            if (widget.metric.rowLabel && item.label !== widget.metric.rowLabel && itemKey !== widget.metric.rowLabel) continue;
            if (widget.metric.primitive && itemKey !== widget.metric.primitive) continue;

            let val = 0;
            if (widget.metric.kind === 'value' || widget.metric.kind === 'actual') {
              val = Number(item.value) || 0;
            } else if (widget.metric.kind === 'count') {
              val = 1;
            }

            let groupingEntity = "Submission";
            if (widget.entity === "metric") groupingEntity = itemKey || item.label || "Submission";

            rawPoints.push({
              date: dayStr,
              entity: groupingEntity,
              value: val,
              target: 0
            });
          }
        }
      }

      if (rawPoints.length === 0) {
        computedWidgets.push({ id: `w_${i}`, spec: widget, empty: true, data: null });
        continue;
      }

      // Aggregate into requested shapes
      if (widget.type === 'stat') {
        const sum = rawPoints.reduce((acc, p) => acc + p.value, 0);
        data = { value: widget.aggregation === 'avg' ? Math.round(sum / rawPoints.length) : sum };
      } 
      else if (widget.type === 'trend') {
        // Group by date
        const byDate = rawPoints.reduce((acc, p) => {
          if (!acc[p.date]) acc[p.date] = { sum: 0, count: 0 };
          acc[p.date].sum += p.value;
          acc[p.date].count++;
          return acc;
        }, {} as Record<string, { sum: number; count: number }>);
        
        const dataPoints = Object.entries(byDate).map(([date, val]) => {
          const st = val;
          return {
            date,
            value: widget.aggregation === 'avg' ? Math.round(st.sum / st.count) : st.sum
          };
        });
        
        data = { points: dataPoints };
      }
      else if (widget.type === 'compare' || widget.type === 'breakdown' || widget.type === 'table') {
        // Group by entity
        const byEntity = rawPoints.reduce((acc, p) => {
          const e = p.entity || "Unknown";
          if (!acc[e]) acc[e] = { sum: 0, count: 0, target: p.target || null };
          acc[e].sum += p.value;
          acc[e].count++;
          return acc;
        }, {} as Record<string, { sum: number; count: number; target?: unknown }>);

        const entities = Object.entries(byEntity).map(([label, val]) => {
          const st = val;
          return {
            label,
            value: widget.aggregation === 'avg' ? Math.round(st.sum / st.count) : st.sum,
            target: st.target
          };
        }).sort((a, b) => b.value - a.value);

        if (widget.type === 'table') {
          data = { rows: entities };
        } else if (widget.type === 'breakdown') {
          data = { slices: entities };
        } else {
          data = { entities }; // compare
        }
      }

      computedWidgets.push({ id: `w_${i}`, spec: widget, empty: false, data });
    }

    return NextResponse.json({ widgets: computedWidgets });
  } catch (error) {
    console.error("Dashboard Data Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch data" }, { status: 500 });
  }
}
