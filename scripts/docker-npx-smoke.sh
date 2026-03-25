#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:-node:20-bookworm-slim}"
SMOKE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/companies-docker-npx-smoke.XXXXXX")"
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
cp "$PACKAGE_TARBALL" "$PACKAGE_DIR/companies.sh-local.tgz"
chmod -R a+rwx "$SMOKE_ROOT"

docker run --rm \
  -e LANG=C.UTF-8 \
  -e LC_ALL=C.UTF-8 \
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

    export DEBIAN_FRONTEND=noninteractive
    apt-get update >/dev/null
    apt-get install -y --no-install-recommends ca-certificates locales >/dev/null
    sed -i "/en_US.UTF-8/s/^# //" /etc/locale.gen
    locale-gen >/dev/null
    rm -rf /var/lib/apt/lists/*

    cat >/tmp/run-companies-npx-smoke.sh <<'\''EOF'\''
#!/usr/bin/env bash
set -euo pipefail

export HOME=/app/.home
export npm_config_cache=/app/.npm-cache
export TMPDIR=/tmp

if [[ "$(id -u)" -eq 0 ]]; then
  echo "docker-npx-smoke must run the companies.sh command as a non-root user" >&2
  exit 1
fi

mkdir -p "$HOME" "$npm_config_cache"
npm install --no-save --omit=dev ./companies.sh-local.tgz >/dev/null

ACTUAL_PAPERCLIP="$(node --input-type=module -e "
  import fs from \"node:fs\";
  import path from \"node:path\";

  const packageJsonPath = path.resolve(\"/app/node_modules/paperclipai/package.json\");
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
  "  exec \"$ACTUAL_PAPERCLIP\" \"\$@\" >>/app/paperclipai-npx.log 2>&1" \
  "fi" \
  "exec \"$ACTUAL_PAPERCLIP\" \"\$@\"" \
  >/app/paperclipai-wrapper.sh
chmod +x /app/paperclipai-wrapper.sh
export PAPERCLIPAI_CMD=/app/paperclipai-wrapper.sh

if command -v paperclipai >/dev/null 2>&1; then
  echo "paperclipai unexpectedly available on PATH" >&2
  exit 1
fi

DATA_DIR="$(mktemp -d "$TMPDIR/companies-docker-npx.XXXXXX")"
COMPANY_NAME="GStack"

if ! npx companies.sh add paperclipai/companies/gstack --yes --data-dir "$DATA_DIR" --target new; then
  if [[ -f /app/paperclipai-npx.log ]]; then
    cat /app/paperclipai-npx.log >&2
  fi
  exit 1
fi

LIST_OUTPUT="$(npx companies.sh list --yes --data-dir "$DATA_DIR")"
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
EOF
    chmod +x /tmp/run-companies-npx-smoke.sh
    su node -s /bin/bash -c /tmp/run-companies-npx-smoke.sh
  '
