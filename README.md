# [companies.sh](https://companies.sh)

The CLI for the [Agent Companies](https://companies.io) open standard.

> Browse installable companies at [companies.sh](https://companies.sh)

## Install a Company

```bash
npx companies.sh add paperclipai/companies/gstack
```

### Source Formats

```bash
# GitHub shorthand (owner/repo/path)
npx companies.sh add paperclipai/companies/gstack

# GitHub tree URL
npx companies.sh add https://github.com/paperclipai/companies/tree/main/gstack

# Local path
npx companies.sh add ./my-company
```

### Options

| Option                      | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `--target <mode>`           | Import into a `new` or `existing` company.                           |
| `-C, --company-id <id>`     | Target company id for `--target existing`. Omit to choose from a list. |
| `--include <values>`        | Comma-separated subset: `company,agents,projects,tasks,skills`. Default: `company,agents`. |
| `--agents <list>`           | Comma-separated agent slugs to import, or `all`. Default: `all`.     |
| `--collision <mode>`        | Collision strategy: `rename`, `skip`, or `replace`. Default: `rename`. |
| `--dry-run`                 | Preview the import without applying it.                              |
| `-y, --yes`                 | Skip interactive prompts.                                            |
| `-p, --provider <provider>` | Destination orchestrator. Default: `paperclip`.                      |
| `--connection <mode>`       | Connection mode: `auto` or `custom-url`. Default: `auto`.           |

### Examples

```bash
# Interactive import (prompts for source and target)
npx companies.sh add

# Import from a local folder with auto-bootstrap
npx companies.sh add ./fixtures/minimal-company

# Import into a new company
npx companies.sh add paperclipai/companies/gstack --target new

# Import into an existing company, pick from list
npx companies.sh add paperclipai/companies/gstack --target existing

# Import into a specific company without prompts
npx companies.sh add paperclipai/companies/gstack --target existing -C <company-id>

# Preview what would be imported
npx companies.sh add ./my-company --target existing -C <company-id> --dry-run

# Import specific agents only
npx companies.sh add paperclipai/companies/gstack --agents ceo,cto

# Import everything (agents, projects, tasks, skills)
npx companies.sh add paperclipai/companies/gstack --include company,agents,projects,tasks,skills

# Non-interactive usage for scripts or CI
npx companies.sh add paperclipai/companies/gstack --target new -y

# Use a specific Paperclip instance
npx companies.sh add paperclipai/companies/gstack --connection custom-url --api-base http://127.0.0.1:3100
```

## Other Commands

| Command               | Description                          |
| --------------------- | ------------------------------------ |
| `npx companies.sh list` | List companies in the provider (alias: `ls`) |

```bash
# List all companies
npx companies.sh list
```

## What is an Agent Company?

An Agent Company is a portable, markdown-first package that defines an AI-powered company — its agents, roles, projects, tasks, and skills — as plain files. Companies follow the [Agent Companies](https://companies.io) open standard and can be imported into any supported orchestrator.

Companies let you:

- Spin up a fully staffed AI team from a single `npx` command
- Share and reuse organizational structures across projects
- Version-control your company configuration alongside your code

## Package Layout

| File         | Purpose                                           |
| ------------ | ------------------------------------------------- |
| `COMPANY.md` | Company metadata and configuration                |
| `AGENTS.md`  | Agent definitions, roles, and reporting structure  |
| `PROJECT.md` | Project definitions and workspace bindings         |
| `TASK.md`    | Pre-loaded tasks and assignments                   |
| `SKILL.md`   | Reusable skills available to agents                |

### Creating a Company Package

Company packages are directories containing at least a `COMPANY.md` file with YAML frontmatter:

```markdown
---
schema: agentcompanies/v1
name: My Company
slug: my-company
description: What this company does
---

# My Company

A description of the company and how it operates.
```

Add `AGENTS.md`, `PROJECT.md`, `TASK.md`, and `SKILL.md` files to define the rest of the organization. See the [Agent Companies specification](https://companies.io) for the full schema.

## How It Works

1. Resolve the source package from GitHub, a direct URL, or a local path.
2. Connect to the target orchestrator ([Paperclip](https://paperclip.ing) by default).
3. Prompt for the target company unless flags already provide it.
4. Normalize the requested include set and agent filters.
5. Execute the import through the orchestrator's CLI.

`companies.sh` is a convenience wrapper — the chosen orchestrator performs the actual import.

## Connection Modes

| Mode         | Behavior |
| ------------ | -------- |
| `auto`       | Checks local Paperclip config, falls back to `http://127.0.0.1:3100`, runs `paperclipai onboard --yes` if no config exists, starts `paperclipai run` if the server is not up. |
| `custom-url` | Skips local bootstrap; expects a reachable instance at `--api-base`. |

### Paperclip Connection Flags

| Flag                    | Description                           |
| ----------------------- | ------------------------------------- |
| `-c, --config <path>`   | Path to a Paperclip config file.      |
| `-d, --data-dir <path>` | Paperclip data directory root.        |
| `--context <path>`      | Path to a Paperclip CLI context file. |
| `--profile <name>`      | Paperclip CLI context profile name.   |
| `--api-base <url>`      | Paperclip API base URL override.      |
| `--api-key <token>`     | Paperclip API key override.           |

`companies.sh` requires `paperclipai >= 2026.325.0`. Fresh installs resolve a bundled release automatically.

## Adding a Provider

`companies.sh` is provider-based. [Paperclip](https://paperclip.ing) is the first supported provider, but the architecture accepts additional agent orchestrators.

To add your orchestrator as a provider, open a pull request or issue with:

- The orchestrator name and a link to its documentation.
- A description of how it imports Agent Company packages.
- A CLI or SDK that `companies.sh` can shell out to for the import flow.

## Telemetry

`companies.sh` sends one anonymous event after a successful import to help us understand package adoption. Telemetry is automatically disabled in CI environments.

- Uses a pseudonymous install id that rotates every 30 days.
- Does not send repo URLs, local paths, company names, or command arguments.
- Set `DISABLE_TELEMETRY=1`, `DO_NOT_TRACK=1`, or `COMPANIES_TELEMETRY=0` to disable it.

The install id is stored at `~/.config/companies.sh/telemetry.json` unless `XDG_CONFIG_HOME` overrides the base path.

## Environment Variables

| Variable                               | Description                                                        |
| -------------------------------------- | ------------------------------------------------------------------ |
| `PAPERCLIPAI_CMD`                      | Override the `paperclipai` executable or full command.              |
| `COMPANIES_PAPERCLIP_START_TIMEOUT_MS` | Local Paperclip readiness timeout in milliseconds. Default: `120000`. |
| `COMPANIES_TELEMETRY`                  | Enable or disable telemetry (`1/0`, `true/false`, `on/off`).       |
| `DISABLE_TELEMETRY`                    | Disable telemetry.                                                 |
| `DO_NOT_TRACK`                         | Alternative way to disable telemetry.                              |

## Troubleshooting

### Import fails with collision errors

Use `--collision skip` to ignore conflicting entities, or `--collision replace` to overwrite them.

### Dry-run shows nothing to import

Confirm the source contains valid Agent Company files (`COMPANY.md`, `AGENTS.md`) at the expected paths.

### Use a different `paperclipai` build

```bash
export PAPERCLIPAI_CMD=/path/to/paperclipai

# With prefix arguments
export PAPERCLIPAI_CMD="pnpm --dir /path/to/paperclip paperclipai"
```

### Local auto-bootstrap times out

Raise the timeout for slow machines or Docker:

```bash
export COMPANIES_PAPERCLIP_START_TIMEOUT_MS=180000
```

## Related Links

- [Agent Companies Specification](https://companies.io)
- [Browse Companies](https://companies.sh)
- [Paperclip](https://paperclip.ing)

## Contributing

See [DEVELOPING.md](DEVELOPING.md) for build instructions, testing workflows, and maintainer notes.

## License

MIT
