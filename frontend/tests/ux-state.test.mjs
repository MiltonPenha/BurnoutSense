import test from "node:test";
import assert from "node:assert/strict";
import { createSessionReadCache } from "../lib/session-read-cache.ts";
import { draftKey, readContextDraft, writeContextDraft } from "../lib/session-draft.ts";
import { validateDailyAnswers } from "../lib/daily-form-validation.ts";
import { schemaFieldErrors, SchemaValidationError, readSchemaFields } from "../lib/esbeu-form.ts";

test("session reads share in-flight requests and expire after a short interval", async () => {
  let now = 0, calls = 0;
  const cache = createSessionReadCache(5000, () => now);
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.read("owner-a:profile", load), cache.read("owner-a:profile", load)]), [1, 1]);
  assert.equal(await cache.read("owner-a:profile", load), 1);
  now = 5001;
  assert.equal(await cache.read("owner-a:profile", load), 2);
  assert.equal(await cache.read("owner-b:profile", load), 3);
});
test("mutations and logout clear cached reads; older promises cannot replace fresh data", async () => {
  const cache = createSessionReadCache();
  let finish;
  const old = cache.read("a", () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve(); cache.clear();
  assert.equal(await cache.read("a", async () => "fresh"), "fresh");
  finish("old"); await old;
  assert.equal(await cache.read("a", async () => "wrong"), "fresh");
  cache.clear(); assert.equal(await cache.read("a", async () => "new-session"), "new-session");
});
test("read failures can be retried and never enter the cache", async () => {
  const cache = createSessionReadCache();
  await assert.rejects(cache.read("a", async () => { throw new Error("fictional failure"); }));
  assert.equal(await cache.read("a", async () => "recovered"), "recovered");
});
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
test("drafts are isolated by account and base assessment, expire and never restore consent", () => {
  const port = storage(), key = draftKey("account-a", "initial");
  const draft = { values: { sleep_hours: "7,5" }, step: 1, withItems: false };
  writeContextDraft(port, key, draft, 1000);
  assert.deepEqual(readContextDraft(port, key, 1001), draft);
  assert.equal(readContextDraft(port, draftKey("account-b", "initial"), 1001), null);
  assert.equal(readContextDraft(port, draftKey("account-a", "new-base"), 1001), null);
  assert.equal(readContextDraft(port, key, 1000 + 2 * 60 * 60 * 1000), null);
  assert.equal(port.getItem(key), null);
});
test("draft readers ignore corrupt, overlong or invalid stage data", () => {
  for (const value of ["broken", JSON.stringify({ expiresAt: 9999, step: 8, values: {}, withItems: false }), JSON.stringify({ expiresAt: 9999, step: 0, values: { a: "x".repeat(201) }, withItems: false })]) {
    const port = storage(); port.setItem("a", value); assert.equal(readContextDraft(port, "a", 1000), null);
  }
});
test("daily errors identify each field and preserve zero and decimal commas", () => {
  const draft = { mood: "Calmo", sleepHours: "0", observations: { sleep_quality: 0, assessment_pressure: 0, study_rest_difficulty: 0, personal_support: 0 } };
  assert.deepEqual(validateDailyAnswers(draft, true), { errors: {}, sleepHours: 0 });
  assert.equal(validateDailyAnswers({ ...draft, sleepHours: "7,5" }, true).sleepHours, 7.5);
  for (const sleepHours of ["", "Infinity", "-1", "24.1", "0x10", "1e1"]) assert.ok(validateDailyAnswers({ ...draft, sleepHours }, false).errors.sleepHours);
  assert.ok(validateDailyAnswers({ ...draft, observations: { ...draft.observations, personal_support: "" } }, true).errors.personal_support);
  assert.deepEqual(validateDailyAnswers({ ...draft, observations: { ...draft.observations, personal_support: "" } }, false).errors, {});
});
test("schema validation provides stable field identities without exposing the answer", () => {
  const fields = [{ identifier: "hours", name: "Sono", choices: [], minimum: 0, maximum: 24, data_type: "number" }];
  assert.equal(schemaFieldErrors(fields, { hours: "7,5" }).hours, undefined);
  assert.ok(schemaFieldErrors(fields, { hours: "" }).hours);
  assert.throws(() => readSchemaFields(fields, new Map([["ctx-hours", "private-marker"]]), "ctx"), error => error instanceof SchemaValidationError && error.fieldId === "hours" && !error.message.includes("private-marker"));
});
