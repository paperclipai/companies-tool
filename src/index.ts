#!/usr/bin/env node

import { intro, outro, select, text, confirm, isCancel, cancel, note } from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import { fileURLToPath } from "node:url";
import {
  assertPaperclipApiReady,
  DEFAULT_PAPERCLIP_API_BASE,
  ensureLocalPaperclipReady,
  listPaperclipCompanies,
  normalizeApiBase,
  printWarnings,
  resolveCompanySelector,
  runPaperclip,
  type CommonPaperclipOptions,
  type PaperclipBootstrapResult,
  type PaperclipCompanyRecord,
} from "./paperclip.js";
import {
  INCLUDE_OPTION_HELP_TEXT,
  normalizeIncludeValues,
  normalizeTaskSelectors,
  resolveProvider,
} from "./flags.js";
import { normalizeSourceInput } from "./sources.js";

type TargetMode = "new" | "existing";
type CollisionMode = "rename" | "skip" | "replace";
type ConnectionMode = "auto" | "custom-url";

interface BaseOptions extends CommonPaperclipOptions {
  connection?: ConnectionMode;
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
  skills?: string;
  projects?: string;
  tasks?: string;
  projectTasks?: string;
  expandReferencedSkills?: boolean;
}

const INCLUDE_OPTION_DESCRIPTION = `Comma-separated include set: ${INCLUDE_OPTION_HELP_TEXT}`;

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

