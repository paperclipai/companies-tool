import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSourceInput } from "./sources.js";

test("normalizeSourceInput expands github shorthand", () => {
  assert.equal(
    normalizeSourceInput("paperclipai/company-template"),
    "https://github.com/paperclipai/company-template",
  );
});

test("normalizeSourceInput keeps local paths intact", () => {
  assert.equal(normalizeSourceInput("./fixtures/company"), "./fixtures/company");
});
