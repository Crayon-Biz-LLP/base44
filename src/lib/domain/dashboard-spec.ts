import { z } from "zod";

export const WidgetTypeEnum = z.enum(["stat", "table", "trend", "compare", "breakdown"]);
export const DateRangeEnum = z.enum(["today", "yesterday", "last7", "last30", "this_week", "this_month"]);
export const AggregationEnum = z.enum(["avg", "sum", "count", "latest"]);
export const MetricKindEnum = z.enum(["percent_achieved", "actual", "value", "count"]);

export const MetricSchema = z.object({
  kind: MetricKindEnum,
  rowLabel: z.string().optional().describe("Matches the grid row label or list field label"),
  primitive: z.string().optional().describe("Matches the PrimitiveEnum for cross-store aggregation"),
});

export const WidgetSchema = z.object({
  type: WidgetTypeEnum,
  title: z.string(),
  workflowId: z.string().optional().describe("UUID of the workflow. If omitted, aggregates across all workflows by primitive."),
  metric: MetricSchema,
  entity: z.enum(["staff", "metric", "none"]).optional(),
  dateRange: DateRangeEnum,
  aggregation: AggregationEnum,
});

export const DashboardSpecSchema = z.object({
  widgets: z.array(WidgetSchema),
});

export type WidgetType = z.infer<typeof WidgetTypeEnum>;
export type DateRange = z.infer<typeof DateRangeEnum>;
export type Aggregation = z.infer<typeof AggregationEnum>;
export type MetricKind = z.infer<typeof MetricKindEnum>;
export type Metric = z.infer<typeof MetricSchema>;
export type Widget = z.infer<typeof WidgetSchema>;
export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;

/** Resolves DateRange into IST start/end timestamps (in MS) */
export function resolveDateRange(range: DateRange): { start: number; end: number } {
  const now = new Date();

  // IST wall-clock parts (h23 pins 00:00–23:59 edge cases)
  const istParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).formatToParts(now);
  const get = (t: string): number => {
    const part = istParts.find(p => p.type === t);
    return part ? Number(part.value) : 0;
  };

  // Reinterpret the IST wall clock as UTC to derive the IST<->UTC offset
  // (UTC+5:30, no DST), then compute TRUE IST midnight for the current IST
  // calendar date instead of UTC midnight of that same date.
  const wallAsUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"), now.getMilliseconds());
  const istOffsetMs = wallAsUTC - now.getTime();
  const todayISTMidnight = Date.UTC(get("year"), get("month") - 1, get("day"), 0, 0, 0) - istOffsetMs;

  const DAY = 24 * 60 * 60 * 1000;

  let start = 0;
  let end = todayISTMidnight + DAY - 1; // End of today IST

  switch (range) {
    case "today":
      start = todayISTMidnight;
      break;
    case "yesterday":
      start = todayISTMidnight - DAY;
      end = todayISTMidnight - 1;
      break;
    case "last7":
      start = todayISTMidnight - (6 * DAY);
      break;
    case "last30":
      start = todayISTMidnight - (29 * DAY);
      break;
    case "this_week":
      // Assume week starts Monday for simplicity
      const istDayOfWeek = new Date(todayISTMidnight).getUTCDay(); // 0 is Sun, 1 is Mon
      const diffToMonday = istDayOfWeek === 0 ? 6 : istDayOfWeek - 1;
      start = todayISTMidnight - (diffToMonday * DAY);
      break;
    case "this_month":
      start = Date.UTC(get("year"), get("month") - 1, 1, 0, 0, 0) - istOffsetMs;
      break;
  }
  
  return { start, end };
}

/** Generates a sensible default dashboard based on workflows */
export function buildDefaultSpec(workflows: { id: string; primitiveType?: string; config: { title: string } }[]): DashboardSpec {
  const widgets: Widget[] = [];
  
  workflows.forEach(w => {
    // Stat: Total submissions today
    widgets.push({
      type: "stat",
      title: `${w.config.title} (Today)`,
      workflowId: w.id,
      metric: { kind: "count" },
      entity: "none",
      dateRange: "today",
      aggregation: "count"
    });

    if (w.primitiveType === "grid") {
      // Table: Staff leaderboard avg % last 7 days
      widgets.push({
        type: "table",
        title: `${w.config.title} Leaderboard (7 Days)`,
        workflowId: w.id,
        metric: { kind: "percent_achieved" },
        entity: "staff",
        dateRange: "last7",
        aggregation: "avg"
      });
    } else {
      // Table: Last 7 days submissions
      widgets.push({
        type: "table",
        title: `Recent ${w.config.title}`,
        workflowId: w.id,
        metric: { kind: "count" },
        entity: "none",
        dateRange: "last7",
        aggregation: "latest"
      });
    }
  });

  return { widgets };
}
