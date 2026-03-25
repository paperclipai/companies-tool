# Releasing companies.sh

Maintainer runbook for shipping `companies.sh` to npm.

The release model is commit-driven:

1. Every push to `master` publishes a canary automatically.
2. Stable releases are manually promoted from a chosen tested commit.
3. npm trusted publishing is used through GitHub Actions environments.

## Versioning Model

`companies.sh` uses semver-safe calendar versions:

- stable: `YYYY.MDD.P`
- canary: `YYYY.MDD.P-canary.N`

Examples:

- first stable on March 24, 2026: `2026.324.0`
- second stable on March 24, 2026: `2026.324.1`
- third canary on the `2026.324.0` line: `2026.324.0-canary.2`

Important constraints:

- the middle numeric slot is `MDD`, where `M` is the UTC month and `DD` is the zero-padded UTC day
- use `2026.303.0` for March 3, not `2026.33.0`
- do not use four numeric segments such as `2026.3.24.0`

## Release Surfaces

Every release should cover:

1. verification: the target commit passes typecheck, tests, and build
2. npm: the package is published under the intended dist-tag
3. git traceability: the matching tag exists and is pushed

Stable releases do not currently require a GitHub Release or changelog file in this repo.

## TL;DR

### Canary

Every push to `master` runs [`.github/workflows/release.yml`](../.github/workflows/release.yml).

It:

- verifies the pushed commit
- computes the next canary version for the current UTC date
- publishes under npm dist-tag `canary`
- creates and pushes `canary/vYYYY.MDD.P-canary.N`

Install path:

```bash
npx companies.sh@canary add paperclipai/companies/gstack
```

### Stable

Use the manual `workflow_dispatch` flow in [`.github/workflows/release.yml`](../.github/workflows/release.yml).

Inputs:

- `source_ref`
  - commit SHA, branch, or tag to promote
- `stable_date`
  - optional UTC date override in `YYYY-MM-DD`
- `dry_run`
  - preview only when true

Before running stable:

1. pick the commit or canary you trust
2. resolve the target version with `./scripts/release.sh stable --date "$(date -u +%F)" --print-version`
3. trigger the workflow from that exact `source_ref`

The workflow:

- re-verifies the exact source ref
- computes the next stable patch slot for the chosen UTC date
- publishes `YYYY.MDD.P` under npm dist-tag `latest`
- creates and pushes `vYYYY.MDD.P`

## Local Commands

Preview a canary locally:

```bash
./scripts/release.sh canary --dry-run
```

Preview a stable locally:

```bash
./scripts/release.sh stable --dry-run
```

Emergency/manual stable publish:

```bash
./scripts/release.sh stable
git push origin refs/tags/vYYYY.MDD.P
```

## Dependency Policy

`companies.sh` depends on `paperclipai@latest`, so fresh installs resolve the current stable Paperclip release.

That means:

- canary publishes should still be validated against the current Paperclip canary when a change depends on unreleased Paperclip behavior
- stable `companies.sh` releases track the npm `latest` Paperclip dist-tag by default
- if a future `companies.sh` change needs unreleased Paperclip behavior again, pin or override deliberately instead of relying on `latest`

## Smoke Checks

Minimum checks after a publish:

- `npm view companies.sh dist-tags --json`
- `npx companies.sh@canary add --help` after a canary publish
- `npx companies.sh add --help` after a stable publish

If the package behavior changed in a risky way, also run a real dry-run import against a Paperclip instance.

## Rollback

Rollback does not unpublish versions.

It moves the `latest` dist-tag back to a prior stable:

```bash
./scripts/rollback-latest.sh 2026.324.0 --dry-run
./scripts/rollback-latest.sh 2026.324.0
```

Then fix forward with a new stable patch slot.
