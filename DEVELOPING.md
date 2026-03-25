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

Use this when you want the automated clean-room Docker smoke test. It packages the current CLI, starts a fresh Linux container with Node 20, installs only production dependencies inside that container, then verifies the wrapper bootstraps Paperclip, imports the fixture, and serves the UI on the container loopback interface without any standalone `paperclipai` binary on `PATH`.

```bash
pnpm test:docker
```

If you specifically want the vanilla `npx` install path in Docker, run:

```bash
pnpm test:docker:npx
```

That smoke test starts from a clean Node 20 container, installs only the Debian prerequisites, switches to the non-root `node` user, and runs the current local tarball through `npx`. It verifies the full success condition end to end: no standalone `paperclipai` on `PATH`, `npx companies.sh add ...` bootstraps local Paperclip, imports `paperclipai/companies/gstack`, lists the imported company, and serves the Paperclip UI over container-local HTTP.

If you want a manual shell inside the same clean-room setup, run:

```bash
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/companies-docker-handtest.XXXXXX")"
pnpm pack --pack-destination "$tmpdir"
tar -xzf "$tmpdir"/companies.sh-*.tgz -C "$tmpdir"
cp -R fixtures "$tmpdir/package/fixtures"
chmod -R a+rwx "$tmpdir"

docker run --rm -it \
  -e COMPANIES_PAPERCLIP_START_TIMEOUT_MS=180000 \
  -e HOST=127.0.0.1 \
  -e PORT=3210 \
  -e SERVE_UI=true \
  -e PAPERCLIP_OPEN_ON_LISTEN=false \
  -v "$tmpdir/package:/app" \
  -w /app \
  node:20-bookworm-slim \
  bash
```

Inside that shell:

```bash
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates locales
sed -i '/en_US.UTF-8/s/^# //' /etc/locale.gen
locale-gen
su node -s /bin/bash

export HOME=/app/.home
export npm_config_cache=/app/.npm-cache
export TMPDIR=/tmp
mkdir -p "$HOME" "$npm_config_cache"
npm install --omit=dev --no-audit --no-fund
command -v paperclipai && exit 1
printf '%s\n' '#!/usr/bin/env bash' 'exec node /app/dist/index.js "$@"' >/app/companies.sh
chmod +x /app/companies.sh
ln -s /app/companies.sh /app/companies
export PATH="/app:$PATH"
DATA_DIR=$(mktemp -d "$TMPDIR/companies-docker-handtest.XXXXXX")
companies.sh add ./fixtures/minimal-company --yes --data-dir "$DATA_DIR" --target new --new-company-name "Docker Hand Test"
companies.sh list --yes --data-dir "$DATA_DIR"
node --input-type=module -e 'const response = await fetch("http://127.0.0.1:3210/"); console.log(response.status);'
```

That loopback binding is intentional: Paperclip quickstart uses `local_trusted`, which requires `127.0.0.1` inside the container. The automated smoke test verifies the UI over container-local HTTP rather than Docker port publishing.

## Hand-Test The Published Canary In Vanilla Docker

Use this when you want to manually exercise the exact published-canary style flow from a plain `node:20-bookworm-slim` shell.

```bash
docker run --rm -it node:20-bookworm-slim bash
```

Inside that shell:

```bash
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates locales
sed -i '/en_US.UTF-8/s/^# //' /etc/locale.gen
locale-gen
su node -s /bin/bash

npx companies.sh@canary add paperclipai/companies/gstack
npx companies.sh@canary list
```

Run that `npx` command as `node`, not `root`. Local Paperclip bootstrap uses embedded services that can stall under Linux root sessions, so `companies.sh` now fails fast there and tells you to switch users instead of waiting forever.

Expected interactive flow:

- pick `paperclip`
- pick `auto`
- pick the target company mode you want, usually `new`
- wait for the local Paperclip bootstrap note to finish on first run
- confirm the imported company appears in `npx companies.sh@canary list`

The important behavior is that the CLI should keep advancing after `auto` instead of appearing to stall there. On a fresh container the first bootstrap can still take a while, but the prompt flow now reaches the target selection before local Paperclip startup begins.

## Dry-Run Smoke Test

Use this to verify the wrapper can reach a local Paperclip instance without applying writes:

```bash
export PAPERCLIPAI_CMD="pnpm --dir /path/to/paperclip run paperclipai"

npx companies.sh add paperclipai/companies/gstack \
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
