# GitHub Pages deployment

## Behavior

`.github/workflows/pages.yml` composes and deploys the static documentation website on every push and on an explicit workflow dispatch. The build job checks out the exact commit with complete history, installs the lockfile-defined Node.js dependency graph, runs `npm run compose-site`, configures GitHub Pages, and uploads only `_site`. A second job deploys that uploaded website to the protected `github-pages` environment.

The deployment workflow is independent from release publication. A successful website deployment does not claim that a Windows installer or OCI archive was built. The release workflow remains the only workflow that can publish those downloadable products.

## Configuration

The workflow uses Node.js `22.18.0` on `ubuntu-24.04`. Its permissions are limited to `contents: read`, `pages: write`, and `id-token: write`. Every third-party action is pinned to a full reviewed commit. The deployment concurrency key is scoped to the source ref and cancels an older website-only run when a newer commit replaces it.

The repository must have GitHub Pages configured to use GitHub Actions as its source. The expected public address is `https://ding-ding-projects.github.io/HairGrowthEstimator/`.

## Failure modes

- Lockfile installation failure stops composition before any upload.
- Missing or invalid canonical hair images stop composition rather than deploying an incomplete visual sequence.
- A missing `_site` directory makes the upload step fail.
- Missing Pages permissions or repository configuration makes deployment fail without changing release publication state.
- A superseded website-only run can be cancelled by a newer push. That cancellation is not a successful deployment verdict.

## Security and privacy

The workflow never receives a release credential, repository write credential, signing material, application secret, personal vocabulary file, or private user data. It uploads only the composed static directory. The website contains no analytics, third-party runtime scripts, or copied private configuration.

## Verification

Run the focused workflow contract locally:

```powershell
node --test scripts/release/tests/pages-workflow.test.mjs
```

After deployment, fetch the public page without authentication, verify the served commit-bound provenance, read the Open Graph tags from the returned HTML, and fetch the absolute `og:image` URL as an anonymous client.

## Suggested articles

- [GitHub Actions release automation](automation.md)
- [Provenance, integrity, and line-count evidence](provenance-and-integrity.md)
- [Windows application and Squirrel.Windows packaging](windows-packaging.md)
