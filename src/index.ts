#!/usr/bin/env node

import { intro, outro, select, text, confirm, isCancel, cancel, note } from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import {
  buildCommonPaperclipArgs,
  listPaperclipCompanies,
  printWarnings,
  resolveCompanySelector,
  runPaperclip,
  type CommonPaperclipOptions,
  type PaperclipCompanyRecord,
} from "./paperclip.js";
import { normalizeIncludeValues, normalizeTaskSelectors, resolveProvider } from "./flags.js";
import { normalizeSourceInput } from "./sources.js";

type TargetMode = "new" | "existing";
type CollisionMode = "rename" | "skip" | "replace";

interface BaseOptions extends CommonPaperclipOptions {
  provider?: string;
  yes?: boolean;
}

interface AddOptions extends BaseOptions {
  include?: string;
  target?: TargetMode;
  newCompanyName?: string;
  agents?: string;
  collision?: CollisionMode;
  dryRun?: boolean;
}

interface ExportOptions extends BaseOptions {
  out?: string;
  include?: string;
  projects?: string;
  tasks?: string;
  projectTasks?: string;
  expandReferencedSkills?: boolean;
}

function addCommonOptions(command: Command, opts?: { includeCompanyId?: boolean }): Command {
  const configured = command
    .option("-p, --provider <provider>", "Destination provider")
    .option("-y, --yes", "Skip interactive prompts", false)
    .option("-c, --config <path>", "Path to Paperclip config file")
    .option("-d, --data-dir <path>", "Paperclip data directory root")
    .option("--context <path>", "Path to Paperclip CLI context file")
    .option("--profile <name>", "Paperclip CLI context profile name")
    .option("--api-base <url>", "Paperclip API base URL")
    .option("--api-key <token>", "Paperclip API key");

  if (opts?.includeCompanyId) {
    configured.option("-C, --company-id <id>", "Paperclip company id");
  }

  return configured;
}

function fail(message: string): never {
  console.error(pc.red(message));
  process.exit(1);
}

function coerceCancel<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled");
    process.exit(1);
  }
  return value;
}

async function pickProvider(current: string | undefined, skipPrompts: boolean): Promise<"paperclip"> {
  if (current?.trim()) {
    return resolveProvider(current);
  }

  if (skipPrompts) {
    return "paperclip";
  }

  const result = await select({
    message: "Which service do you want to import your company into?",
    options: [
      {
        value: "paperclip",
        label: "paperclip",
        hint: "The current launch provider",
      },
    ],
  });

  return resolveProvider(coerceCancel(result));
}

async function promptTargetMode(current: TargetMode | undefined, skipPrompts: boolean): Promise<TargetMode> {
  if (current) return current;
  if (skipPrompts) return "new";

  const result = await select({
    message: "Where should this company be imported?",
    options: [
      { value: "new", label: "New company", hint: "Create a fresh company in Paperclip" },
      { value: "existing", label: "Existing company", hint: "Import into an existing Paperclip company" },
    ],
  });

  return coerceCancel(result);
}

async function promptSource(current: string | undefined, skipPrompts: boolean): Promise<string> {
  if (current?.trim()) return normalizeSourceInput(current);
  if (skipPrompts) {
    throw new Error("A source is required in non-interactive mode.");
  }

  const result = await text({
    message: "Where is the company package?",
    placeholder: "owner/repo, full Git URL, or local path",
  });

  return normalizeSourceInput(coerceCancel(result));
}

async function promptExistingCompanyId(options: BaseOptions): Promise<string> {
  const companies = await listPaperclipCompanies(options).catch(() => []);
  if (options.yes || companies.length === 0) {
    const typed = await text({
      message: "Target company id",
      placeholder: "uuid",
    });
    return coerceCancel(typed).trim();
  }

  const picked = await select({
    message: "Choose the Paperclip company to import into",
    options: companies.map((company) => ({
      value: company.id,
      label: company.name,
      hint: company.issuePrefix ? `${company.issuePrefix} - ${company.id}` : company.id,
    })),
  });

  return coerceCancel(picked).trim();
}

async function promptNewCompanyName(current: string | undefined, skipPrompts: boolean): Promise<string | undefined> {
  if (current?.trim()) return current.trim();
  if (skipPrompts) return undefined;

  const shouldOverride = await confirm({
    message: "Override the imported company name?",
    initialValue: false,
  });

  if (!coerceCancel(shouldOverride)) return undefined;

  const result = await text({
    message: "New company name",
    placeholder: "Imported Company",
  });
  return coerceCancel(result).trim() || undefined;
}

