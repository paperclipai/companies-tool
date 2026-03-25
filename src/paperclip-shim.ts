#!/usr/bin/env node

import { accessSync, constants } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const childProcess = require("node:child_process") as typeof import("node:child_process");
const originalSpawn = childProcess.spawn.bind(childProcess) as (...args: any[]) => any;

function isBrowserOpenCommand(command: string, args: readonly string[]): boolean {
  if (command === "open" || command === "xdg-open") {
    return true;
  }

  return command === "cmd" && args[0] === "/c" && args[1] === "start";
}

function resolvePathCandidates(command: string): string[] {
  if (isAbsolute(command)) {
    return [command];
  }

  const pathValue = process.env.PATH ?? "";
  if (!pathValue) {
    return [];
  }

  return pathValue
    .split(delimiter)
    .filter(Boolean)
    .map((entry) => resolve(join(entry, command)));
}

function commandExists(command: string): boolean {
  for (const candidate of resolvePathCandidates(command)) {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      // Try the next candidate.
    }
  }

  return false;
}

childProcess.spawn = ((command: string, ...rest: any[]) => {
  const args = Array.isArray(rest[0]) ? rest[0] : [];
  const normalizedArgs = args.map((value: unknown) => String(value));

  if (isBrowserOpenCommand(command, normalizedArgs) && !commandExists(command)) {
    const error = Object.assign(new Error(`spawn ${command} ENOENT`), {
      errno: -2,
      code: "ENOENT",
      syscall: `spawn ${command}`,
      path: command,
      spawnargs: normalizedArgs,
    });
    throw error;
  }

  return originalSpawn(command, ...rest);
}) as unknown as typeof import("node:child_process").spawn;

syncBuiltinESMExports();

const packageJsonPath = require.resolve("paperclipai/package.json");
const paperclipEntryUrl = pathToFileURL(resolve(packageJsonPath, "..", "dist", "index.js")).href;

await import(paperclipEntryUrl);
