import { spawn } from "node:child_process";
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

export async function runPaperclip(args: string[], options: PaperclipRunOptions = {}): Promise<string> {
  const captureStdout = Boolean(options.captureStdout);
  const command = process.env.PAPERCLIPAI_CMD?.trim() || "paperclipai";
  const fullArgs = [...args, ...buildCommonPaperclipArgs(options)];

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, fullArgs, {
      stdio: captureStdout ? ["inherit", "pipe", "inherit"] : "inherit",
      env: process.env,
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
            `Could not find '${command}'. Install the Paperclip CLI or set PAPERCLIPAI_CMD to the executable path.`,
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

function appendFlag(args: string[], flag: string, value: string | undefined): void {
  if (!value?.trim()) return;
  args.push(flag, value.trim());
}
