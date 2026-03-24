#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./release-lib.sh
. "$REPO_ROOT/scripts/release-lib.sh"

dry_run=false
version=""
PACKAGE_NAME="$(package_name)"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/rollback-latest.sh <stable-version> [--dry-run]

Examples:
  ./scripts/rollback-latest.sh 2026.324.0
  ./scripts/rollback-latest.sh 2026.324.0 --dry-run

Notes:
  - This repoints the npm dist-tag "latest" for companies.sh.
  - It does not unpublish anything.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [ -n "$version" ]; then
        release_fail "only one version may be provided."
      fi
      version="$1"
      ;;
  esac
  shift
done

if [ -z "$version" ]; then
  usage
  exit 1
fi

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  release_fail "version must be a stable calendar version like 2026.324.0."
fi

if ! npm_package_version_exists "$PACKAGE_NAME" "$version"; then
  release_fail "npm does not currently serve ${PACKAGE_NAME}@${version}."
fi

require_npm_publish_auth "$dry_run"

if [ "$dry_run" = true ]; then
  echo "[dry-run] npm dist-tag add ${PACKAGE_NAME}@${version} latest"
else
  npm dist-tag add "${PACKAGE_NAME}@${version}" latest
  echo "Updated latest -> ${PACKAGE_NAME}@${version}"
fi
