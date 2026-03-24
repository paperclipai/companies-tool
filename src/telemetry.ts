import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const TELEMETRY_APP = "companies-sh";
const TELEMETRY_SCHEMA_VERSION = "1";
const TELEMETRY_EVENT = "install.completed";
const TELEMETRY_STATE_VERSION = 1;
const INSTALL_ID_ROTATION_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_TELEMETRY_INGEST_URL = "https://rusqrrg391.execute-api.us-east-1.amazonaws.com/ingest";

type SourceKind = "github" | "local" | "url" | "unknown";
type TelemetryPreference = "enabled" | "disabled";

interface TelemetryState {
  version: number;
  preference: TelemetryPreference;
  installId?: string;
  installIdCreatedAt?: string;
  updatedAt: string;
}

interface GitHubSourceCandidate {
  owner: string;
  repo: string;
  ref?: string;
  subpath: string;
}

export interface InstallTelemetryContext {
  enabled: boolean;
  app: string;
  event: string;
  ingestUrl: string;
  installId?: string;
  companySlug?: string;
  sourceKind: SourceKind;
  target: "new" | "existing";
}

export interface TelemetryConsentPreview {
  title: string;
  body: string;
}

export interface PrepareInstallTelemetryOptions {
  skipPrompts: boolean;
  isTTY: boolean;
  promptForConsent?: (preview: TelemetryConsentPreview) => Promise<boolean>;
}

function isCI(): boolean {
  return Boolean(
    process.env.CI
    || process.env.GITHUB_ACTIONS
    || process.env.GITLAB_CI
    || process.env.CIRCLECI
    || process.env.TRAVIS
    || process.env.BUILDKITE
    || process.env.JENKINS_URL
    || process.env.TEAMCITY_VERSION,
  );
}

function isDisabledByPolicy(): boolean {
  return Boolean(process.env.DISABLE_TELEMETRY || process.env.DO_NOT_TRACK || isCI());
}

function parseExplicitPreference(value: string | undefined): TelemetryPreference | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enable", "enabled"].includes(normalized)) {
    return "enabled";
  }
  if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) {
    return "disabled";
  }
  return undefined;
}

function getTelemetryStatePath(): string {
  const configHome = process.env.XDG_CONFIG_HOME?.trim()
    || path.join(os.homedir(), ".config");
  return path.join(configHome, "companies.sh", "telemetry.json");
}

function readTelemetryState(): TelemetryState | null {
  try {
    const parsed = JSON.parse(readFileSync(getTelemetryStatePath(), "utf8")) as Partial<TelemetryState>;
    if (parsed.version !== TELEMETRY_STATE_VERSION) {
      return null;
    }
    if (parsed.preference !== "enabled" && parsed.preference !== "disabled") {
      return null;
    }
    if (typeof parsed.updatedAt !== "string") {
      return null;
    }
    return parsed as TelemetryState;
  } catch {
    return null;
  }
}

function writeTelemetryState(state: TelemetryState): void {
  const statePath = getTelemetryStatePath();
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function ensureInstallId(state: TelemetryState): TelemetryState {
  if (state.preference !== "enabled") {
    return state;
  }

  const createdAt = state.installIdCreatedAt ? Date.parse(state.installIdCreatedAt) : NaN;
  const shouldRotate = !state.installId
    || !Number.isFinite(createdAt)
    || (Date.now() - createdAt) >= INSTALL_ID_ROTATION_MS;

  if (!shouldRotate) {
    return state;
  }

  const now = new Date().toISOString();
  return {
    ...state,
    installId: randomUUID(),
    installIdCreatedAt: now,
    updatedAt: now,
  };
}

function buildPreview(context: {
  app: string;
  event: string;
  companySlug?: string;
  sourceKind: SourceKind;
  target: "new" | "existing";
  ingestUrl: string;
}): TelemetryConsentPreview {
  const companyLine = context.companySlug
    ? `- company slug: \`${context.companySlug}\``
    : "- company slug: not resolved, so no event will be sent";

  return {
    title: "Telemetry",
    body: [
      "If enabled, `companies.sh` will send one anonymous event after a successful import.",
      "",
      `- app: \`${context.app}\``,
      `- event: \`${context.event}\``,
      companyLine,
      `- source kind: \`${context.sourceKind}\``,
      `- target: \`${context.target}\``,
      "- install id: pseudonymous UUID stored locally and rotated every 30 days",
      "- repo URLs, local paths, company names, and command arguments are not sent",
      `- endpoint: \`${context.ingestUrl}\``,
      "",
      "Telemetry stays disabled in CI and can be turned off later with `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1`.",
    ].join("\n"),
  };
}

function resolveSourceKind(source: string): SourceKind {
  if (source.startsWith(".") || source.startsWith("/")) {
    return "local";
  }

  if (/^git@github\.com:/i.test(source)) {
    return "github";
  }

  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      if (url.hostname === "github.com") {
        return "github";
      }
      return "url";
    } catch {
      return "unknown";
    }
  }

  return "unknown";
}

