import test from "node:test";
import assert from "node:assert/strict";
import { contextToInputs, formatEsbeu, formatIndex, indexColorBand, indexPercentage, readSchemaFields } from "../lib/esbeu-form.ts";

test("sidebar indicator changes color at the displayed 31% and 66% boundaries", () => {
  for (const [percentage, band] of [[0, "green"], [30, "green"], [30.9, "green"], [31, "yellow"], [38, "yellow"], [65, "yellow"], [65.9, "yellow"], [66, "red"], [100, "red"]]) {
    assert.equal(indexColorBand(percentage / 25), band);
  }
  assert.equal(indexColorBand(null), "neutral");
});

const field = (extra = {}) => ({ identifier: "fictional", name: "Campo fictício", choices: [], data_type: "number", minimum: 0, maximum: null, ...extra });
const data = (value) => new Map([["ctx-fictional", value]]);

test("numeric zero remains zero and decimal comma becomes a number", () => {
  assert.equal(readSchemaFields([field()], data("0"), "ctx").fictional, 0);
  assert.equal(readSchemaFields([field()], data("7,5"), "ctx").fictional, 7.5);
});
test("NA stays distinct from the zero rating", () => {
  const definition = field({ choices: [0, 1, 2, 3, 4], data_type: "integer", allows_not_applicable: true });
  assert.equal(readSchemaFields([definition], data("0"), "ctx").fictional, 0);
  assert.equal(readSchemaFields([definition], data("na"), "ctx").fictional, "Não se aplica");
});
test("unanswered, nonfinite and invalid numeric inputs are rejected without echo", () => {
  for (const value of ["", " ", null, "Infinity", "artificial-private-marker", "-1"]) {
    assert.throws(() => readSchemaFields([field()], data(value), "ctx"), (error) => !error.message.includes("artificial-private-marker"));
  }
});
test("integer limits and category options follow the schema", () => {
  for (const value of ["1.5", "13"]) assert.throws(() => readSchemaFields([field({ data_type: "integer", maximum: 12 })], data(value), "ctx"));
  const choice = field({ choices: ["Official A", "Official B"] });
  assert.equal(readSchemaFields([choice], data("1"), "ctx").fictional, "Official B");
  for (const value of ["na", "-1", "2", "1.5", "invalid"]) assert.throws(() => readSchemaFields([choice], data(value), "ctx"));
});
test("formatting never fabricates a zero or a percentage", () => {
  assert.equal(formatEsbeu(0), "0,00");
  assert.equal(formatEsbeu(1.234), "1,23");
  for (const value of [null, undefined, NaN, Infinity, -1, 5, "2"]) assert.equal(formatEsbeu(value), "Indisponível");
});

test("index normalization keeps endpoints and never invents invalid results", () => {
  for (const [score, percent] of [[0, 0], [1, 25], [2, 50], [4, 100]]) assert.equal(indexPercentage(score), percent);
  assert.equal(formatIndex(1.234), "30,9%");
  assert.equal(formatIndex(0), "0%");
  for (const value of [null, undefined, NaN, Infinity, -1, 5, "2"]) {
    assert.equal(indexPercentage(value), null);
    assert.equal(formatIndex(value), "Indisponível");
  }
});

test("guided context preserves canonical categories, zero and NA without choosing defaults", () => {
  const fields = [field({ identifier: "hours" }), field({ identifier: "rating", choices: [0, 1, 2, 3, 4], allows_not_applicable: true }), field({ identifier: "category", choices: ["A", "B"] })];
  assert.deepEqual(contextToInputs(fields), { hours: "", rating: "", category: "" });
  const inputs = contextToInputs(fields, { hours: 0, rating: "Não se aplica", category: "B" });
  assert.deepEqual(inputs, { hours: "0", rating: "na", category: "1" });
  assert.deepEqual(readSchemaFields(fields, new Map(Object.entries(inputs).map(([key, value]) => [`ctx-${key}`, value])), "ctx"), { hours: 0, rating: "Não se aplica", category: "B" });
  assert.equal(contextToInputs(fields, { category: "unknown" }).category, "");
});
