import { describe, expect, it } from "vitest";
import { isPeriod, pageCount, periodStart } from "../src/lib/periods";

describe("leaderboard periods", () => {
  const wednesday = Date.UTC(2026, 10, 18, 15, 30); // Wed 18 Nov 2026, 15:30 UTC

  it("starts each period at the right UTC moment", () => {
    expect(periodStart("all", wednesday)).toBe(0);
    expect(periodStart("day", wednesday)).toBe(Date.UTC(2026, 10, 18));
    expect(periodStart("week", wednesday)).toBe(Date.UTC(2026, 10, 16)); // Monday
    expect(periodStart("month", wednesday)).toBe(Date.UTC(2026, 10, 1));
  });

  it("treats Monday and Sunday as the ends of the same week", () => {
    expect(periodStart("week", Date.UTC(2026, 10, 16, 0, 0))).toBe(Date.UTC(2026, 10, 16));
    expect(periodStart("week", Date.UTC(2026, 10, 22, 23, 59))).toBe(Date.UTC(2026, 10, 16));
    expect(periodStart("week", Date.UTC(2026, 10, 23, 0, 0))).toBe(Date.UTC(2026, 10, 23));
  });

  it("handles weeks that span a month or year boundary", () => {
    expect(periodStart("week", Date.UTC(2027, 0, 1, 12))).toBe(Date.UTC(2026, 11, 28));
  });

  it("validates period names and counts pages (10 per page, top 100)", () => {
    expect(isPeriod("week")).toBe(true);
    expect(isPeriod("year")).toBe(false);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(5000)).toBe(10);
  });
});
