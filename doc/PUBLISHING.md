# Publishing to npm

Low-level reference for how `companies` is prepared and published to npm.

For the maintainer workflow, use [doc/RELEASING.md](RELEASING.md). This document focuses on packaging internals and the release scripts.

## Current Release Entry Points

Use these scripts:

- [`scripts/release.sh`](../scripts/release.sh) for canary and stable publish flows
- [`scripts/rollback-latest.sh`](../scripts/rollback-latest.sh) to repoint `latest`

## Package Metadata

The npm package is:

- package name: `companies`
- executable: `companies`
- repository: `paperclipai/companies-tool`

The repo intentionally publishes a single package. There is no workspace version rewrite step like the main Paperclip repo needs.

## Version Formats

`companies` follows the same semver-safe calendar versioning as Paperclip:

- stable: `YYYY.MDD.P`
- canary: `YYYY.MDD.P-canary.N`

Examples:

- stable: `2026.324.0`
- canary: `2026.324.0-canary.2`

The middle numeric slot is `MDD`, where `M` is the UTC month and `DD` is the zero-padded UTC day.

## Publish Model

### Canary

Canaries publish automatically from `master` under the npm dist-tag `canary`.

Example install:

```bash
npx companies@canary add paperclipai/company-template
```

### Stable

Stable publishes are manual promotions through GitHub Actions and publish under the npm dist-tag `latest`.

Example install:

```bash
npx companies add paperclipai/company-template
```

## What `scripts/release.sh` does

The release script:

1. verifies the worktree is clean
2. optionally runs `pnpm typecheck`, `pnpm test`, and `pnpm build`
3. computes the next calendar version by querying npm
4. rewrites `package.json` temporarily to the publish version
5. previews the publish payload with `npm pack --dry-run`
6. runs `pnpm publish --access public --tag <canary|latest>`
7. creates the matching git tag locally
8. verifies the published version appears on npm

The `package.json` version rewrite is temporary. The script restores the original manifest on exit.

## Trusted Publishing

The intended CI model is npm trusted publishing through GitHub OIDC.

That means:

- no long-lived `NPM_TOKEN` in repository secrets
- GitHub Actions obtains short-lived publish credentials
- trusted publisher rules are configured for `.github/workflows/release.yml`

See [doc/RELEASE-AUTOMATION-SETUP.md](RELEASE-AUTOMATION-SETUP.md) for the required GitHub and npm control-plane setup.

## Rollback Model

Rollback does not unpublish anything.

It repoints the `latest` dist-tag to a prior stable version:

```bash
./scripts/rollback-latest.sh 2026.324.0
```

This restores the default install path while a follow-up stable is prepared.