export async function pickProvider(current: string | undefined, skipPrompts: boolean): Promise<"paperclip"> {
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

export async function promptTargetMode(current: TargetMode | undefined, skipPrompts: boolean): Promise<TargetMode> {
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

export async function promptSource(current: string | undefined, skipPrompts: boolean): Promise<string> {
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

function resolveConnectionMode(input: string | undefined): ConnectionMode | undefined {
  if (!input?.trim()) return undefined;
  const normalized = input.trim().toLowerCase();
  if (normalized === "auto" || normalized === "custom-url") {
    return normalized;
  }
  throw new Error(`Invalid --connection value '${input}'. Use auto or custom-url.`);
}

export async function promptPaperclipConnection(
  options: BaseOptions,
): Promise<{ mode: ConnectionMode; apiBase?: string }> {
  if (options.apiBase?.trim()) {
    return {
      mode: "custom-url",
      apiBase: normalizeApiBase(options.apiBase),
    };
  }

  const explicitMode = resolveConnectionMode(options.connection);
  if (explicitMode === "custom-url") {
    if (options.yes) {
      throw new Error("--api-base is required when --connection custom-url is used in non-interactive mode.");
    }

    const entered = await text({
      message: "Paperclip URL",
      placeholder: DEFAULT_PAPERCLIP_API_BASE,
      defaultValue: DEFAULT_PAPERCLIP_API_BASE,
    });
    return {
      mode: "custom-url",
      apiBase: normalizeApiBase(coerceCancel(entered)),
    };
  }

  if (explicitMode === "auto" || options.yes) {
    return { mode: "auto" };
  }

  const selected = await select({
    message: "How should companies.sh connect to Paperclip?",
    options: [
      {
        value: "auto",
        label: "auto",
        hint: "Use the local Paperclip install, onboard if needed, and start it if it is not running",
      },
      {
        value: "custom-url",
        label: "custom-url",
        hint: "Use a specific Paperclip base URL",
      },
    ],
    initialValue: "auto",
  });
  const mode = coerceCancel(selected) as ConnectionMode;
  if (mode === "auto") {
    return { mode };
  }

  const entered = await text({
    message: "Paperclip URL",
    placeholder: DEFAULT_PAPERCLIP_API_BASE,
    defaultValue: DEFAULT_PAPERCLIP_API_BASE,
  });
  return {
    mode,
    apiBase: normalizeApiBase(coerceCancel(entered)),
  };
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

export async function promptNewCompanyName(
  current: string | undefined,
  skipPrompts: boolean,
): Promise<string | undefined> {
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

async function preparePaperclip(options: BaseOptions): Promise<PaperclipBootstrapResult & { mode: ConnectionMode }> {
  const connection = await promptPaperclipConnection(options);
  if (connection.mode === "auto") {
    const ready = await ensureLocalPaperclipReady(options);
    return {
      ...ready,
      mode: "auto",
    };
  }

  const ready = await assertPaperclipApiReady(connection.apiBase ?? DEFAULT_PAPERCLIP_API_BASE);
  return {
    ...ready,
    mode: "custom-url",
  };
}

export function buildAddPaperclipArgs(input: {
  source: string;
  includeArg: string;
  target: TargetMode;
  agents?: string;
  collision?: CollisionMode;
  companyId?: string;
  newCompanyName?: string;
  dryRun?: boolean;
  yes?: boolean;
}): string[] {
  const args = [
    "company",
    "import",
    input.source,
    "--include",
    input.includeArg,
    "--target",
    input.target,
    "--agents",
    input.agents?.trim() || "all",
    "--collision",
    input.collision?.trim() || "rename",
  ];

  if (input.companyId) {
    args.push("--company-id", input.companyId);
  }
  if (input.newCompanyName) {
    args.push("--new-company-name", input.newCompanyName);
  }
  if (input.dryRun) {
    args.push("--dry-run");
  }
  if (input.yes) {
    args.push("--yes");
  }

  return args;
}

export function buildListPaperclipArgs(): string[] {
  return ["company", "list"];
}

export function buildExportPaperclipArgs(input: {
  companyId: string;
  outDir: string;
  includeArg: string;
  skills?: string;
  projects?: string;
  tasks?: string;
  projectTasks?: string;
  expandReferencedSkills?: boolean;
}): string[] {
  const args = [
    "company",
    "export",
    input.companyId,
    "--out",
    input.outDir,
    "--include",
    input.includeArg,
  ];

  const skills = normalizeTaskSelectors(input.skills);
  if (skills.length > 0) {
    args.push("--skills", skills.join(","));
  }

  const projects = normalizeTaskSelectors(input.projects);
  if (projects.length > 0) {
    args.push("--projects", projects.join(","));
  }

  const tasks = normalizeTaskSelectors(input.tasks);
  if (tasks.length > 0) {
    args.push("--issues", tasks.join(","));
  }

  const projectTasks = normalizeTaskSelectors(input.projectTasks);
  if (projectTasks.length > 0) {
    args.push("--project-issues", projectTasks.join(","));
  }

  if (input.expandReferencedSkills) {
    args.push("--expand-referenced-skills");
  }

  return args;
}

export async function handleAdd(source: string | undefined, options: AddOptions): Promise<void> {
  intro("companies");

  const provider = await pickProvider(options.provider, Boolean(options.yes));
  if (provider !== "paperclip") {
    fail("Only paperclip is supported.");
  }

  const prepared = await preparePaperclip(options);
  const paperclipOptions: AddOptions = {
    ...options,
    apiBase: prepared.apiBase,
  };

  const include = normalizeIncludeValues(options.include);
  printWarnings(include.warnings);

  const normalizedSource = await promptSource(source, Boolean(options.yes));
  const target = await promptTargetMode(options.target, Boolean(options.yes));

  const companyId = target === "existing"
    ? (options.companyId?.trim() || await promptExistingCompanyId(paperclipOptions))
    : undefined;
  const newCompanyName = target === "new"
    ? await promptNewCompanyName(options.newCompanyName, Boolean(options.yes))
    : undefined;

  const args = buildAddPaperclipArgs({
    source: normalizedSource,
    includeArg: include.includeArg,
    target,
    agents: options.agents,
    collision: options.collision,
    companyId,
    newCompanyName,
    dryRun: options.dryRun,
    yes: options.yes,
  });

  note(
    [
      `provider: ${provider}`,
      `paperclip: ${prepared.apiBase} (${prepared.mode}${prepared.startedServer ? ", started locally" : ""})`,
      `paperclipai: ${prepared.version}`,
      `source: ${normalizedSource}`,
      `target: ${target}${companyId ? ` (${companyId})` : ""}`,
      `include: ${include.includeArg}`,
    ].join("\n"),
    "Running",
  );

  await runPaperclip(args, paperclipOptions);
  outro("Paperclip import finished.");
}

export async function handleList(options: BaseOptions): Promise<void> {
  intro("companies");
  const provider = await pickProvider(options.provider, Boolean(options.yes));
  if (provider !== "paperclip") {
    fail("Only paperclip is supported.");
  }

  const prepared = await preparePaperclip(options);
  await runPaperclip(buildListPaperclipArgs(), {
    ...options,
    apiBase: prepared.apiBase,
  });
  outro("Paperclip company list finished.");
}

export async function handleExport(selector: string, options: ExportOptions): Promise<void> {
  intro("companies");
  const provider = await pickProvider(options.provider, Boolean(options.yes));
  if (provider !== "paperclip") {
    fail("Only paperclip is supported.");
  }

  const prepared = await preparePaperclip(options);
  const paperclipOptions: ExportOptions = {
    ...options,
    apiBase: prepared.apiBase,
  };

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

  const companyId = await resolveCompanySelector(selector, paperclipOptions);
  const args = buildExportPaperclipArgs({
    companyId,
    outDir,
    includeArg: include.includeArg,
    skills: options.skills,
    projects: options.projects,
    tasks: options.tasks,
    projectTasks: options.projectTasks,
    expandReferencedSkills: options.expandReferencedSkills,
  });

  await runPaperclip(args, paperclipOptions);
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
    .option("--connection <mode>", "Paperclip connection mode: auto | custom-url")
    .option("--include <values>", INCLUDE_OPTION_DESCRIPTION, "company,agents")
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
    .option("--connection <mode>", "Paperclip connection mode: auto | custom-url")
    .action((options: BaseOptions) => {
      handleList(options).catch((error) => fail(error instanceof Error ? error.message : String(error)));
    }),
);

addCommonOptions(
  program
    .command("export")
    .description("Export a provider company as a portable Agent Company package")
    .argument("<company>", "Company id, issue prefix, or exact company name")
    .option("--connection <mode>", "Paperclip connection mode: auto | custom-url")
    .option("--out <path>", "Output directory")
    .option("--include <values>", INCLUDE_OPTION_DESCRIPTION, "company,agents")
    .option("--skills <values>", "Comma-separated skill selectors to export")
    .option("--projects <values>", "Comma-separated project selectors to export")
    .option("--tasks <values>", "Comma-separated task selectors to export")
    .option("--project-tasks <values>", "Comma-separated project selectors whose tasks should be exported")
    .option("--expand-referenced-skills", "Vendor referenced skills into the export package", false)
    .action((company: string, options: ExportOptions) => {
      handleExport(company, options).catch((error) => fail(error instanceof Error ? error.message : String(error)));
    }),
);

const executedPath = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);

if (executedPath && modulePath === executedPath) {
  program.parseAsync().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
