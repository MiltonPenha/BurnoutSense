import test from "node:test";
import assert from "node:assert/strict";
import { calculationDate, dailyDate, isCalendarDay, shiftCalendarDay } from "../lib/daily-checkin.ts";

test("date shortcuts use calendar days across month, year and leap day boundaries", () => {
  assert.equal(shiftCalendarDay("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftCalendarDay("2028-03-01", -1), "2028-02-29");
});

test("invalid calendar days do not spill into another day", () => {
  assert.equal(isCalendarDay("2026-02-29"), false);
  assert.equal(isCalendarDay("2028-02-29"), true);
  assert.equal(dailyDate("2026-02-31"), "Data não informada");
});

test("calculation dates use the configured local timezone rather than slicing UTC", () => {
  assert.equal(calculationDate("2026-11-08T01:00:00Z"), dailyDate("2026-11-07"));
});
