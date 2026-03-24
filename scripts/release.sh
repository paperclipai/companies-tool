#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./release-lib.sh
. "$REPO_ROOT/scripts/release-lib.sh"

channel=""
release_date=""
dry_run=false
skip_verify=false
print_version_only=false
tag_name=""
original_package_version="$(package_version)"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release.sh <canary|stable> [--date YYYY-MM-DD] [--dry-run] [--skip-verify] [--print-version]

Examples:
  ./scripts/release.sh canary
  ./scripts/release.sh canary --date 2026-03-24 --dry-run
  ./scripts/release.sh stable
  ./scripts/release.sh stable --date 2026-03-24 --dry-run

Notes:
  - Stable versions use YYYY.MDD.P, where M is the UTC month, DD is the
    zero-padded UTC day, and P is the same-day stable patch slot.
  - Canary releases publish YYYY.MDD.P-canary.N under npm dist-tag "canary"
    and create the git tag canary/vYYYY.MDD.P-canary.N.
  - Stable releases publish YYYY.MDD.P under npm dist-tag "latest" and create
    the git tag vYYYY.MDD.P.
  - The script rewrites package.json temporarily and restores it on exit.
EOF
}

cleanup_release_state() {
  if [ -f "$REPO_ROOT/package.json" ]; then
    set_package_version "$original_package_version"
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    canary|stable)
      if [ -n "$channel" ]; then
        release_fail "only one release channel may be provided."
      fi
      channel="$1"
      ;;
    --date)
      shift
      [ $# -gt 0 ] || release_fail "--date requires YYYY-MM-DD."
      release_date="$1"
      ;;
    --dry-run) dry_run=true ;;
    --skip-verify) skip_verify=true ;;
    --print-version) print_version_only=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      release_fail "unexpected argument: $1"
      ;;
  esac
  shift
done

[ -n "$channel" ] || {
  usage
  exit 1
}

PACKAGE_NAME="$(package_name)"
RELEASE_DATE="${release_date:-$(utc_date_iso)}"
TARGET_STABLE_VERSION="$(next_stable_version "$RELEASE_DATE" "$PACKAGE_NAME")"
TARGET_PUBLISH_VERSION="$TARGET_STABLE_VERSION"
DIST_TAG="latest"
PUBLISH_REMOTE="${PUBLISH_REMOTE:-origin}"

if [ "$channel" = "canary" ]; then
  require_on_master_branch
  TARGET_PUBLISH_VERSION="$(next_canary_version "$TARGET_STABLE_VERSION" "$PACKAGE_NAME")"
  DIST_TAG="canary"
  tag_name="$(canary_tag_name "$TARGET_PUBLISH_VERSION")"
else
  tag_name="$(stable_tag_name "$TARGET_STABLE_VERSION")"
fi

if [ "$print_version_only" = true ]; then
  printf '%s\n' "$TARGET_PUBLISH_VERSION"
  exit 0
fi

require_clean_worktree
require_npm_publish_auth "$dry_run"

if git_local_tag_exists "$tag_name" || git_remote_tag_exists "$tag_name" "$PUBLISH_REMOTE"; then
  release_fail "git tag $tag_name already exists locally or on $PUBLISH_REMOTE."
fi

if npm_package_version_exists "$PACKAGE_NAME" "$TARGET_PUBLISH_VERSION"; then
  release_fail "npm version ${PACKAGE_NAME}@${TARGET_PUBLISH_VERSION} already exists."
fi

trap cleanup_release_state EXIT

release_info ""
release_info "==> Release plan"
release_info "  Package: $PACKAGE_NAME"
release_info "  Channel: $channel"
release_info "  Release date (UTC): $RELEASE_DATE"
release_info "  Current package version: $original_package_version"
release_info "  Publish version: $TARGET_PUBLISH_VERSION"
release_info "  Dist-tag: $DIST_TAG"
release_info "  Git tag: $tag_name"

if [ "$skip_verify" = false ]; then
  release_info ""
  release_info "==> Step 1/5: Verification gate..."
  cd "$REPO_ROOT"
  pnpm typecheck
  pnpm test
  pnpm build
else
  release_info ""
  release_info "==> Step 1/5: Verification gate skipped (--skip-verify)"
fi

release_info ""
release_info "==> Step 2/5: Setting publish version..."
set_package_version "$TARGET_PUBLISH_VERSION"
release_info "  ✓ package.json set to $TARGET_PUBLISH_VERSION"

release_info ""
release_info "==> Step 3/5: Previewing publish payload..."
cd "$REPO_ROOT"
npm pack --dry-run

release_info ""
if [ "$dry_run" = true ]; then
  release_info "==> Step 4/5: Previewing publish command (--dry-run)..."
  pnpm publish --dry-run --no-git-checks --tag "$DIST_TAG" --access public
  release_info "  [dry-run] Would create git tag $tag_name on $(git -C "$REPO_ROOT" rev-parse HEAD)"
else
  release_info "==> Step 4/5: Publishing to npm..."
  pnpm publish --no-git-checks --tag "$DIST_TAG" --access public
  git -C "$REPO_ROOT" tag "$tag_name"
  release_info "  ✓ Published ${PACKAGE_NAME}@${TARGET_PUBLISH_VERSION}"
fi

release_info ""
if [ "$dry_run" = true ]; then
  release_info "==> Step 5/5: Follow-up"
  release_info "  - Run without --dry-run to publish ${PACKAGE_NAME}@${TARGET_PUBLISH_VERSION}"
  release_info "  - Push ${tag_name} after a real publish"
else
  release_info "==> Step 5/5: Verifying npm registry..."
  if ! wait_for_npm_package_version "$PACKAGE_NAME" "$TARGET_PUBLISH_VERSION"; then
    release_fail "published version ${PACKAGE_NAME}@${TARGET_PUBLISH_VERSION} did not appear on npm in time."
  fi
  release_info "  ✓ npm now serves ${PACKAGE_NAME}@${TARGET_PUBLISH_VERSION}"
  release_info "  ✓ Local tag created: $tag_name"
  release_info ""
  release_info "Next commands:"
  release_info "  npm view ${PACKAGE_NAME}@${TARGET_PUBLISH_VERSION} version"
  release_info "  npm view ${PACKAGE_NAME} dist-tags --json"
fi
