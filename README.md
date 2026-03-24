# [companies.sh](https://companies.sh)

An installer for the [Agent Companies](https://companies.io) open standard.

`companies.sh` imports Agent Company packages from GitHub repos, direct URLs, or local folders into any supported agent orchestrator. The current release ships with a [Paperclip](https://paperclip.ing) provider, and the architecture is designed so that additional orchestrators can be added as providers.

> Browse companies to install at [companies.sh](https://companies.sh)

## Import a Company

The npm package is `companies.sh`. It installs the `companies.sh` executable and keeps `companies` as a compatibility alias.

```bash
npx companies.sh add paperclipai/company-template
```

### Common Flows

```bash
# Interactive import
npx companies.sh add

# Interactive import with the local Paperclip auto-bootstrap flow
npx companies.sh add ./fixtures/minimal-company

# Import from GitHub into a new Paperclip company
npx companies.sh add paperclipai/company-template --target new

# Import into an existing company
npx companies.sh add paperclipai/company-template --target existing -C <company-id>

# Preview an import without applying changes
npx companies.sh add ./my-company --target existing -C <company-id> --dry-run

# Import company metadata and agents only (default)
npx companies.sh add paperclipai/company-template --include company,agents

# Import the full package
npx companies.sh add paperclipai/company-template --include company,agents,projects,tasks,skills

# Import specific agents only
npx companies.sh add paperclipai/company-template --agents ceo,cto

# Non-interactive usage for scripts or CI
npx companies.sh add paperclipai/company-template --target new -y

# Use an already-running Paperclip instance at a specific URL
npx companies.sh add paperclipai/company-template --connection custom-url --api-base http://127.0.0.1:3100
```

### Source Formats

```bash
# GitHub shorthand
npx companies.sh add paperclipai/company-template

# Full GitHub URL
npx companies.sh add https://github.com/paperclipai/company-template

# Direct tree URL
npx companies.sh add https://github.com/paperclipai/company-template/tree/main/company

# Local path
npx companies.sh add ./my-company
```

### Options

| Option                      | Description                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `-p, --provider <provider>` | Destination orchestrator. Default: `paperclip`.                                              |
| `--target <mode>`           | Import into a `new` or `existing` Paperclip company.                                         |
| `-C, --company-id <id>`     | Target company id when using `--target existing`.                                            |
| `--new-company-name <name>` | Override the imported company name when using `--target new`.                                |
| `--include <values>`        | Comma-separated subset of `company,agents,projects,tasks,skills`. Default: `company,agents`. |
| `--agents <list>`           | Comma-separated agent slugs to import, or `all`. Default: `all`.                             |
| `--collision <mode>`        | Collision strategy: `rename`, `skip`, or `replace`. Default: `rename`.                       |
| `--dry-run`                 | Preview the import without applying it.                                                      |
| `-y, --yes`                 | Skip interactive prompts.                                                                    |
| `--connection <mode>`       | Paperclip connection mode: `auto` or `custom-url`. Default: `auto`.                          |

### Paperclip Connection Flags

Use these when the Paperclip CLI needs explicit connection or profile settings:

| Flag                    | Description                           |
| ----------------------- | ------------------------------------- |
| `-c, --config <path>`   | Path to a Paperclip config file.      |
| `-d, --data-dir <path>` | Paperclip data directory root.        |
| `--context <path>`      | Path to a Paperclip CLI context file. |
| `--profile <name>`      | Paperclip CLI context profile name.   |
| `--api-base <url>`      | Paperclip API base URL override.      |
| `--api-key <token>`     | Paperclip API key override.           |

### Connection Modes

- `auto` is the default. It checks the local Paperclip config, falls back to `http://127.0.0.1:3100`, runs `paperclipai onboard --yes` when no config exists yet, and starts `paperclipai run` if the server is not already up.
- `custom-url` skips the local bootstrap and expects a reachable Paperclip instance at `--api-base`.

`companies.sh` requires a recent Paperclip build for the company import flow. This repo currently pins `paperclipai@2026.324.0-canary.7`, and the wrapper rejects versions older than `2026.324.0-canary.0`.

## Telemetry

`companies.sh` can send one anonymous event after a successful import to help us understand package adoption.

- Telemetry is strict opt-in.
- The first interactive `add` run shows a preview of the exact fields before anything is sent.
- Telemetry stays disabled in CI environments.
- The event payload uses a pseudonymous install id that rotates every 30 days.
- Repo URLs, local paths, company names, and command arguments are not sent.

Successful import events include only:

- the app slug: `companies-sh`
- the event name: `install.completed`
- the package `company_slug` from `COMPANY.md`
- the source kind (`github`, `local`, or `url`)
- the target mode (`new` or `existing`)

Preference is stored locally at `~/.config/companies.sh/telemetry.json` unless `XDG_CONFIG_HOME` overrides the base path. Remove that file to reset consent or rotate the install id immediately.

## Package Layout

An Agent Company is a markdown-first package that describes an AI company as portable files:

| File         | Purpose                                           |
| ------------ | ------------------------------------------------- |
| `COMPANY.md` | Company metadata and configuration                |
| `AGENTS.md`  | Agent definitions, roles, and reporting structure |
| `PROJECT.md` | Project definitions and workspace bindings        |
| `TASK.md`    | Pre-loaded tasks and assignments                  |
| `SKILL.md`   | Reusable skills available to agents               |

## How It Works

1. Resolve the source package from GitHub, a direct URL, or a local path.
2. Connect to the target orchestrator (Paperclip by default).
3. Prompt for the target company unless flags already provide it.
4. Normalize the requested include set and agent filters.
5. Execute the import through the orchestrator's CLI.

`companies.sh` is a convenience wrapper — the chosen orchestrator performs the actual import.

## Adding a Provider

`companies.sh` is provider-based. Paperclip is the first supported provider, but the architecture accepts additional agent orchestrators.

If you build an agent orchestrator that supports the [Agent Companies](https://companies.io) open standard and want it available as a `companies.sh` provider, open a pull request or an issue on this repo with:

- The orchestrator name and a link to its documentation.
- A description of how it imports Agent Company packages.
- A CLI or SDK that `companies.sh` can shell out to for the import flow.

We welcome contributions from the community to make Agent Companies portable across orchestrators.

## Troubleshooting

### Use a different `paperclipai` build

The CLI ships with a bundled `paperclipai`, but you can override it with `PAPERCLIPAI_CMD`:

```bash
export PAPERCLIPAI_CMD=/path/to/paperclipai
```

`PAPERCLIPAI_CMD` can also include prefix arguments:

```bash
export PAPERCLIPAI_CMD="pnpm --dir /path/to/paperclip paperclipai"
```

If you override the command, `companies.sh` still requires `paperclipai >= 2026.324.0-canary.0`.

### Import fails with collision errors

Use `--collision skip` to ignore conflicting entities, or `--collision replace` to overwrite them.

### Dry-run shows nothing to import

Confirm the source contains valid Agent Company files such as `COMPANY.md` and `AGENTS.md` at the expected paths.

### Local auto-bootstrap times out on slow machines or Docker

The wrapper waits for a local Paperclip instance to become healthy before continuing. On slow first-run boots you can raise the timeout:

```bash
export COMPANIES_PAPERCLIP_START_TIMEOUT_MS=180000
```

## Environment Variables

| Variable                               | Description                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `PAPERCLIPAI_CMD`                      | Override the `paperclipai` executable or full command.                             |
| `COMPANIES_PAPERCLIP_START_TIMEOUT_MS` | Override the local Paperclip readiness timeout in milliseconds. Default: `120000`. |
| `COMPANIES_TELEMETRY`                  | Explicitly enable or disable telemetry. Accepted values: `1/0`, `true/false`, `on/off`. |
| `COMPANIES_TELEMETRY_INGEST_URL`       | Override the telemetry ingest endpoint for testing. Default: `https://rusqrrg391.execute-api.us-east-1.amazonaws.com/ingest`. |
| `DISABLE_TELEMETRY`                    | Disable telemetry regardless of saved preference.                                  |
| `DO_NOT_TRACK`                         | Alternative way to disable telemetry.                                              |

## Contributing

See [DEVELOPING.md](DEVELOPING.md) for build instructions, testing workflows, and maintainer notes. In particular, `pnpm test:docker` exercises the packaged `companies.sh` runtime inside a clean Linux container and verifies the local Paperclip auto-bootstrap path.

## License

MIT
