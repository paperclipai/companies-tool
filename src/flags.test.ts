import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIncludeValues } from "./flags.js";

test("normalizeIncludeValues maps tasks to issues and preserves skills", () => {
  const result = normalizeIncludeValues("company,tasks,skills");
  assert.equal(result.includeArg, "company,issues,skills");
  assert.equal(result.warnings.length, 0);
});

test("normalizeIncludeValues rejects unknown values", () => {
  assert.throws(() => normalizeIncludeValues("bogus"), /Invalid --include value/);
});
