#!/usr/bin/env bash

if [ -z "${REPO_ROOT:-}" ]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

release_info() {
  echo "$@"
}

release_fail() {
  echo "Error: $*" >&2
  exit 1
}

git_current_branch() {
  git -C "$REPO_ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null || true
}

git_local_tag_exists() {
  git -C "$REPO_ROOT" show-ref --verify --quiet "refs/tags/$1"
}

git_remote_tag_exists() {
  git -C "$REPO_ROOT" ls-remote --exit-code --tags "${2:-origin}" "refs/tags/$1" >/dev/null 2>&1
}

utc_date_iso() {
  node <<'NODE'
const now = new Date();
const year = now.getUTCFullYear();
const month = String(now.getUTCMonth() + 1).padStart(2, "0");
const day = String(now.getUTCDate()).padStart(2, "0");
process.stdout.write(`${year}-${month}-${day}`);
NODE
}

stable_version_slot_for_date() {
  node - "${1:-}" <<'NODE'
const input = process.argv[2];
const date = input ? new Date(`${input}T00:00:00Z`) : new Date();
if (Number.isNaN(date.getTime())) {
  console.error(`invalid date: ${input}`);
  process.exit(1);
}

const year = date.getUTCFullYear();
const month = String(date.getUTCMonth() + 1);
const day = String(date.getUTCDate()).padStart(2, "0");
process.stdout.write(`${year}.${month}${day}`);
NODE
}

package_name() {
  node - "$REPO_ROOT/package.json" <<'NODE'
const fs = require("node:fs");
const packageJson = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
  process.exit(1);
}
process.stdout.write(packageJson.name);
NODE
}

package_version() {
  node - "$REPO_ROOT/package.json" <<'NODE'
const fs = require("node:fs");
const packageJson = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
  process.exit(1);
}
process.stdout.write(packageJson.version);
NODE
}

set_package_version() {
  node - "$REPO_ROOT/package.json" "$1" <<'NODE'
const fs = require("node:fs");
const packagePath = process.argv[2];
const nextVersion = process.argv[3];
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.version = nextVersion;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
NODE
}

require_clean_worktree() {
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
    release_fail "working tree is not clean. Commit, stash, or remove changes before releasing."
  fi
}

require_on_master_branch() {
  local current_branch
  current_branch="$(git_current_branch)"
  if [ "$current_branch" != "master" ]; then
    release_fail "this release step must run from branch master, but current branch is ${current_branch:-<detached>}."
  fi
}

require_npm_publish_auth() {
  local dry_run="$1"

  if [ "$dry_run" = true ]; then
    return
  fi

  if npm whoami >/dev/null 2>&1; then
    release_info "  ✓ Logged in to npm as $(npm whoami)"
    return
  fi

  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    release_info "  ✓ npm publish auth will be provided by GitHub Actions trusted publishing"
    return
  fi

  release_fail "npm publish auth is not available. Use 'npm login' locally or run from GitHub Actions with trusted publishing."
}

npm_package_version_exists() {
  local package_name="$1"
  local version="$2"
  local resolved

  resolved="$(npm view "${package_name}@${version}" version 2>/dev/null || true)"
  [ "$resolved" = "$version" ]
}

wait_for_npm_package_version() {
  local package_name="$1"
  local version="$2"
  local attempts="${3:-12}"
  local delay_seconds="${4:-5}"
  local attempt=1

  while [ "$attempt" -le "$attempts" ]; do
    if npm_package_version_exists "$package_name" "$version"; then
      return 0
    fi

    if [ "$attempt" -lt "$attempts" ]; then
      sleep "$delay_seconds"
    fi
    attempt=$((attempt + 1))
  done

  return 1
}

next_stable_version() {
  local release_date="$1"
  local name="$2"

  node - "$release_date" "$name" <<'NODE'
const input = process.argv[2];
const packageName = process.argv[3];
const { execSync } = require("node:child_process");

const date = input ? new Date(`${input}T00:00:00Z`) : new Date();
if (Number.isNaN(date.getTime())) {
  console.error(`invalid date: ${input}`);
  process.exit(1);
}

const slot = `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}${String(date.getUTCDate()).padStart(2, "0")}`;
const pattern = new RegExp(`^${slot.replace(/\./g, "\\.")}\\.(\\d+)$`);
let versions = [];
let max = -1;

try {
  const raw = execSync(`npm view ${JSON.stringify(packageName)} versions --json`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (raw) {
    const parsed = JSON.parse(raw);
    versions = Array.isArray(parsed) ? parsed : [parsed];
  }
} catch {
  versions = [];
}

for (const version of versions) {
  const match = version.match(pattern);
  if (!match) continue;
  max = Math.max(max, Number(match[1]));
}

process.stdout.write(`${slot}.${max + 1}`);
NODE
}

next_canary_version() {
  local stable_version="$1"
  local name="$2"

  node - "$stable_version" "$name" <<'NODE'
const stableVersion = process.argv[2];
const packageName = process.argv[3];
const { execSync } = require("node:child_process");

const pattern = new RegExp(`^${stableVersion.replace(/\./g, "\\.")}-canary\\.(\\d+)$`);
let versions = [];
let max = -1;

try {
  const raw = execSync(`npm view ${JSON.stringify(packageName)} versions --json`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (raw) {
    const parsed = JSON.parse(raw);
    versions = Array.isArray(parsed) ? parsed : [parsed];
  }
} catch {
  versions = [];
}

for (const version of versions) {
  const match = version.match(pattern);
  if (!match) continue;
  max = Math.max(max, Number(match[1]));
}

process.stdout.write(`${stableVersion}-canary.${max + 1}`);
NODE
}

stable_tag_name() {
  printf 'v%s\n' "$1"
}

canary_tag_name() {
  printf 'canary/v%s\n' "$1"
}
