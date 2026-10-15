import { z } from "zod";

export const DateRuleSchema = z.object({
  type: z.enum(["specific_dates", "day_of_week_in_month", "every_weekday", "daily_range"]),
  specificDates: z.array(z.string()).optional().describe("YYYY-MM-DD format"),
  dayOfWeek: z.number().optional().describe("0=Sunday, 1=Monday, ... 6=Saturday"),
  month: z.number().optional().describe("1=Jan, 2=Feb... 12=Dec"),
  year: z.number().optional(),
  startDate: z.string().optional().describe("YYYY-MM-DD"),
  endDate: z.string().optional().describe("YYYY-MM-DD")
});

export type DateRule = z.infer<typeof DateRuleSchema>;

export function resolveDateRule(rule: DateRule, timezone: string = "Asia/Kolkata"): { key: string, label: string }[] {
  const dates: { key: string, label: string }[] = [];
  
  if (rule.type === "specific_dates" && rule.specificDates) {
    for (const d of rule.specificDates) {
      const dateObj = new Date(d);
      dates.push(formatDate(dateObj, timezone));
    }
  } else if (rule.type === "day_of_week_in_month" && rule.dayOfWeek !== undefined && rule.month !== undefined && rule.year !== undefined) {
    // month is 1-12
    const d = new Date(Date.UTC(rule.year, rule.month - 1, 1));
    while (d.getUTCMonth() === rule.month - 1) {
      if (d.getUTCDay() === rule.dayOfWeek) {
        dates.push(formatDate(new Date(d.getTime()), timezone));
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
  } else if (rule.type === "daily_range" && rule.startDate && rule.endDate) {
    const d = new Date(rule.startDate);
    const end = new Date(rule.endDate);
    while (d <= end) {
      dates.push(formatDate(new Date(d.getTime()), timezone));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  } else if (rule.type === "every_weekday" && rule.startDate && rule.endDate) {
    const d = new Date(rule.startDate);
    const end = new Date(rule.endDate);
    while (d <= end) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) {
        dates.push(formatDate(new Date(d.getTime()), timezone));
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  return dates;
}

function formatDate(date: Date, timezone: string) {
  // Use Intl to format the date
  const iso = date.toISOString().split('T')[0];
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
  return { key: iso, label };
}
