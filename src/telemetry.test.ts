import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getTelemetryStateFilePath,
  prepareInstallTelemetry,
  sendInstallCompletedTelemetry,
} from "./telemetry.js";

type FetchMock = typeof globalThis.fetch;

function withEnv<T>(overrides: Record<string, string | undefined>, callback: () => Promise<T> | T): Promise<T> | T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  try {
    const result = callback();
    if (result && typeof (result as Promise<T>).then === "function") {
      return (result as Promise<T>).finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function withMockFetch<T>(mock: FetchMock, callback: () => Promise<T> | T): Promise<T> | T {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;

  const restore = () => {
    globalThis.fetch = previous;
  };

  try {
    const result = callback();
    if (result && typeof (result as Promise<T>).then === "function") {
      return (result as Promise<T>).finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test("prepareInstallTelemetry prompts once, stores consent, and resolves a local company slug", async () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), "companies-telemetry-"));

  await withEnv({
    XDG_CONFIG_HOME: configHome,
    COMPANIES_TELEMETRY: undefined,
    DISABLE_TELEMETRY: undefined,
    DO_NOT_TRACK: undefined,
    CI: undefined,
  }, async () => {
    const telemetry = await prepareInstallTelemetry("./fixtures/minimal-company", "new", {
      skipPrompts: false,
      isTTY: true,
      promptForConsent: async () => true,
    });

    assert.equal(telemetry.enabled, true);
    assert.equal(telemetry.companySlug, "minimal-company");
    assert.equal(telemetry.sourceKind, "local");
    assert.match(telemetry.installId ?? "", /^[0-9a-f-]{36}$/);

    const savedState = JSON.parse(fs.readFileSync(getTelemetryStateFilePath(), "utf8")) as {
      preference: string;
      installId: string;
    };
    assert.equal(savedState.preference, "enabled");
    assert.equal(savedState.installId, telemetry.installId);
  });
});

test("prepareInstallTelemetry stays disabled in non-interactive mode without explicit opt-in", async () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), "companies-telemetry-"));

  await withEnv({
    XDG_CONFIG_HOME: configHome,
    COMPANIES_TELEMETRY: undefined,
    DISABLE_TELEMETRY: undefined,
    DO_NOT_TRACK: undefined,
    CI: undefined,
  }, async () => {
    const telemetry = await prepareInstallTelemetry("./fixtures/minimal-company", "new", {
      skipPrompts: true,
      isTTY: false,
    });

    assert.equal(telemetry.enabled, false);
    assert.equal(fs.existsSync(getTelemetryStateFilePath()), false);
  });
});

test("prepareInstallTelemetry resolves GitHub company slugs via the GitHub contents API", async () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), "companies-telemetry-"));
  const markdown = [
    "---",
    "schema: agentcompanies/v1",
    "slug: github-company",
    "---",
    "",
    "# Example",
  ].join("\n");

  await withEnv({
    XDG_CONFIG_HOME: configHome,
    COMPANIES_TELEMETRY: "1",
    DISABLE_TELEMETRY: undefined,
    DO_NOT_TRACK: undefined,
    CI: undefined,
  }, async () => {
    await withMockFetch(async (input) => {
      const url = String(input);
      assert.match(url, /api\.github\.com\/repos\/paperclipai\/company-template\/contents\/company\/COMPANY\.md\?ref=main$/);

      return new Response(JSON.stringify({
        encoding: "base64",
        content: Buffer.from(markdown, "utf8").toString("base64"),
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }, async () => {
      const telemetry = await prepareInstallTelemetry(
        "https://github.com/paperclipai/company-template/tree/main/company",
        "existing",
        {
          skipPrompts: true,
          isTTY: false,
        },
      );

      assert.equal(telemetry.enabled, true);
      assert.equal(telemetry.companySlug, "github-company");
      assert.equal(telemetry.sourceKind, "github");
      assert.equal(telemetry.target, "existing");
    });
  });
});

test("prepareInstallTelemetry disables telemetry in CI even when explicitly enabled", async () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), "companies-telemetry-"));

  await withEnv({
    XDG_CONFIG_HOME: configHome,
    COMPANIES_TELEMETRY: "1",
    CI: "true",
    DISABLE_TELEMETRY: undefined,
    DO_NOT_TRACK: undefined,
  }, async () => {
    const telemetry = await prepareInstallTelemetry("./fixtures/minimal-company", "new", {
      skipPrompts: true,
      isTTY: false,
    });

    assert.equal(telemetry.enabled, false);
  });
});

test("sendInstallCompletedTelemetry posts the expected envelope and never throws", async () => {
  let requestBody: string | undefined;

  await withMockFetch(async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }, async () => {
    await sendInstallCompletedTelemetry({
      enabled: true,
      app: "companies-sh",
      event: "install.completed",
      ingestUrl: "https://telemetry.paperclip.ing/ingest",
      installId: "00000000-0000-4000-8000-000000000000",
      companySlug: "minimal-company",
      sourceKind: "local",
      target: "new",
    });
  });

  assert.ok(requestBody);
  const parsed = JSON.parse(requestBody) as {
    app: string;
    schemaVersion: string;
    installId: string;
    batchId: string;
    events: Array<{
      name: string;
      dimensions: Record<string, string>;
    }>;
  };

  assert.equal(parsed.app, "companies-sh");
  assert.equal(parsed.schemaVersion, "1");
  assert.equal(parsed.installId, "00000000-0000-4000-8000-000000000000");
  assert.match(parsed.batchId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(parsed.events[0]?.dimensions, {
    company_slug: "minimal-company",
    source_kind: "local",
    target: "new",
  });
});
