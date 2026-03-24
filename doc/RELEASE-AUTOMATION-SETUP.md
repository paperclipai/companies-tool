# Release Automation Setup

One-time control-plane setup required before the GitHub workflow can publish `companies.sh`.

## 1. npm package ownership

Use `companies.sh` as the current publish target.

The shorter `companies` package name is not available to us right now, so do not switch package names without a separate ownership decision.

Re-check the current target package immediately before the first publish:

```bash
npm view companies.sh name version --json
```

## 2. Create the npm package through the first publish

The first successful trusted publish will create the package entry.

Use the canary path first so `latest` is not pointed at an untested initial release.

## 3. Configure npm trusted publishing

In npm package settings for `companies.sh`, add a trusted publisher for:

- provider: GitHub Actions
- repository: `paperclipai/companies-tool`
- workflow file: `.github/workflows/release.yml`
- environment: `npm-canary`

Add a second trusted publisher entry for:

- provider: GitHub Actions
- repository: `paperclipai/companies-tool`
- workflow file: `.github/workflows/release.yml`
- environment: `npm-stable`

The workflow already requests `id-token: write`; no `NPM_TOKEN` secret should be stored in GitHub for this flow.

## 4. Create GitHub environments

Create these environments in the GitHub repo:

- `npm-canary`
- `npm-stable`

Recommended protection:

- `npm-canary`: no approval required
- `npm-stable`: required reviewer approval before publish

## 5. Branch protection and ownership

Protect `master` so the canary publish only runs from reviewed merges.

Keep [`.github/CODEOWNERS`](../.github/CODEOWNERS) active for:

- [`.github/workflows/release.yml`](../.github/workflows/release.yml)
- [`scripts/release.sh`](../scripts/release.sh)
- [`scripts/release-lib.sh`](../scripts/release-lib.sh)
- [`scripts/rollback-latest.sh`](../scripts/rollback-latest.sh)
- [`doc/RELEASING.md`](RELEASING.md)
- [`doc/PUBLISHING.md`](PUBLISHING.md)

## 6. First publish checklist

1. Merge the release automation to `master`.
2. Confirm npm trusted publisher entries exist.
3. Confirm GitHub environments exist.
4. Let the first `master` push publish a canary.
5. Verify:
   - `npm view companies.sh dist-tags --json`
   - `npm view companies.sh@canary version`
   - `npx companies.sh@canary add --help`
6. After validating the canary, run a manual stable dry-run.
7. Approve and run the first stable publish.
