# Dependency inventory and bootstrap

`dependencies.manifest.json` is the auditable dependency inventory for local builds and all release jobs. `download-dependencies.bat` reads that manifest, installs into user-scoped locations, and does not require a machine-wide Node.js installation.

## Exact local toolchain

| Dependency | Version or identity | Verification |
| --- | --- | --- |
| Git for Windows MinGit x64 | `2.55.0.windows.2` | Official archive SHA-256 plus both installed `git.exe` SHA-256 values |
| Node.js portable Windows x64 | `22.18.0` | Official archive SHA-256 `c95d8a7e1c99e669cc08c9f1176e068c1f50847c37908fcb8c35b62482366511` plus installed executable SHA-256 |
| npm | `10.9.3` | Exact version bundled with Node.js 22.18.0 |
| npm dependency graph | `package-lock.json` | npm lockfile integrity during `npm ci` |
| Electron | `44.0.0` | Exact direct package version, official archive SHA-256, and installed `electron.exe` SHA-256 |
| electron-builder | `26.15.3` | Exact direct package version |
| electron-builder-squirrel-windows | `26.15.3` | Exact direct package version |
| `@electron/asar` | `4.3.0` | Exact direct package version |
| `sharp` | `0.34.3` | Exact direct package version |
| `resedit` | `1.7.2` | Exact direct package version |
| Bundled Squirrel 7-Zip x64 executable | Package-supplied binary | SHA-256 `c7245e21a7553d9e52d434002a401c77a7ca7d0f245f2311b0ddf16f8f946c6f` |
| Bundled Windows resource editor | Package-supplied binary | SHA-256 `e2df7b664db830f159d0dc6b3da8a95442cca175b9577f2d19952646d37ac32f` |
| Bundled Squirrel executable toolchain | Package-supplied binaries | Exact committed SHA-256 values for `Squirrel.exe`, `Setup.exe`, and `WriteZipToSetup.exe` |

The portable Node.js archive comes from `https://nodejs.org/dist/v22.18.0/`. Its canonical checksum source is the matching official `SHASUMS256.txt` file.

MinGit comes from the exact `git-for-windows/git` release asset. The bootstrap rechecks the cached archive and both extracted executables on every warm run. A wrong cached archive is removed; an invalid installed runtime is moved aside for recoverable inspection before the verified replacement is activated.

## One-click bootstrap

Run:

```bat
download-dependencies.bat
```

For automation, use any of these silent forms:

```bat
download-dependencies.bat /s
download-dependencies.bat --silent
set SILENT=1 && download-dependencies.bat
```

The script performs these phases:

1. Bootstrap exact MinGit from its official archive and verify the archive, command executable, core executable, and reported version.
2. Read the exact Node.js version and digests from the committed manifest.
3. Reuse a user-scoped portable Node runtime only after rechecking both its cached archive and installed executable.
4. Download an absent official archive, verify SHA-256, extract to a unique staging directory, and move the complete runtime into place.
5. Run `npm ci --ignore-scripts=false --no-audit --no-fund` against the lockfile.
6. Require exact equality among the hand-written package inventory, `package.json`, the lockfile root, and every direct lockfile package record.
7. Recheck the Electron archive and installed runtime executable.
8. Select and verify the exact x64 7-Zip helper used by Squirrel.Windows.
9. Verify the resource editor binary before it can alter executable icon resources.
10. Verify every Squirrel executable used to create `Update.exe` and the setup payload before packaging.
11. Validate the dependency, release metadata, workflow-job, and workflow-tool schemas.

Warm runs repeat integrity checks and reuse the existing portable runtime and npm cache. Installed dependencies remain outside source control.

## GitHub Actions job inventories

The Windows job uses `windows-2025`, exact MinGit 2.55.0.windows.2, Node.js 22.18.0, npm 10.9.3, Windows PowerShell 5.1, exact GitHub CLI 2.98.0, and Squirrel.Windows. The committed bootstrap installs or reuses only the digest-verified 2.98.0 portable archive and verifies the extracted executable digest before use.

The Linux container job uses `ubuntu-24.04`, Git `>=2.43.0 <3.0.0` with the signed Ubuntu package as fallback, Node.js 22.18.0, npm 10.9.3, exact digest-verified GitHub CLI 2.98.0, GNU tar `>=1.35 <2.0`, Docker Engine 29.6.1, and Docker Buildx 0.27.0. Immutable setup actions install the exact Docker components.

The publication job uses `ubuntu-24.04`, the same Git, GitHub CLI, Node.js, npm, GNU tar, and exact lockfile graph. It does not install container tools it never invokes.

The finalization job uses `ubuntu-24.04` and the same Git, exact GitHub CLI, Node.js, npm, GNU tar, and lockfile graph. It independently selects and revalidates both product transfers, then performs read-only release verification while workflow completion timing remains pending.

All three Ubuntu jobs, `linux-container`, `publish-release`, and `finalize-release`, require GNU tar `>=1.35 <2.0` and run `tar --version` before their first real action. The bootstrap accepts an already compatible GNU tar or installs the signed Ubuntu 24.04 package fallback, then reruns the version probe. This inventory is repeated per job because each job starts in an independent environment.

`scripts/release/bootstrap-job-tools.mjs` checks compatible Git first, but always installs or reuses the exact digest-verified GitHub CLI transport instead of trusting an arbitrary compatible installation. It also repairs a checkout that lacks Git history and proves `HEAD` equals `GITHUB_SHA`. Each of the four jobs runs its complete version probe list before its first packaging, publication, or finalization action. A runner label identifies the operating environment, not a prepared toolchain.

## Failure modes

- A digest mismatch stops before extraction or resource editing.
- A missing or incompatible Git or GitHub CLI stops unless its canonical fallback installs and verifies successfully.
- An incomplete Electron package stops when `electron.exe` remains absent.
- A missing lockfile stops because dependency integrity cannot be reproduced.
- A direct package version mismatch stops before packaging.
- A failed npm install reports the lockfile-backed install phase as the blocker.
- A missing, non-GNU, or out-of-range tar command stops each affected Ubuntu job unless the signed Ubuntu fallback installs and verifies successfully.

No bootstrap path installs credentials, code-signing material, or standard Git LFS.

## Suggested articles

- [GitHub Actions release automation](automation.md)
- [OCI container packaging](container-packaging.md)
- [Windows application and Squirrel.Windows packaging](windows-packaging.md)
