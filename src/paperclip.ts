import * as childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pc from "picocolors";

export interface CommonPaperclipOptions {
  config?: string;
  dataDir?: string;
  context?: string;
  profile?: string;
  apiBase?: string;
  apiKey?: string;
  companyId?: string;
  json?: boolean;
}

export interface PaperclipRunOptions extends CommonPaperclipOptions {
  captureStdout?: boolean;
}

export interface PaperclipCompanyRecord {
  id: string;
  name: string;
  issuePrefix?: string | null;
  status?: string | null;
  budgetMonthlyCents?: number | null;
  spentMonthlyCents?: number | null;
}

export interface PaperclipConnectionResolution {
  apiBase: string;
  configExists: boolean;
  configPath: string;
}

export interface PaperclipBootstrapResult {
  apiBase: string;
  startedServer: boolean;
  version: string;
}

export const DEFAULT_PAPERCLIP_API_BASE = "http://127.0.0.1:3100";
export const MINIMUM_PAPERCLIP_VERSION = "2026.325.0";
export const DEFAULT_PAPERCLIP_READY_TIMEOUT_MS = 120_000;

const require = createRequire(import.meta.url);
const STRIPPED_PAPERCLIP_CHILD_ENV_KEYS = [
  "PAPERCLIP_AGENT_ID",
  "PAPERCLIP_API_KEY",
  "PAPERCLIP_API_URL",
  "PAPERCLIP_APPROVAL_ID",
  "PAPERCLIP_APPROVAL_STATUS",
  "PAPERCLIP_AUTH_BASE_URL_MODE",
  "PAPERCLIP_COMPANY_ID",
  "PAPERCLIP_DEPLOYMENT_EXPOSURE",
  "PAPERCLIP_DEPLOYMENT_MODE",
  "PAPERCLIP_DEV_SERVER_STATUS_FILE",
  "PAPERCLIP_LINKED_ISSUE_IDS",
  "PAPERCLIP_LISTEN_HOST",
  "PAPERCLIP_LISTEN_PORT",
  "PAPERCLIP_RUN_ID",
  "PAPERCLIP_TASK_ID",
  "PAPERCLIP_UI_DEV_MIDDLEWARE",
  "PAPERCLIP_WAKE_COMMENT_ID",
  "PAPERCLIP_WAKE_REASON",
  "PAPERCLIP_WORKSPACE_CWD",
  "PAPERCLIP_WORKSPACE_ID",
  "PAPERCLIP_WORKSPACE_REPO_URL",
  "PAPERCLIP_WORKSPACES_JSON",
];

export function buildCommonPaperclipArgs(options: CommonPaperclipOptions): string[] {
  const args: string[] = [];
  appendFlag(args, "--config", options.config);
  appendFlag(args, "--data-dir", options.dataDir);
  appendFlag(args, "--context", options.context);
  appendFlag(args, "--profile", options.profile);
  appendFlag(args, "--api-base", options.apiBase);
  appendFlag(args, "--api-key", options.apiKey);
  if (options.json) {
    args.push("--json");
  }
  return args;
}

export interface PaperclipCommand {
  command: string;
  prefixArgs: string[];
}

export type SpawnImplementation = typeof childProcess.spawn;

let spawnImplementation: SpawnImplementation = childProcess.spawn;

export function setSpawnImplementationForTests(next: SpawnImplementation | null): void {
  spawnImplementation = next ?? childProcess.spawn;
}

export function sanitizePaperclipChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sanitized = { ...env };

  for (const key of STRIPPED_PAPERCLIP_CHILD_ENV_KEYS) {
    delete sanitized[key];
  }

  return sanitized;
}

