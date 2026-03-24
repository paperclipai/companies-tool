import test from "node:test";
import assert from "node:assert/strict";
import { isGithubShorthand, normalizeSourceInput } from "./sources.js";

test("normalizeSourceInput preserves github shorthand", () => {
  assert.equal(
    normalizeSourceInput("paperclipai/company-template"),
    "paperclipai/company-template",
  );
});

test("normalizeSourceInput preserves owner/repo/path github shorthand", () => {
  assert.equal(
    normalizeSourceInput("paperclipai/companies/gstack"),
    "paperclipai/companies/gstack",
  );
});

test("normalizeSourceInput keeps local paths intact", () => {
  assert.equal(normalizeSourceInput("./fixtures/company"), "./fixtures/company");
});

test("isGithubShorthand accepts owner/repo and owner/repo/path", () => {
  assert.equal(isGithubShorthand("paperclipai/company-template"), true);
  assert.equal(isGithubShorthand("paperclipai/companies/gstack"), true);
});

test("isGithubShorthand rejects local-looking paths", () => {
  assert.equal(isGithubShorthand("./fixtures/company"), false);
  assert.equal(isGithubShorthand("/tmp/company"), false);
  assert.equal(isGithubShorthand("C:\\temp\\company"), false);
});