function parseFrontmatterStringValue(markdown: string, key: string): string | undefined {
  const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    return undefined;
  }

  const line = frontmatterMatch[1]
    .split(/\r?\n/)
    .find((entry) => entry.trim().toLowerCase().startsWith(`${key.toLowerCase()}:`));

  if (!line) {
    return undefined;
  }

  const rawValue = line.slice(line.indexOf(":") + 1).trim();
  if (!rawValue) {
    return undefined;
  }

  return rawValue.replace(/^['"]|['"]$/g, "");
}

function normalizeCompanySlug(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return /^[a-z0-9][a-z0-9_-]{1,63}$/.test(normalized) ? normalized : undefined;
}

function readLocalCompanySlug(source: string): string | undefined {
  try {
    const resolvedPath = path.resolve(source);
    const stats = statSync(resolvedPath);
    const companyPath = stats.isDirectory()
      ? path.join(resolvedPath, "COMPANY.md")
      : resolvedPath;
    const markdown = readFileSync(companyPath, "utf8");
    return normalizeCompanySlug(parseFrontmatterStringValue(markdown, "slug"));
  } catch {
    return undefined;
  }
}

function parseGitHubCandidates(source: string): GitHubSourceCandidate[] {
  const parsedSsh = source.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (parsedSsh) {
    return [{
      owner: parsedSsh[1],
      repo: parsedSsh[2],
      subpath: "",
    }];
  }

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return [];
  }

  if (url.hostname !== "github.com") {
    return [];
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return [];
  }

  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/i, "");

  if (segments[2] !== "tree") {
    return [{ owner, repo, subpath: "" }];
  }

  const treeSegments = segments.slice(3);
  if (treeSegments.length === 0) {
    return [{ owner, repo, subpath: "" }];
  }

  const candidates: GitHubSourceCandidate[] = [];
  for (let index = 1; index <= treeSegments.length; index += 1) {
    candidates.push({
      owner,
      repo,
      ref: treeSegments.slice(0, index).join("/"),
      subpath: treeSegments.slice(index).join("/"),
    });
  }

  return candidates;
}

async function fetchGitHubCompanySlug(source: string): Promise<string | undefined> {
  const candidates = parseGitHubCandidates(source);

  for (const candidate of candidates) {
    const companyPath = candidate.subpath
      ? `${candidate.subpath.replace(/^\/+|\/+$/g, "")}/COMPANY.md`
      : "COMPANY.md";
    const endpoint = new URL(
      `/repos/${candidate.owner}/${candidate.repo}/contents/${companyPath}`,
      "https://api.github.com",
    );
    if (candidate.ref) {
      endpoint.searchParams.set("ref", candidate.ref);
    }

    try {
      const response = await fetch(endpoint, {
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": "companies.sh",
        },
      });

      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        return undefined;
      }

      const payload = await response.json() as { content?: string; encoding?: string };
      if (payload.encoding !== "base64" || typeof payload.content !== "string") {
        return undefined;
      }

      const markdown = Buffer.from(payload.content, "base64").toString("utf8");
      return normalizeCompanySlug(parseFrontmatterStringValue(markdown, "slug"));
    } catch {
      return undefined;
    }
  }

  return undefined;
}

async function resolveCompanySlug(source: string): Promise<string | undefined> {
  const sourceKind = resolveSourceKind(source);
  if (sourceKind === "local") {
    return readLocalCompanySlug(source);
  }
  if (sourceKind === "github") {
    return await fetchGitHubCompanySlug(source);
  }
  return undefined;
}

export async function prepareInstallTelemetry(
  source: string,
  target: "new" | "existing",
  options: PrepareInstallTelemetryOptions,
): Promise<InstallTelemetryContext> {
  const ingestUrl = process.env.COMPANIES_TELEMETRY_INGEST_URL?.trim() || DEFAULT_TELEMETRY_INGEST_URL;
  const sourceKind = resolveSourceKind(source);
  const companySlug = await resolveCompanySlug(source);

  const baseContext: InstallTelemetryContext = {
    enabled: false,
    app: TELEMETRY_APP,
    event: TELEMETRY_EVENT,
    ingestUrl,
    companySlug,
    sourceKind,
    target,
  };

  if (isDisabledByPolicy()) {
    return baseContext;
  }

  const explicitPreference = parseExplicitPreference(process.env.COMPANIES_TELEMETRY);
  let state = readTelemetryState();

  if (explicitPreference) {
    state = ensureInstallId({
      version: TELEMETRY_STATE_VERSION,
      preference: explicitPreference,
      installId: state?.installId,
      installIdCreatedAt: state?.installIdCreatedAt,
      updatedAt: new Date().toISOString(),
    });
    writeTelemetryState(state);
  }

  if (!state && !options.skipPrompts && options.isTTY && options.promptForConsent) {
    const consented = await options.promptForConsent(buildPreview({
      app: TELEMETRY_APP,
      event: TELEMETRY_EVENT,
      companySlug,
      sourceKind,
      target,
      ingestUrl,
    }));
    state = ensureInstallId({
      version: TELEMETRY_STATE_VERSION,
      preference: consented ? "enabled" : "disabled",
      updatedAt: new Date().toISOString(),
    });
    writeTelemetryState(state);
  }

  if (!state || state.preference !== "enabled") {
    return baseContext;
  }

  state = ensureInstallId(state);
  writeTelemetryState(state);

  return {
    ...baseContext,
    enabled: Boolean(state.installId && companySlug),
    installId: state.installId,
  };
}

export async function sendInstallCompletedTelemetry(context: InstallTelemetryContext): Promise<void> {
  if (!context.enabled || !context.installId || !context.companySlug) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);

  try {
    await fetch(context.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app: context.app,
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        installId: context.installId,
        batchId: randomUUID(),
        events: [{
          name: context.event,
          occurredAt: new Date().toISOString(),
          dimensions: {
            company_slug: context.companySlug,
            source_kind: context.sourceKind,
            target: context.target,
          },
        }],
      }),
      signal: controller.signal,
    });
  } catch {
    // Telemetry must never affect the CLI result.
  } finally {
    clearTimeout(timeout);
  }
}

export function getTelemetryStateFilePath(): string {
  return getTelemetryStatePath();
}
