/** Leaderboard time windows. Calendar periods, in UTC, so everyone shares the same board. */
export const PERIODS = ["day", "week", "month", "all"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = { day: "Today", week: "This Week", month: "This Month", all: "All Time" };

export const PAGE_SIZE = 10;
export const MAX_RANKED = 100;

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

/** When the period containing `now` began (ms). Weeks start on Monday. */
export function periodStart(period: Period, now: number): number {
  if (period === "all") return 0;
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (period === "month") return Date.UTC(year, month, 1);
  if (period === "week") return Date.UTC(year, month, day - ((date.getUTCDay() + 6) % 7));
  return Date.UTC(year, month, day);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(Math.min(total, MAX_RANKED) / PAGE_SIZE));
}
