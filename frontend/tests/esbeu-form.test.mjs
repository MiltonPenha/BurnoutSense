import test from "node:test";
import assert from "node:assert/strict";
import { formatEsbeu, readSchemaFields } from "../lib/esbeu-form.mjs";

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
