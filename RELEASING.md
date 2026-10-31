## Prepared release 0.3.0

Prepared on 2026-10-31. Publication is pending; verify the registry before updating stable install instructions. See CHANGELOG.md for compatibility notes.

# Releasing @valen-team/sdk

`@valen-team/sdk@0.2.1` was published on 2026-10-30 from tag `npm-v0.2.1` through GitHub Actions with npm Trusted Publishing and provenance ([workflow](https://github.com/Valen-Team/valen-sdk-js/actions/runs/40990770510)). Provenance requires `repository.url` in `package.json` to match the GitHub repository's case exactly (`Valen-Team/valen-sdk-js`).

## 0.2.0

0.2.0 was published on [npm](https://www.npmjs.com/package/@valen-team/sdk/v/0.2.0) as `@valen-team/sdk@0.2.0`; `latest` points to `0.2.0`. Registry integrity matches the reviewed artifact; see `validation/npm-0.2.0.json`. The npm package name is `@valen-team/sdk`. The original `@valen` scope was unavailable. The existing GitHub `v0.2.0` tag is preserved; the `npm-v0.2.0` tag records the new scope. Change dependency names and imports to `@valen-team/sdk`. Inference source and dependency versions are unchanged.

The authorized npm account must have publishing rights in the `valen-team` organization. From the reviewed source run `npm test`, `npm run typecheck`, and `npm pack --ignore-scripts`. Inspect the tarball, then publish that exact tarball with `npm publish PATH_TO_TARBALL --access public --registry=https://registry.npmjs.org`. Complete any interactive 2FA challenge in the browser. Do not commit registry credentials or reuse GitHub/HF credentials.

After publication query `https://registry.npmjs.org/@valen-team%2fsdk/0.2.0`; verify the exact name/version, integrity, file size and dist-tag. Update the bilingual README and website only after the registry confirms publication. The published tarball is immutable; GitHub artifact hashes are recorded separately. The earlier GitHub release used a different scope and is not evidence of npm publication.

## Later releases

Releases publish from GitHub Actions through [`.github/workflows/publish.yml`](.github/workflows/publish.yml) with npm Trusted Publishing, so no npm token or browser 2FA is needed.

One-time setup: on npmjs.com, open `@valen-team/sdk` → Settings → Trusted Publisher, choose GitHub Actions and enter organization `Valen-Team`, repository `valen-sdk-js`, workflow `publish.yml` and environment `npm`. Create the `npm` environment under the repository's Settings → Environments.

For each release:

1. Set the version in `package.json`, `package-lock.json` (two root entries) and `VERSION` in `src/index.js`; `npm test` checks that `VERSION` matches `package.json`.
2. Add the release to `CHANGELOG.md` and update the install commands in both READMEs.
3. Commit, then tag and push `npm-vX.Y.Z`. The workflow runs the tests and type checks and publishes with provenance.

Python `valen-sdk` publishes separately on PyPI.
