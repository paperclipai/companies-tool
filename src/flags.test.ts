import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIncludeValues } from "./flags.js";

test("normalizeIncludeValues maps tasks to issues and drops skills with a warning", () => {
  const result = normalizeIncludeValues("company,tasks,skills");
  assert.equal(result.includeArg, "company,issues");
  assert.equal(result.warnings.length, 1);
});

test("normalizeIncludeValues rejects unknown values", () => {
  assert.throws(() => normalizeIncludeValues("bogus"), /Invalid --include value/);
});
