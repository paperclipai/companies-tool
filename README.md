# companies.sh

The CLI for importing Agent Companies into supported providers.

Supports **Paperclip** today, with a provider wrapper design that can grow over time.

## Import a Company

```bash
npx companies.sh add paperclipai/company-template
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

| Option | Description |
| --- | --- |
| `-p, --provider <provider>` | Destination provider. Only `paperclip` is supported right now. |
| `--target <mode>` | Import into a `new` or `existing` Paperclip company. |
| `-C, --company-id <id>` | Existing Paperclip company id for `--target existing`. |
| `--new-company-name <name>` | Override the created company name for `--target new`. |
| `--include <values>` | Comma-separated subset of `company,agents,projects,tasks,issues,skills`. `tasks` maps to Paperclip issues. |
| `--agents <list>` | Comma-separated agent slugs to import, or `all`. |
| `--collision <mode>` | Collision strategy: `rename`, `skip`, or `replace`. |
| `--dry-run` | Preview the import without applying it. |
| `-y, --yes` | Skip prompts. |

### Examples

```bash
# Interactive import into Paperclip
npx companies.sh add

# Dry-run an import into an existing company
npx companies.sh add ./my-company --target existing -C <company-id> --dry-run

# Import only company metadata and agents
npx companies.sh add paperclipai/company-template --include company,agents
```

## Other Commands

| Command | Description |
| --- | --- |
| `npx companies.sh list` | List companies in the active Paperclip context |
| `npx companies.sh export <company> --out <dir>` | Export a Paperclip company as a portable package |

### `companies list`

```bash
npx companies.sh list
```

### `companies export`

```bash
# Export a company by id, exact name, or issue prefix
npx companies.sh export PAP --out ./exports/pap

# Export projects and tasks too
npx companies.sh export PAP --out ./exports/pap --include company,agents,projects,tasks

# Export only specific project tasks
npx companies.sh export PAP --out ./exports/pap --project-tasks growth-site
```

## What Are Agent Companies?

Agent Companies are markdown-first packages built around files like `COMPANY.md`, `AGENTS.md`, `PROJECT.md`, `TASK.md`, and `SKILL.md`.

This CLI keeps that public surface generic while delegating provider-specific work to adapters. In the launch version, the `paperclip` adapter is a thin wrapper around `paperclipai company import`, `paperclipai company export`, and `paperclipai company list`.

## Provider Notes

- `paperclip` is the only supported destination provider today.
- `tasks` map to Paperclip `issues`.
- Paperclip imports and exports skills as part of the package today, but it does not yet expose a separate skill include toggle in the CLI.

## Development

```bash
pnpm install
pnpm test
pnpm build
```

If `paperclipai` is not installed on your `PATH`, set `PAPERCLIPAI_CMD` before running the wrapper:

```bash
export PAPERCLIPAI_CMD=/path/to/paperclipai
```