export function resolvePaperclipCommand(raw = process.env.PAPERCLIPAI_CMD?.trim()): PaperclipCommand {
  if (!raw) {
    const bundledShim = resolveBundledPaperclipShim();
    if (bundledShim) {
      return {
        command: process.execPath,
        prefixArgs: [bundledShim],
      };
    }

    return {
      command: "paperclipai",
      prefixArgs: [],
    };
  }

  const tokens = splitCommandString(raw);
  const [command, ...prefixArgs] = tokens;
  if (!command) {
    throw new Error("PAPERCLIPAI_CMD must not be empty.");
  }

  return { command, prefixArgs };
}

export async function runPaperclip(args: string[], options: PaperclipRunOptions = {}): Promise<string> {
  const captureStdout = Boolean(options.captureStdout);
  const { command, prefixArgs } = resolvePaperclipCommand();
  const fullArgs = [...prefixArgs, ...args, ...buildCommonPaperclipArgs(options)];

  return await new Promise<string>((resolve, reject) => {
    const child = spawnImplementation(command, fullArgs, {
      stdio: captureStdout ? ["inherit", "pipe", "inherit"] : "inherit",
      env: sanitizePaperclipChildEnv(process.env),
      shell: false,
    });

    let stdout = "";
    if (captureStdout && child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
    }

    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `Could not find '${command}'. Install the Paperclip CLI or set PAPERCLIPAI_CMD to the executable path or command.`,
          ),
        );
        return;
      }
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`Paperclip command failed with exit code ${code}.`));
    });
  });
}

export async function listPaperclipCompanies(
  options: CommonPaperclipOptions,
): Promise<PaperclipCompanyRecord[]> {
  const output = await runPaperclip(["company", "list", "--json"], {
    ...options,
    json: false,
    captureStdout: true,
  });
  const parsed = JSON.parse(output) as PaperclipCompanyRecord[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function resolveCompanySelector(
  selector: string,
  options: CommonPaperclipOptions,
): Promise<string> {
  const trimmed = selector.trim();
  if (!trimmed) {
    throw new Error("A company selector is required.");
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }

  const companies = await listPaperclipCompanies(options);
  const lower = trimmed.toLowerCase();
  const match = companies.find((company) =>
    company.id === trimmed
    || company.name.toLowerCase() === lower
    || company.issuePrefix?.toLowerCase() === lower,
  );

  if (!match) {
    throw new Error(`Could not resolve company selector '${selector}'. Use a company id, name, or issue prefix.`);
  }

  return match.id;
}

export function printWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.error(pc.yellow(`warning: ${warning}`));
  }
}

export function normalizeApiBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Paperclip API base URL must not be empty.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid Paperclip API base URL '${input}'.`);
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`Unsupported Paperclip API base URL '${input}'. Use http:// or https://.`);
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

export function comparePaperclipVersions(left: string, right: string): number {
  const leftParsed = parsePaperclipVersion(left);
  const rightParsed = parsePaperclipVersion(right);

  if (leftParsed && rightParsed) {
    return compareParsedVersion(leftParsed, rightParsed);
  }

  if (left === right) return 0;
  return left.localeCompare(right);
}

export function isPaperclipVersionSupported(version: string): boolean {
  return comparePaperclipVersions(version, MINIMUM_PAPERCLIP_VERSION) >= 0;
}

export async function getPaperclipVersion(): Promise<string> {
  const output = await runPaperclip(["--version"], { captureStdout: true });
  return output.trim();
}

export function resolveLocalPaperclipConnection(
  options: Pick<CommonPaperclipOptions, "config" | "dataDir">,
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): PaperclipConnectionResolution {
  const configPath = resolveLocalPaperclipConfigPath(options, cwd, env);
  const configExists = fs.existsSync(configPath);
  return {
    apiBase: configExists ? readApiBaseFromConfig(configPath) : resolveDefaultLocalApiBase(env),
    configExists,
    configPath,
  };
}

export async function isPaperclipApiReachable(apiBase: string, timeoutMs = 1_500): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${normalizeApiBase(apiBase)}/api/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function ensurePaperclipVersion(): Promise<string> {
  const version = await getPaperclipVersion();
  if (!isPaperclipVersionSupported(version)) {
    throw new Error(
      `companies.sh requires paperclipai ${MINIMUM_PAPERCLIP_VERSION} or newer. Found ${version}. ` +
      "Install a newer stable paperclipai release or point PAPERCLIPAI_CMD at a newer build.",
    );
  }
  return version;
}

