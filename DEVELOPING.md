# Developing

```bash
pnpm install
pnpm build
pnpm test
```

## Hand-Test Against A Local Paperclip Instance

Use this when you already have Paperclip on your machine and want to watch the imported company appear in the local UI.

```bash
pnpm install
pnpm build

# If Paperclip is not already running, start it in another terminal.
./node_modules/.bin/paperclipai run

# Import the fixture through the current local Paperclip instance.
node dist/index.js add ./fixtures/minimal-company \
  --connection custom-url \
  --api-base http://127.0.0.1:3100 \
  --target new \
  --new-company-name "Companies Local Hand Test"
```

Then open `http://127.0.0.1:3100` in the browser and confirm that **Companies Local Hand Test** appears in the company list.

If you want the wrapper to manage local bootstrap for you instead, run:

```bash
node dist/index.js add ./fixtures/minimal-company --target new --new-company-name "Companies Local Hand Test"
```

That path uses the bundled `paperclipai` canary, runs `paperclipai onboard --yes` when needed, and starts the local server automatically before importing.

## Hand-Test Against A Docker Paperclip Instance

Use this when you want a clean-room Paperclip instance in Docker but still want to open the UI from your host browser.

```bash
docker build -f Dockerfile.smoke -t companies-handtest .
docker run --rm -it -p 3210:3210 --entrypoint bash companies-handtest
```

Inside the container shell:

```bash
export HOST=0.0.0.0
export PORT=3210
export TMPDIR=/tmp
DATA_DIR=$(mktemp -d /tmp/companies-docker-handtest.XXXXXX)

node dist/index.js add ./fixtures/minimal-company \
  --yes \
  --data-dir "$DATA_DIR" \
  --target new \
  --new-company-name "Docker Hand Test"

node dist/index.js list --yes --data-dir "$DATA_DIR"
```

Keep that container shell open, then visit `http://127.0.0.1:3210` on the host and confirm that **Docker Hand Test** appears in the UI.

If you only want the non-interactive smoke verification and do not need the browser UI, run:

```bash
pnpm test:docker
```

## Dry-Run Smoke Test

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

## Maintainers

- `companies.sh` publishes to npm with calendar versions: stable `YYYY.MDD.P`, canary `YYYY.MDD.P-canary.N`.
- Canary publishes are intended to run automatically from GitHub `master`; stable publishes are manual promotions through GitHub Actions.
- Release docs live in [doc/RELEASING.md](doc/RELEASING.md), [doc/PUBLISHING.md](doc/PUBLISHING.md), and [doc/RELEASE-AUTOMATION-SETUP.md](doc/RELEASE-AUTOMATION-SETUP.md).
