export type ProviderName = "paperclip";

export interface IncludeNormalizationResult {
  includeArg: string;
  warnings: string[];
}

const PUBLIC_INCLUDE_TOKENS = new Set([
  "company",
  "agents",
  "projects",
  "tasks",
  "issues",
  "skills",
]);

const PAPERCLIP_INCLUDE_ORDER = ["company", "agents", "projects", "issues"] as const;

export function normalizeIncludeValues(input: string | undefined): IncludeNormalizationResult {
  const values = (input ?? "company,agents")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const warnings: string[] = [];
  const normalized = new Set<string>();

  for (const value of values) {
    if (!PUBLIC_INCLUDE_TOKENS.has(value)) {
      throw new Error(
        `Invalid --include value '${value}'. Use a comma-separated subset of company,agents,projects,tasks,issues,skills.`,
      );
    }

    if (value === "tasks") {
      normalized.add("issues");
      continue;
    }

    if (value === "skills") {
      warnings.push(
        "Paperclip does not expose separate skill include toggles yet. Skills currently ride along with the imported/exported company package.",
      );
      continue;
    }

    normalized.add(value);
  }

  if (normalized.size === 0) {
    throw new Error("At least one supported include value is required after normalization.");
  }

  return {
    includeArg: PAPERCLIP_INCLUDE_ORDER.filter((value) => normalized.has(value)).join(","),
    warnings,
  };
}

export function normalizeTaskSelectors(input: string | undefined): string[] {
  if (!input?.trim()) return [];
  return Array.from(
    new Set(
      input
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function resolveProvider(input: string | undefined): ProviderName {
  const provider = (input ?? "paperclip").trim().toLowerCase();
  if (provider !== "paperclip") {
    throw new Error(`Unsupported provider '${input}'. The current release supports only paperclip.`);
  }
  return "paperclip";
}