async function handleAdd(source: string | undefined, options: AddOptions): Promise<void> {
  intro("companies");

  const provider = await pickProvider(options.provider, Boolean(options.yes));
  if (provider !== "paperclip") {
    fail("Only paperclip is supported.");
  }

  const include = normalizeIncludeValues(options.include);
  printWarnings(include.warnings);

  const normalizedSource = await promptSource(source, Boolean(options.yes));
  const target = await promptTargetMode(options.target, Boolean(options.yes));

  const companyId = target === "existing"
    ? (options.companyId?.trim() || await promptExistingCompanyId(options))
    : undefined;
  const newCompanyName = target === "new"
    ? await promptNewCompanyName(options.newCompanyName, Boolean(options.yes))
    : undefined;

  const args = [
    "company",
    "import",
    "--from",
    normalizedSource,
    "--include",
    include.includeArg,
    "--target",
    target,
    "--agents",
    options.agents?.trim() || "all",
    "--collision",
    options.collision?.trim() || "rename",
  ];

  if (companyId) {
    args.push("--company-id", companyId);
  }
  if (newCompanyName) {
    args.push("--new-company-name", newCompanyName);
  }
  if (options.dryRun) {
    args.push("--dry-run");
  }

  note(
    [
      `provider: ${provider}`,
      `source: ${normalizedSource}`,
      `target: ${target}${companyId ? ` (${companyId})` : ""}`,
      `include: ${include.includeArg}`,
    ].join("\n"),
    "Running",
  );

  await runPaperclip(args, options);
  outro("Paperclip import finished.");
}

async function handleList(options: BaseOptions): Promise<void> {
  intro("companies");
  const provider = await pickProvider(options.provider, Boolean(options.yes));
  if (provider !== "paperclip") {
    fail("Only paperclip is supported.");
  }

  await runPaperclip(["company", "list"], options);
  outro("Paperclip company list finished.");
}

async function handleExport(selector: string, options: ExportOptions): Promise<void> {
  intro("companies");
  const provider = await pickProvider(options.provider, Boolean(options.yes));
  if (provider !== "paperclip") {
    fail("Only paperclip is supported.");
  }

  const include = normalizeIncludeValues(options.include);
  printWarnings(include.warnings);

  const outDir = options.out?.trim() || await (async () => {
    if (options.yes) {
      throw new Error("--out is required in non-interactive mode.");
    }
    const result = await text({
      message: "Where should the exported company package be written?",
      placeholder: "./company-package",
    });
    return coerceCancel(result).trim();
  })();

  const companyId = await resolveCompanySelector(selector, options);
  const args = [
    "company",
    "export",
    companyId,
    "--out",
    outDir,
    "--include",
    include.includeArg,
  ];

  const projects = normalizeTaskSelectors(options.projects);
  if (projects.length > 0) {
    args.push("--projects", projects.join(","));
  }

  const tasks = normalizeTaskSelectors(options.tasks);
  if (tasks.length > 0) {
    args.push("--issues", tasks.join(","));
  }

  const projectTasks = normalizeTaskSelectors(options.projectTasks);
  if (projectTasks.length > 0) {
    args.push("--project-issues", projectTasks.join(","));
  }

  if (options.expandReferencedSkills) {
    args.push("--expand-referenced-skills");
  }

  await runPaperclip(args, options);
  outro("Paperclip export finished.");
}

const program = new Command();

program
  .name("companies")
  .description("A skills-style CLI for importing Agent Companies into supported providers")
  .version("0.1.0");

addCommonOptions(
  program
    .command("add")
    .alias("import")
    .description("Import an Agent Company into a provider")
    .argument("[source]", "Source path or repository")
    .option("--include <values>", "Comma-separated include set: company,agents,projects,tasks,issues,skills", "company,agents")
    .option("--target <mode>", "Import target: new | existing")
    .option("--new-company-name <name>", "Name override when creating a new company")
    .option("--agents <list>", "Comma-separated agent slugs to import, or all", "all")
    .option("--collision <mode>", "Collision strategy: rename | skip | replace", "rename")
    .option("--dry-run", "Preview the import without applying it", false)
    .action((source: string | undefined, options: AddOptions) => {
      handleAdd(source, options).catch((error) => fail(error instanceof Error ? error.message : String(error)));
    }),
  { includeCompanyId: true },
);

addCommonOptions(
  program
    .command("list")
    .alias("ls")
    .description("List companies visible through the provider")
    .action((options: BaseOptions) => {
      handleList(options).catch((error) => fail(error instanceof Error ? error.message : String(error)));
    }),
);

addCommonOptions(
  program
    .command("export")
    .description("Export a provider company as a portable Agent Company package")
    .argument("<company>", "Company id, issue prefix, or exact company name")
    .option("--out <path>", "Output directory")
    .option("--include <values>", "Comma-separated include set: company,agents,projects,tasks,issues,skills", "company,agents")
    .option("--projects <values>", "Comma-separated project selectors to export")
    .option("--tasks <values>", "Comma-separated task selectors to export")
    .option("--project-tasks <values>", "Comma-separated project selectors whose tasks should be exported")
    .option("--expand-referenced-skills", "Vendor referenced skills into the export package", false)
    .action((company: string, options: ExportOptions) => {
      handleExport(company, options).catch((error) => fail(error instanceof Error ? error.message : String(error)));
    }),
);

program.parseAsync().catch((error) => fail(error instanceof Error ? error.message : String(error)));
