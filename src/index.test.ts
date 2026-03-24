import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAddPaperclipArgs,
  buildExportPaperclipArgs,
  buildListPaperclipArgs,
  pickProvider,
  promptPaperclipConnection,
  promptNewCompanyName,
  promptSource,
  promptTargetMode,
} from "./index.js";

test("buildAddPaperclipArgs translates wrapper add options to paperclip import args", () => {
  assert.deepEqual(
    buildAddPaperclipArgs({
      source: "./fixtures/company",
      includeArg: "company,agents,projects,issues,skills",
      target: "existing",
      agents: "ceo,cto",
      collision: "replace",
      companyId: "company-123",
      dryRun: true,
      yes: true,
    }),
    [
      "company",
      "import",
      "./fixtures/company",
      "--include",
      "company,agents,projects,issues,skills",
      "--target",
      "existing",
      "--agents",
      "ceo,cto",
      "--collision",
      "replace",
      "--company-id",
      "company-123",
      "--dry-run",
      "--yes",
    ],
  );
});

test("buildListPaperclipArgs returns the company list command", () => {
  assert.deepEqual(buildListPaperclipArgs(), ["company", "list"]);
});

test("buildExportPaperclipArgs maps wrapper selectors to paperclip export flags", () => {
  assert.deepEqual(
    buildExportPaperclipArgs({
      companyId: "company-123",
      outDir: "./exports/acme",
      includeArg: "company,agents,projects,issues,skills",
      skills: "base,ops,base",
      projects: "growth,ops",
      tasks: "PAP-1,PAP-2,PAP-1",
      projectTasks: "growth,ops",
      expandReferencedSkills: true,
    }),
    [
      "company",
      "export",
      "company-123",
      "--out",
      "./exports/acme",
      "--include",
      "company,agents,projects,issues,skills",
      "--skills",
      "base,ops",
      "--projects",
      "growth,ops",
      "--issues",
      "PAP-1,PAP-2",
      "--project-issues",
      "growth,ops",
      "--expand-referenced-skills",
    ],
  );
});

test("pickProvider defaults to paperclip in non-interactive mode", async () => {
  assert.equal(await pickProvider(undefined, true), "paperclip");
});

test("promptTargetMode defaults to new in non-interactive mode", async () => {
  assert.equal(await promptTargetMode(undefined, true), "new");
});

test("promptNewCompanyName skips the prompt in non-interactive mode", async () => {
  assert.equal(await promptNewCompanyName(undefined, true), undefined);
});

test("promptSource fails fast in non-interactive mode when no source is provided", async () => {
  await assert.rejects(() => promptSource(undefined, true), /A source is required in non-interactive mode/);
});

test("promptPaperclipConnection defaults to auto in non-interactive mode", async () => {
  assert.deepEqual(await promptPaperclipConnection({ yes: true }), { mode: "auto" });
});

test("promptPaperclipConnection treats apiBase as custom-url", async () => {
  assert.deepEqual(
    await promptPaperclipConnection({ apiBase: "http://localhost:3100/" }),
    { mode: "custom-url", apiBase: "http://localhost:3100" },
  );
});
