import assert from "node:assert/strict";
import test from "node:test";
import { routineTrend } from "../lib/routine-trend.ts";

const today = "2026-11-20";
const poor = { sleep_quality: 1, assessment_pressure: 4, study_rest_difficulty: 3, personal_support: 1 };
const good = { sleep_quality: 3, assessment_pressure: 2, study_rest_difficulty: 2, personal_support: 3 };
const row = (day, observations, sleepHours = 7) => ({ date: `2026-11-${String(day).padStart(2, "0")}`, observations, sleepHours, updatedAt: String(day).padStart(2, "0") });
const series = (before, after) => Array.from({ length: 14 }, (_, i) => row(i + 7, i < 7 ? before : after));

test("fourteen comparable days reveal sustained improvement and worsening independently of the model", () => {
  assert.equal(routineTrend(series(poor, good), today).direction, "better");
  const worsening = routineTrend(series(good, poor).reverse(), today);
  assert.equal(worsening.direction, "worse");
  assert.equal(worsening.strong, true);
  assert.equal(worsening.changes.length, 4);
});

test("one extreme day does not trigger a warning", () => {
  const rows = series(good, good);
  rows[13] = row(20, poor, 3);
  assert.equal(routineTrend(rows, today).strong, false);
  assert.deepEqual(routineTrend(rows, today).changes, []);
});

test("one strong repeated change can trigger feedback; mixed changes cannot", () => {
  assert.equal(routineTrend(series(poor, { ...poor, sleep_quality: 3 }), today).strong, true);
  assert.equal(routineTrend(series(poor, { ...poor, sleep_quality: 2 }), today).strong, false);
  const mixed = routineTrend(series(poor, { ...poor, sleep_quality: 3, personal_support: 0 }), today);
  assert.equal(mixed.changes.length, 2);
  assert.equal(mixed.direction, null);
  assert.equal(mixed.strong, false);
});

test("sleep hours describe duration without assuming more hours mean improvement", () => {
  const rows = series(good, good).map((entry, index) => ({ ...entry, sleepHours: index < 7 ? 7 : 10 }));
  assert.equal(routineTrend(rows, today).sleepDelta, 3);
  assert.equal(routineTrend(rows, today).strong, false);
});

test("missing days, duplicates, legacy observations and future dates do not manufacture evidence", () => {
  const rows = series(poor, good);
  rows[0] = row(7, null);
  assert.equal(routineTrend([...rows, rows[13], row(21, good)], today), null);
  assert.equal(routineTrend(series(poor, good), "2026-12-04"), null);
});

test("six or thirteen records are not enough for the weekly comparison", () => {
  const rows = series(poor, good);
  assert.equal(routineTrend(rows.slice(-6), today), null);
  assert.equal(routineTrend(rows.slice(-13), today), null);
});

test("the weekly median uses the fourth value and tolerates three atypical days", () => {
  const rows = series(poor, good);
  for (const i of [7, 8, 9]) rows[i] = row(i + 7, poor, 3);
  const trend = routineTrend(rows, today);
  assert.equal(trend.direction, "better");
  assert.equal(trend.strong, true);
  assert.equal(trend.changes.length, 4);
});

test("reference dates, not insertion order, select the two groups of seven", () => {
  const rows = series(poor, good);
  assert.deepEqual(routineTrend(rows.reverse(), today), routineTrend(series(poor, good), today));
});
