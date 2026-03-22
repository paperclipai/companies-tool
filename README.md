# companies.sh

The CLI for importing [Agent Companies](https://companies.io) into **Paperclip**.

`companies.sh` is a thin, examples-first wrapper around the Paperclip company import flow. It accepts GitHub repos, direct URLs, and local folders, then hands the normalized import off to the `paperclipai` CLI.

## Before You Start

- Install Node.js 20 or newer
- Install the Paperclip CLI and make sure `paperclipai` is on your `PATH`
- Authenticate with Paperclip before running imports

## Import a Company

```bash
npx companies.sh add paperclipai/company-template
```

### Common Flows

```bash
# Interactive import
npx companies.sh add

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
| `-p, --provider <provider>` | Destination provider. Current release supports `paperclip` only. |
| `--target <mode>` | Import into a `new` or `existing` Paperclip company. |
| `-C, --company-id <id>` | Target company id when using `--target existing`. |
| `--new-company-name <name>` | Override the imported company name when using `--target new`. |
| `--include <values>` | Comma-separated subset of `company,agents,projects,tasks,skills`. Default: `company,agents`. |
| `--agents <list>` | Comma-separated agent slugs to import, or `all`. Default: `all`. |
| `--collision <mode>` | Collision strategy: `rename`, `skip`, or `replace`. Default: `rename`. |
| `--dry-run` | Preview the import without applying it. |
| `-y, --yes` | Skip interactive prompts. |

### Paperclip Connection Flags

Use these when the Paperclip CLI needs explicit connection or profile settings:

| Flag | Description |
| --- | --- |
| `-c, --config <path>` | Path to a Paperclip config file. |
| `-d, --data-dir <path>` | Paperclip data directory root. |
| `--context <path>` | Path to a Paperclip CLI context file. |
| `--profile <name>` | Paperclip CLI context profile name. |
| `--api-base <url>` | Paperclip API base URL override. |
| `--api-key <token>` | Paperclip API key override. |

## Package Layout

An Agent Company is a markdown-first package that describes an AI company as portable files:

| File | Purpose |
| --- | --- |
| `COMPANY.md` | Company metadata and configuration |
| `AGENTS.md` | Agent definitions, roles, and reporting structure |
| `PROJECT.md` | Project definitions and workspace bindings |
| `TASK.md` | Pre-loaded tasks and assignments |
| `SKILL.md` | Reusable skills available to agents |

## How It Works

1. Resolve the source package from GitHub, a direct URL, or a local path.
2. Prompt for the target Paperclip company unless flags already provide it.
3. Normalize the requested include set and agent filters.
4. Execute the import through the local `paperclipai` CLI.

Because Paperclip performs the actual import, `companies.sh` should be treated as a convenience wrapper rather than a standalone backend client.

## Troubleshooting

### `paperclipai` not found

The CLI shells out to `paperclipai`. If it is not on your `PATH`, set `PAPERCLIPAI_CMD`:

```bash
export PAPERCLIPAI_CMD=/path/to/paperclipai
```

`PAPERCLIPAI_CMD` can also include prefix arguments:

```bash
export PAPERCLIPAI_CMD="pnpm --dir /path/to/paperclip run paperclipai"
```

### Import fails with collision errors

Use `--collision skip` to ignore conflicting entities, or `--collision replace` to overwrite them.

### Dry-run shows nothing to import

Confirm the source contains valid Agent Company files such as `COMPANY.md` and `AGENTS.md` at the expected paths.

## Environment Variables

| Variable | Description |
| --- | --- |
| `PAPERCLIPAI_CMD` | Override the `paperclipai` executable or full command. |

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