export async function ensureLocalPaperclipReady(
  options: Pick<CommonPaperclipOptions, "config" | "dataDir">,
): Promise<PaperclipBootstrapResult> {
  const version = await ensurePaperclipVersion();

  let connection = resolveLocalPaperclipConnection(options);
  if (await isPaperclipApiReachable(connection.apiBase)) {
    return {
      apiBase: connection.apiBase,
      startedServer: false,
      version,
    };
  }

  if (!connection.configExists) {
    launchPaperclipInBackground(["onboard", "--yes"], pickSetupOptions(options));
    await waitForPaperclipApi(connection.apiBase);
    return {
      apiBase: connection.apiBase,
      startedServer: true,
      version,
    };
  }

  launchPaperclipInBackground(["run"], pickSetupOptions(options));
  await waitForPaperclipApi(connection.apiBase);

  return {
    apiBase: connection.apiBase,
    startedServer: true,
    version,
  };
}

export async function assertPaperclipApiReady(
  apiBase: string,
): Promise<PaperclipBootstrapResult> {
  const version = await ensurePaperclipVersion();
  const normalizedApiBase = normalizeApiBase(apiBase);
  if (!await isPaperclipApiReachable(normalizedApiBase, 3_000)) {
    throw new Error(
      `Could not reach Paperclip at ${normalizedApiBase}. Start Paperclip there or use auto connection mode.`,
    );
  }

  return {
    apiBase: normalizedApiBase,
    startedServer: false,
    version,
  };
}

function appendFlag(args: string[], flag: string, value: string | undefined): void {
  if (!value?.trim()) return;
  args.push(flag, value.trim());
}

function splitCommandString(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += "\\";
  }

  if (quote) {
    throw new Error(`Unterminated quote in PAPERCLIPAI_CMD: ${input}`);
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function pickSetupOptions(
  options: Pick<CommonPaperclipOptions, "config" | "dataDir">,
): CommonPaperclipOptions {
  return {
    ...(options.config?.trim() ? { config: options.config.trim() } : {}),
    ...(options.dataDir?.trim() ? { dataDir: options.dataDir.trim() } : {}),
  };
}

function launchPaperclipInBackground(
  commandArgs: string[],
  options: Pick<CommonPaperclipOptions, "config" | "dataDir">,
): void {
  const { command, prefixArgs } = resolvePaperclipCommand();
  const child = spawnImplementation(command, [...prefixArgs, ...commandArgs, ...buildCommonPaperclipArgs(options)], {
    stdio: "ignore",
    detached: true,
    shell: false,
    env: {
      ...sanitizePaperclipChildEnv(process.env),
      PAPERCLIP_OPEN_ON_LISTEN: "false",
    },
  });

  child.unref();
}

async function waitForPaperclipApi(apiBase: string, timeoutMs = resolvePaperclipReadyTimeoutMs()): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPaperclipApiReachable(apiBase, 2_000)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Paperclip did not become ready at ${apiBase} within ${Math.round(timeoutMs / 1000)} seconds.`,
  );
}

function resolveBundledPaperclipShim(): string | null {
  try {
    require.resolve("paperclipai/package.json");
    const shimPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "paperclip-shim.js",
    );
    if (!fs.existsSync(shimPath)) {
      return null;
    }
    return shimPath;
  } catch {
    return null;
  }
}

function resolveLocalPaperclipConfigPath(
  options: Pick<CommonPaperclipOptions, "config" | "dataDir">,
  cwd: string,
  env: NodeJS.ProcessEnv,
): string {
  if (options.config?.trim()) {
    return path.resolve(options.config.trim());
  }

  if (env.PAPERCLIP_CONFIG?.trim()) {
    return path.resolve(env.PAPERCLIP_CONFIG.trim());
  }

  const ancestorConfig = findConfigFileFromAncestors(cwd);
  if (ancestorConfig) {
    return ancestorConfig;
  }

  const homeDir = options.dataDir?.trim()
    ? path.resolve(options.dataDir.trim())
    : env.PAPERCLIP_HOME?.trim()
      ? path.resolve(env.PAPERCLIP_HOME.trim())
      : path.resolve(os.homedir(), ".paperclip");
  const instanceId = env.PAPERCLIP_INSTANCE_ID?.trim() || "default";
  return path.resolve(homeDir, "instances", instanceId, "config.json");
}

function findConfigFileFromAncestors(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    const candidate = path.resolve(currentDir, ".paperclip", "config.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const nextDir = path.resolve(currentDir, "..");
    if (nextDir === currentDir) {
      return null;
    }
    currentDir = nextDir;
  }
}

function readApiBaseFromConfig(configPath: string): string {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      auth?: { publicBaseUrl?: string };
      server?: { host?: string; port?: number };
    };
    const publicBaseUrl = raw.auth?.publicBaseUrl?.trim();
    if (publicBaseUrl) {
      return normalizeApiBase(publicBaseUrl);
    }

    const port = Number(raw.server?.port);
    const safePort = Number.isFinite(port) && port > 0 ? port : 3100;
    const host = normalizeLocalHost(raw.server?.host);
    return normalizeApiBase(`http://${host}:${safePort}`);
  } catch {
    return DEFAULT_PAPERCLIP_API_BASE;
  }
}

