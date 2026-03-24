import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  buildCommonPaperclipArgs,
  comparePaperclipVersions,
  DEFAULT_PAPERCLIP_API_BASE,
  isPaperclipVersionSupported,
  listPaperclipCompanies,
  resolveCompanySelector,
  resolvePaperclipCommand,
  resolveLocalPaperclipConnection,
  runPaperclip,
  setSpawnImplementationForTests,
} from "./paperclip.js";

function stubSpawn(options: { stdout?: string; exitCode?: number } = {}) {
  const calls: Array<[string, string[], childProcess.SpawnOptions]> = [];

  setSpawnImplementationForTests(((command: string, args: string[], spawnOptions?: childProcess.SpawnOptions) => {
    calls.push([command, args, spawnOptions ?? {}]);
    const child = new EventEmitter() as childProcess.ChildProcessWithoutNullStreams;
    const stdout = new PassThrough();

    Object.assign(child, {
      stdout,
      stderr: new PassThrough(),
      stdin: null,
    });

    queueMicrotask(() => {
      if (options.stdout) {
        stdout.write(options.stdout);
      }
      stdout.end();
      child.emit("exit", options.exitCode ?? 0);
    });

    return child;
  }) as typeof childProcess.spawn);

  return {
    calls,
    restore() {
      setSpawnImplementationForTests(null);
    },
  };
}

test("buildCommonPaperclipArgs appends shared CLI flags in order", () => {
  assert.deepEqual(
    buildCommonPaperclipArgs({
      config: "./config.json",
      dataDir: "./data",
      context: "./context.json",
      profile: "dev",
      apiBase: "http://localhost:3100",
      apiKey: "secret",
      json: true,
    }),
    [
      "--config",
      "./config.json",
      "--data-dir",
      "./data",
      "--context",
      "./context.json",
      "--profile",
      "dev",
      "--api-base",
      "http://localhost:3100",
      "--api-key",
      "secret",
      "--json",
    ],
  );
});

test("resolvePaperclipCommand supports prefixed commands from PAPERCLIPAI_CMD", () => {
  assert.deepEqual(
    resolvePaperclipCommand("pnpm --dir '/tmp/paperclip cli' paperclipai"),
    {
      command: "pnpm",
      prefixArgs: ["--dir", "/tmp/paperclip cli", "paperclipai"],
    },
  );
});

test("runPaperclip spawns the configured Paperclip command with translated args", async () => {
  const original = process.env.PAPERCLIPAI_CMD;
  process.env.PAPERCLIPAI_CMD = "pnpm --dir /tmp/paperclip paperclipai";

  const spawnMock = stubSpawn();
  try {
    await runPaperclip(["company", "list"], {
      captureStdout: true,
      config: "./config.json",
      profile: "dev",
    });
  } finally {
    spawnMock.restore();
    if (original === undefined) {
      delete process.env.PAPERCLIPAI_CMD;
    } else {
      process.env.PAPERCLIPAI_CMD = original;
    }
  }

  assert.equal(spawnMock.calls.length, 1);
  const [command, args, options] = spawnMock.calls[0] as [
    string,
    string[],
    childProcess.SpawnOptions,
  ];

  assert.equal(command, "pnpm");
  assert.deepEqual(args, ["--dir", "/tmp/paperclip", "paperclipai", "company", "list", "--config", "./config.json", "--profile", "dev"]);
  assert.equal(options.shell, false);
});

test("listPaperclipCompanies parses JSON output from paperclipai company list", async () => {
  const spawnMock = stubSpawn({
    stdout: JSON.stringify([{ id: "company-1", name: "Acme", issuePrefix: "AC" }]),
  });

  try {
    const companies = await listPaperclipCompanies({});
    assert.deepEqual(companies, [{ id: "company-1", name: "Acme", issuePrefix: "AC" }]);
  } finally {
    spawnMock.restore();
  }
});

test("resolveCompanySelector matches company issue prefix via company list lookup", async () => {
  const spawnMock = stubSpawn({
    stdout: JSON.stringify([
      { id: "company-1", name: "Acme", issuePrefix: "AC" },
      { id: "company-2", name: "Beta", issuePrefix: "BET" },
    ]),
  });

  try {
    const resolved = await resolveCompanySelector("bet", {});
    assert.equal(resolved, "company-2");
  } finally {
    spawnMock.restore();
  }
});

test("comparePaperclipVersions handles canary prereleases", () => {
  assert.equal(comparePaperclipVersions("2026.324.0-canary.2", "2026.324.0-canary.0") > 0, true);
  assert.equal(comparePaperclipVersions("2026.324.0", "2026.324.0-canary.9") > 0, true);
  assert.equal(comparePaperclipVersions("2026.318.0", "2026.324.0-canary.0") < 0, true);
});

test("isPaperclipVersionSupported enforces the minimum canary gate", () => {
  assert.equal(isPaperclipVersionSupported("2026.324.0-canary.0"), true);
  assert.equal(isPaperclipVersionSupported("2026.324.0-canary.2"), true);
  assert.equal(isPaperclipVersionSupported("2026.318.0"), false);
});

test("resolveLocalPaperclipConnection uses a discovered project config when present", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "companies-paperclip-config-"));
  const projectDir = path.join(tempRoot, "workspace", "nested");
  const configDir = path.join(tempRoot, "workspace", ".paperclip");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "config.json"),
    JSON.stringify({
      server: {
        host: "0.0.0.0",
        port: 4100,
      },
    }),
    "utf8",
  );

  try {
    const resolved = resolveLocalPaperclipConnection({}, projectDir, {});
    assert.equal(resolved.configExists, true);
    assert.equal(resolved.apiBase, "http://127.0.0.1:4100");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("resolveLocalPaperclipConnection falls back to the default local base when config is missing", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "companies-paperclip-default-"));

  try {
    const resolved = resolveLocalPaperclipConnection({ dataDir: path.join(tempRoot, "pc-home") }, tempRoot, {});
    assert.equal(resolved.configExists, false);
    assert.equal(resolved.apiBase, DEFAULT_PAPERCLIP_API_BASE);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("resolveLocalPaperclipConnection respects HOST and PORT env overrides before onboarding", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "companies-paperclip-env-"));

  try {
    const resolved = resolveLocalPaperclipConnection(
      { dataDir: path.join(tempRoot, "pc-home") },
      tempRoot,
      { HOST: "0.0.0.0", PORT: "3210" },
    );
    assert.equal(resolved.configExists, false);
    assert.equal(resolved.apiBase, "http://127.0.0.1:3210");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
