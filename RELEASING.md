# Releasing @valen-team/sdk 0.2.0

The npm release target is `@valen-team/sdk`. The original `@valen` scope was unavailable. The existing GitHub `v0.2.0` tag is preserved; the `npm-v0.2.0` tag records the new scope. Change dependency names and imports to `@valen-team/sdk`. Inference source and dependency versions are unchanged.

The authorized npm account must have publishing rights in the `valen-team` organization. From the reviewed source run `npm test`, `npm run typecheck`, and `npm pack --ignore-scripts`. Inspect the tarball, then publish that exact tarball with `npm publish PATH_TO_TARBALL --access public --registry=https://registry.npmjs.org`. Complete any interactive 2FA challenge in the browser. Do not commit registry credentials or reuse GitHub/HF credentials.

After publication query `https://registry.npmjs.org/@valen-team%2fsdk/0.2.0`; verify the exact name/version, integrity, file size and dist-tag. Update the bilingual README and website only after the registry confirms publication. The published tarball is immutable; GitHub artifact hashes are recorded separately. The earlier GitHub release used a different scope and is not evidence of npm publication.

For future automated releases, configure npm Trusted Publishing on the existing package and an appropriate GitHub Actions workflow. npm registration alone does not authorize a GitHub workflow. Python `valen-sdk` is already published on PyPI and is independent of this npm scope migration.