function resolveDefaultLocalApiBase(env: NodeJS.ProcessEnv): string {
  const publicBaseUrl =
    env.PAPERCLIP_PUBLIC_URL?.trim()
    || env.PAPERCLIP_AUTH_PUBLIC_BASE_URL?.trim()
    || env.BETTER_AUTH_URL?.trim()
    || env.BETTER_AUTH_BASE_URL?.trim();
  if (publicBaseUrl) {
    try {
      return normalizeApiBase(publicBaseUrl);
    } catch {
      // Fall through to HOST/PORT defaults.
    }
  }

  const host = normalizeLocalHost(env.HOST);
  const port = Number(env.PORT);
  const safePort = Number.isFinite(port) && port > 0 ? port : 3100;
  return normalizeApiBase(`http://${host}:${safePort}`);
}

function normalizeLocalHost(host: string | undefined): string {
  const trimmed = host?.trim();
  if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::") {
    return "127.0.0.1";
  }
  if (trimmed === "localhost") {
    return "127.0.0.1";
  }
  return trimmed;
}

function resolvePaperclipReadyTimeoutMs(): number {
  const raw = process.env.COMPANIES_PAPERCLIP_START_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_PAPERCLIP_READY_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAPERCLIP_READY_TIMEOUT_MS;
  }
  return parsed;
}

type ParsedPaperclipVersion = {
  main: number[];
  prerelease: Array<number | string>;
};

function parsePaperclipVersion(input: string): ParsedPaperclipVersion | null {
  const match = input.trim().match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;

  return {
    main: match[1].split(".").map((part) => Number(part)),
    prerelease: match[2]
      ? match[2].split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part))
      : [],
  };
}

function compareParsedVersion(left: ParsedPaperclipVersion, right: ParsedPaperclipVersion): number {
  const maxMainLength = Math.max(left.main.length, right.main.length);
  for (let index = 0; index < maxMainLength; index += 1) {
    const leftPart = left.main[index] ?? 0;
    const rightPart = right.main[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }
  if (left.prerelease.length === 0) {
    return 1;
  }
  if (right.prerelease.length === 0) {
    return -1;
  }

  const maxPreLength = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < maxPreLength; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart > rightPart ? 1 : -1;
    }
    if (typeof leftPart === "number") return -1;
    if (typeof rightPart === "number") return 1;
    return leftPart.localeCompare(rightPart);
  }

  return 0;
}
