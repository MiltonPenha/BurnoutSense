import assert from "node:assert/strict";
import test from "node:test";
import { routineTrend } from "../lib/routine-trend.ts";

const today = "2026-11-10";
const poor = { sleep_quality: 1, assessment_pressure: 4, study_rest_difficulty: 3, personal_support: 1 };
const good = { sleep_quality: 3, assessment_pressure: 2, study_rest_difficulty: 2, personal_support: 3 };
const row = (day, observations, sleepHours = 7) => ({ date: `2026-11-${String(day).padStart(2, "0")}`, observations, sleepHours, updatedAt: String(day).padStart(2, "0") });
const series = (before, after) => [5, 6, 7].map((day) => row(day, before)).concat([8, 9, 10].map((day) => row(day, after)));

test("six comparable days reveal sustained improvement and worsening independently of the model", () => {
  assert.equal(routineTrend(series(poor, good), today).direction, "better");
  const worsening = routineTrend(series(good, poor).reverse(), today);
  assert.equal(worsening.direction, "worse");
  assert.equal(worsening.strong, true);
  assert.equal(worsening.changes.length, 4);
});

test("one extreme day does not trigger a warning", () => {
  const rows = series(good, good);
  rows[5] = row(10, poor, 3);
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
  const rows = series(good, good).map((entry, index) => ({ ...entry, sleepHours: index < 3 ? 7 : 10 }));
  assert.equal(routineTrend(rows, today).sleepDelta, 3);
  assert.equal(routineTrend(rows, today).strong, false);
});

test("missing days, duplicates, legacy observations and future dates do not manufacture evidence", () => {
  const rows = series(poor, good);
  rows[0] = row(5, null);
  assert.equal(routineTrend([...rows, rows[5], row(11, good)], today), null);
  assert.equal(routineTrend(series(poor, good), "2026-11-20"), null);
});
