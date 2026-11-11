import assert from "node:assert/strict";
import test from "node:test";
import { calculationDay, trendSeries } from "../lib/trend-series.ts";
import { checkInOrigin, registrationDate } from "../lib/assessment-dates.ts";

const row = (id, createdAt, estimatedOverall, triggerCheckIn) => ({ id, createdAt, estimatedOverall, triggerCheckIn });

test("the series uses the actual calculation day in Sao Paulo, not a retroactive reference", () => {
  const point = row("one", "2026-11-11T01:00:00Z", 2, { date: "2026-11-01" });
  assert.equal(calculationDay(point.createdAt), "2026-11-10");
  assert.equal(trendSeries([point], "daily")[0].start, "2026-11-10");
});

test("daily view keeps only the last valid result of the day, independent of input order", () => {
  const points = [row("b", "2026-11-10T16:00:00Z", 3), row("a", "2026-11-10T15:00:00Z", 1)];
  assert.equal(trendSeries(points, "daily")[0].value, 3);
  assert.equal(trendSeries(points, "weekly")[0].days, 1);
  assert.deepEqual(trendSeries([], "weekly"), []);
  assert.deepEqual(trendSeries([row("bad", "invalid", 2), row("bad2", "2026-11-10", NaN)], "daily"), []);
});

test("weekly periods are Monday-Sunday across year boundaries with partial weeks", () => {
  const points = trendSeries([row("a", "2027-01-03T12:00:00Z", 2), row("b", "2027-01-04T12:00:00Z", 3)], "weekly");
  assert.equal(points[0].start, "2026-12-28");
  assert.equal(points[0].end, "2027-01-03");
  assert.equal(points[1].connectPrevious, true);
});

test("monthly averages weigh days, not weeks; missing periods are not zero or joined", () => {
  const rows = [row("a", "2026-11-01T12:00:00Z", 0), row("b", "2026-11-02T12:00:00Z", 4), row("c", "2026-11-03T12:00:00Z", 4)];
  assert.equal(trendSeries(rows, "monthly")[0].value, 8 / 3);
  const gap = trendSeries([rows[0], row("d", "2027-01-01T12:00:00Z", 2)], "monthly");
  assert.equal(gap.length, 2);
  assert.equal(gap[1].connectPrevious, false);
});

test("origin preserves separate registration/revision dates and never invents legacy links", () => {
  const origin = { id: "day", date: "2026-11-08", createdAt: "2026-11-10T23:37:00Z", updatedAt: "2026-11-10T23:40:00Z" };
  const record = { source: "daily_experimental", triggerCheckIn: origin, evolution: { trigger: origin } };
  assert.equal(checkInOrigin(record).date, "2026-11-08");
  assert.equal(registrationDate(origin.createdAt), "10/11/2026, 20:37");
  assert.equal(checkInOrigin({ source: "daily_experimental", evolution: { evidence: [origin] } }), null);
});
