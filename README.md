# companies.sh

The CLI for importing and exporting Agent Companies across providers.

Supports **Paperclip** today, with a provider-adapter design that can grow over time.

## Import a Company

```bash
npx companies.sh add paperclipai/company-template
```

### Source Formats

```bash
# GitHub shorthand (owner/repo)
npx companies.sh add paperclipai/company-template

# Full GitHub URL
npx companies.sh add https://github.com/paperclipai/company-template

# Direct tree URL (specific branch or subdirectory)
npx companies.sh add https://github.com/paperclipai/company-template/tree/main/company

# Local path
npx companies.sh add ./my-company
```

### Examples

```bash
# Interactive import — prompts for provider, target, and source
npx companies.sh add

# Import from GitHub into a new Paperclip company
npx companies.sh add paperclipai/company-template --target new

# Import into an existing company
npx companies.sh add paperclipai/company-template --target existing -C <company-id>

# Preview what would be imported without applying
npx companies.sh add ./my-company --target existing -C <company-id> --dry-run

# Import only company metadata and agents (default)
npx companies.sh add paperclipai/company-template --include company,agents

# Import everything — company, agents, projects, tasks, and skills
npx companies.sh add paperclipai/company-template --include company,agents,projects,tasks,skills

# Import specific agents only
npx companies.sh add paperclipai/company-template --agents ceo,cto

# Skip all prompts for scripted / CI usage
npx companies.sh add paperclipai/company-template --target new -y
```

### Options

| Option | Description |
| --- | --- |
| `-p, --provider <provider>` | Destination provider (only `paperclip` today) |
| `--target <mode>` | Import into a `new` or `existing` company |
| `-C, --company-id <id>` | Company id when using `--target existing` |
| `--new-company-name <name>` | Override the company name when using `--target new` |
| `--include <values>` | Comma-separated subset of `company,agents,projects,tasks,issues,skills`. Default: `company,agents` |
| `--agents <list>` | Comma-separated agent slugs to import, or `all`. Default: `all` |
| `--collision <mode>` | How to handle name collisions: `rename`, `skip`, or `replace`. Default: `rename` |
| `--dry-run` | Preview the import without applying it |
| `-y, --yes` | Skip interactive prompts |

> **Note:** `tasks` and `issues` are interchangeable — both map to Paperclip issues.

## List Companies

```bash
npx companies.sh list
```

Lists all companies visible in the active Paperclip context. Alias: `ls`.

## Export a Company

Export a Paperclip company as a portable Agent Company package.

```bash
# Export by issue prefix
npx companies.sh export PAP --out ./exports/pap

# Export by company id or exact name
npx companies.sh export <company-id> --out ./exports/my-company

# Include projects and tasks in the export
npx companies.sh export PAP --out ./exports/pap --include company,agents,projects,tasks

# Export tasks for specific projects only
npx companies.sh export PAP --out ./exports/pap --project-tasks growth-site

# Export specific skills only
npx companies.sh export PAP --out ./exports/pap --skills company-creator,frontend-design

# Vendor referenced skills into the package
npx companies.sh export PAP --out ./exports/pap --expand-referenced-skills
```

### Export Options

| Option | Description |
| --- | --- |
| `--out <path>` | Output directory (required) |
| `--include <values>` | Comma-separated subset of `company,agents,projects,tasks,issues,skills`. Default: `company,agents` |
| `--skills <values>` | Export specific skills by selector |
| `--projects <values>` | Export specific projects by selector |
| `--tasks <values>` | Export specific tasks by selector |
| `--project-tasks <values>` | Export tasks belonging to specific projects |
| `--expand-referenced-skills` | Inline referenced skills into the export package |

## What Are Agent Companies?

Agent Companies are markdown-first packages that describe an entire AI company — its structure, agents, projects, and tasks — using portable files:

| File | Purpose |
| --- | --- |
| `COMPANY.md` | Company metadata and configuration |
| `AGENTS.md` | Agent definitions, roles, and reporting structure |
| `PROJECT.md` | Project definitions and workspace bindings |
| `TASK.md` | Pre-loaded tasks and assignments |
| `SKILL.md` | Reusable skills available to agents |

This CLI keeps the package surface generic while delegating provider-specific work to adapters. The `paperclip` adapter wraps `paperclipai company import`, `paperclipai company export`, and `paperclipai company list`.

## Provider Notes

- `paperclip` is the only supported provider today.
- `tasks` in CLI terminology map to `issues` in Paperclip.
- Skills are included in Paperclip imports/exports as part of the package.

## Troubleshooting

### `paperclipai` not found

The CLI shells out to the `paperclipai` command. If it is not on your `PATH`, set the `PAPERCLIPAI_CMD` environment variable:

```bash
export PAPERCLIPAI_CMD=/path/to/paperclipai
```

`PAPERCLIPAI_CMD` can also be a full command with prefix arguments, for example:

```bash
export PAPERCLIPAI_CMD="pnpm --dir /path/to/paperclip run paperclipai"
```

### Import fails with collision errors

Use `--collision skip` to skip conflicting entities, or `--collision replace` to overwrite them.

### Dry-run shows nothing to import

Ensure your source contains valid Agent Company files (`COMPANY.md`, `AGENTS.md`, etc.) at the expected paths.

## Environment Variables

| Variable | Description |
| --- | --- |
| `PAPERCLIPAI_CMD` | Override the path to the `paperclipai` binary |

## Development

```bash
pnpm install
pnpm build
pnpm test
```

### Dry-Run Smoke Test

Use this to verify the wrapper can reach a local Paperclip instance without applying writes:

```bash
export PAPERCLIPAI_CMD="pnpm --dir /path/to/paperclip run paperclipai"

npx companies.sh add paperclipai/company-template \
  --target new \
  --dry-run \
  --yes \
  --api-base http://127.0.0.1:3103 \
  --api-key "$PAPERCLIP_API_KEY"
```

Expected result: the command reaches the Paperclip import preview path and does not create a company because `--dry-run` routes to preview only. Use a board-scoped API key or board-authenticated context for this check because preview endpoints may reject agent-scoped credentials.

## License

MIT
