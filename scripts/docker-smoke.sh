#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:-node:20-bookworm-slim}"
SMOKE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/companies-docker-smoke.XXXXXX")"
PACKAGE_TARBALL=""
PACKAGE_DIR="$SMOKE_ROOT/package"

cleanup() {
  rm -rf "$SMOKE_ROOT"
}

trap cleanup EXIT

pnpm pack --pack-destination "$SMOKE_ROOT" >/dev/null
PACKAGE_TARBALL="$(find "$SMOKE_ROOT" -maxdepth 1 -name 'companies.sh-*.tgz' -print -quit)"

if [[ -z "$PACKAGE_TARBALL" ]]; then
  echo "Failed to create companies.sh package tarball." >&2
  exit 1
fi

mkdir -p "$PACKAGE_DIR"
tar -xzf "$PACKAGE_TARBALL" -C "$PACKAGE_DIR" --strip-components=1
cp -R "$PWD/fixtures" "$PACKAGE_DIR/fixtures"

docker run --rm \
  -e LANG=C.UTF-8 \
  -e LC_ALL=C.UTF-8 \
  -e HOME=/app/.home \
  -e npm_config_cache=/app/.npm-cache \
  -e TMPDIR=/app/.tmp \
  -e COMPANIES_PAPERCLIP_START_TIMEOUT_MS=180000 \
  -e PAPERCLIP_OPEN_ON_LISTEN=false \
  -e HOST=127.0.0.1 \
  -e PORT=3210 \
  -e SERVE_UI=true \
  -v "$PACKAGE_DIR:/app" \
  -w /app \
  "$IMAGE_TAG" \
  bash -lc '
    set -euo pipefail

    mkdir -p "$HOME" "$npm_config_cache" "$TMPDIR"
    npm install --omit=dev --no-audit --no-fund >/dev/null

    if command -v paperclipai >/dev/null 2>&1; then
      echo "paperclipai unexpectedly available on PATH" >&2
      exit 1
    fi

    ACTUAL_PAPERCLIP="$(node --input-type=module -e "
      import fs from \"node:fs\";
      import path from \"node:path\";
      import { createRequire } from \"node:module\";

      const require = createRequire(import.meta.url);
      const packageJsonPath = require.resolve(\"paperclipai/package.json\");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, \"utf8\"));
      const rawBin = typeof packageJson.bin === \"string\"
        ? packageJson.bin
        : packageJson.bin?.paperclipai ?? Object.values(packageJson.bin ?? {})[0];
      if (!rawBin) {
        process.exit(1);
      }
      console.log(path.resolve(path.dirname(packageJsonPath), rawBin));
    ")"
    printf "%s\n" \
      "#!/usr/bin/env bash" \
      "if [[ \"\${1:-}\" == \"onboard\" || \"\${1:-}\" == \"run\" ]]; then" \
      "  exec \"$ACTUAL_PAPERCLIP\" \"\$@\" >>/app/paperclipai.log 2>&1" \
      "fi" \
      "exec \"$ACTUAL_PAPERCLIP\" \"\$@\"" \
      >/app/paperclipai-wrapper.sh
    chmod +x /app/paperclipai-wrapper.sh
    export PAPERCLIPAI_CMD=/app/paperclipai-wrapper.sh

    printf "%s\n" "#!/usr/bin/env bash" "exec node /app/dist/index.js \"\$@\"" >/app/companies.sh
    chmod +x /app/companies.sh
    ln -s /app/companies.sh /app/companies
    export PATH="/app:$PATH"

    DATA_DIR="$(mktemp -d "$TMPDIR/companies-docker-smoke.XXXXXX")"
    COMPANY_NAME="Docker Smoke Company"

    if ! companies.sh add ./fixtures/minimal-company --yes --data-dir "$DATA_DIR" --target new --new-company-name "$COMPANY_NAME"; then
      if [[ -f /app/paperclipai.log ]]; then
        cat /app/paperclipai.log >&2
      fi
      exit 1
    fi

    LIST_OUTPUT="$(companies.sh list --yes --data-dir "$DATA_DIR")"
    printf "%s\n" "$LIST_OUTPUT"
    printf "%s\n" "$LIST_OUTPUT" | grep -F "$COMPANY_NAME"

    for _ in $(seq 1 20); do
      if node --input-type=module -e "
        const response = await fetch(\`http://127.0.0.1:\${process.env.PORT}/\`);
        if (!response.ok) {
          process.exit(1);
        }
        const html = await response.text();
        if (!/<(?:!doctype html|html)/i.test(html)) {
          process.exit(1);
        }
      "; then
        exit 0
      fi
      sleep 1
    done

    echo "Paperclip UI did not respond with HTML on port ${PORT}." >&2
    exit 1
  '
