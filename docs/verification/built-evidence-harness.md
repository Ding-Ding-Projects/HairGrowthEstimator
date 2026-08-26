# Built Evidence Harness

This document defines the low-cost, headless evidence route for the packaged Windows desktop application. The route is intentionally disabled until a final committed source candidate, a clean packaged build, isolated application data roots, and immutable packaging provenance are all available together.

The harness has not captured the unfinished interface. Its presence is infrastructure, not proof that the current product is complete, visually correct, private, or ready to release.

## What the harness proves

For each declared interaction, the harness binds all of the following into a resumable ledger:

- the exact source commit;
- the packaged executable SHA-256;
- the packaged `resources/app.asar` SHA-256;
- a complete manifest hash for the task-owned frozen package copy that is actually launched;
- the packaging receipt SHA-256;
- the CSS viewport, display scale, theme, language, and derived capture pixel size;
- the semantic state before input;
- one unique target selector and its exact accessibility name;
- the exact HWND-targeted input method and bounded input parameters;
- the expected transition and observed semantic state after input;
- the original pre-input and post-input PNG paths, hashes, dimensions, and media identities;
- automated privacy checks;
- a separate human pixel and sensitive-data inspection;
- a deterministic completion marker.

The recording helper binds the same source, package, renderer tuple, process tree, dynamic HWND, privacy checks, input targets, durable input phases, and per-frame PNG hashes into one short animated WebP receipt. It then requires a separate human inspection and a fresh completed-receipt verification before the recording can be marked complete.

## What the harness does not prove

The harness does not infer product completeness from a final image, source preview, mock, design file, filename list, or renderer-only injection. It does not approve sensitive pixels automatically. It does not prove that an interaction inventory includes every reachable feature. That inventory must be authored and reviewed separately.

The helper also does not build the application. Building and capturing are separate trust boundaries. A package must already exist and must carry the version 2 packaging receipt described below.

## Required preflight conditions

Every condition is mandatory. A missing condition stops the run.

1. The source checkout is at the exact planned commit and has no tracked or untracked changes.
2. The package was produced from that commit in a disposable package directory.
3. The package build did not modify tracked source bytes.
4. `dist/package/packaged-app-manifest.json` exists under the disposable package directory and matches the version 2 receipt contract.
5. The executable, `resources/app.asar`, staged provenance file, and packaging receipt hashes match the plan.
6. The executable reports `NotSigned`, consistent with the project signing policy.
7. The application supports all three evidence switches before normal startup reads:
   - `--evidence-mode`
   - `--evidence-app-data=<absolute path>`
   - `--evidence-user-data=<absolute path>`
8. The application writes both evidence isolation records before normal startup reads:
   - `<userData>/evidence-isolation.json`
   - `<appData>/evidence-app-data-active.json`
9. The cheap Lowlevel MCP server is available at the exact credential-free `http://127.0.0.1:<port>/mcp` route and exposes the complete required tool inventory.
10. The planned CDP port is unused before launch, then is owned by exactly one process inside the captured process tree and listens only on loopback.
11. The packaged application exposes exactly one page target at the exact planned URL, and the WebSocket endpoint remains unchanged through every capture boundary.
12. The run uses a fresh `%TEMP%\<run-id>\.hair-growth-evidence-task` directory. The directory and its parents contain no symbolic links or junctions.

## Owned files

| Path | Purpose |
| --- | --- |
| `scripts/evidence/common.mjs` | Bounded JSON, source and package hashes, owned frozen-directory manifests, path containment, atomic receipts, strict PNG chunk validation, and strict WebP structure validation. |
| `scripts/evidence/mcp-client.mjs` | Streamable HTTP MCP client, cheap headless tool preflight, dynamic owned-window discovery, window-only capture, and HWND-targeted input. |
| `scripts/evidence/cdp-client.mjs` | Exact CDP target isolation, declarative read-only semantic probes, accessibility proof, input-target proof, live tuple proof, bounded renderer privacy scan, and bounded network accounting. |
| `scripts/evidence/process-identity.mjs` | Windows process-tree identity, creation-time proof, executable binding, late-descendant reconstruction, exact pre-PID launch-candidate recovery, CDP listener ownership, revalidation, child-first cleanup ordering, and safe command-line quoting. |
| `scripts/evidence/plan.mjs` | Strict plan schema, run-root ownership, dual data-root arguments and receipts, and packaging receipt verification. |
| `scripts/evidence/ledger.mjs` | Durable pre-capture, input-intent, input-applied, post-capture, and completion phases; bounded retry; stale binding refusal; capture inspection; deterministic completion marker; and resume decisions. |
| `scripts/evidence/run-lock.mjs` | Atomic exclusive task-run command ownership, exact process identity, release proof, overlap refusal, and stale-owner recovery. |
| `scripts/evidence/evidence-run.mjs` | Prepare, interact, inspect, status, bounded launch recovery, safe pre-input reset, and owned cleanup commands. |
| `scripts/evidence/record-window.mjs` | Window-only frame capture, durable per-action recovery phases, pinned ffmpeg encoding, WebP validation, decoder round trip, receipt creation, recording inspection, and completed-receipt verification. |

No root package script is required. This avoids changing the shared package manifest solely to register a developer-only helper.

## Evidence plan

Store the plan in a task-owned temporary directory, not in source control. The plan contains absolute local paths and is not a public receipt.

```json
{
  "schemaVersion": 1,
  "runId": "release-1.0.123-main-dark-en",
  "route": "cheap-lowlevel-headless",
  "captureKind": "window",
  "repoRoot": "C:\\path\\to\\clean-source-checkout",
  "sourceSha": "0123456789abcdef0123456789abcdef01234567",
  "runRoot": "C:\\path\\to\\system-temp\\release-1.0.123-main-dark-en\\.hair-growth-evidence-task",
  "artifact": {
    "primary": {
      "id": "executable",
      "sha256": "<64 lowercase hexadecimal characters>"
    },
    "components": [
      {
        "id": "app-asar",
        "sha256": "<64 lowercase hexadecimal characters>"
      },
      {
        "id": "build-receipt",
        "sha256": "<64 lowercase hexadecimal characters>"
      }
    ]
  },
  "artifactPaths": {
    "executable": "C:\\disposable-package-root\\dist\\win-unpacked\\Hair Growth Estimator.exe",
    "app-asar": "C:\\disposable-package-root\\dist\\win-unpacked\\resources\\app.asar",
    "build-receipt": "C:\\disposable-package-root\\dist\\package\\packaged-app-manifest.json"
  },
  "application": {
    "executableArtifactId": "executable",
    "arguments": []
  },
  "isolation": {
    "appDataDirectory": "app-data",
    "userDataDirectory": "user-data",
    "receiptFile": "evidence-isolation.json",
    "appDataMarkerFile": "evidence-app-data-active.json"
  },
  "cdp": {
    "port": 45678,
    "expectedUrl": "file:///C:/disposable-package-root/dist/win-unpacked/resources/app.asar/app/renderer/index.html",
    "timeoutMs": 10000
  },
  "mcp": {
    "endpoint": "http://127.0.0.1:8765/mcp",
    "timeoutMs": 10000
  },
  "window": {
    "titlePattern": "^Hair Growth Estimator$",
    "classPattern": "^Chrome_WidgetWin_1$",
    "timeoutMs": 10000
  },
  "tuple": {
    "viewport": {
      "width": 1440,
      "height": 960
    },
    "scale": 1,
    "theme": "dark",
    "language": "en"
  },
  "privacyPatterns": [
    {
      "id": "private-key",
      "source": "-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
      "flags": "i"
    },
    {
      "id": "credential-assignment",
      "source": "(?:password|passwd|api[_-]?key|secret|access[_-]?token)\\s*[:=]\\s*[\"\\']?[^\\s\"\\'<>]{8,}",
      "flags": "i"
    },
    {
      "id": "bearer-secret",
      "source": "\\bBearer\\s+[A-Za-z0-9._~+/=-]{8,}",
      "flags": "i"
    },
    {
      "id": "user-profile-path",
      "source": "\\b[A-Za-z]:[\\\\/](?:Users|Documents and Settings)[\\\\/][^\\\\/\\s\"\\'<>]+",
      "flags": "i"
    }
  ],
  "allowedNetworkOrigins": [],
  "steps": [
    {
      "id": "open-settings",
      "target": {
        "selector": "#settings-tab",
        "accessibleName": "Settings"
      },
      "input": {
        "method": "mouse_click",
        "x": 72,
        "y": 256,
        "button": "left",
        "clicks": 1
      },
      "expectedTransition": "Settings is the selected tab and its panel is visible.",
      "semantic": {
        "probe": {
          "kind": "attribute",
          "selector": "#settings-tab",
          "name": "aria-selected"
        },
        "beforeEquals": "false",
        "afterEquals": "true",
        "pollIntervalMs": 100,
        "timeoutMs": 5000
      }
    }
  ]
}
```

`tuple.viewport` is the renderer viewport in CSS pixels. `tuple.scale` is the live `window.devicePixelRatio`. The helper derives `capturePixelSize` as `viewport × scale`, rounded to whole pixels, and requires every client-only captured PNG to match it. The live renderer independently proves the CSS viewport, scale, theme, and language. The Win32 window inventory reports the outer rectangle, which may include bounded invisible resize borders around a frameless window. The harness therefore requires that outer rectangle to be a small non-negative envelope around the exact client capture instead of incorrectly requiring both rectangles to have identical dimensions. The live theme comes from `document.body.dataset.theme`. The live language comes from `document.documentElement.lang`.

The plan cannot predeclare evidence, data-root, user-data, or debugging switches. The harness owns those switches and appends each exactly once. Semantic checks are declarative read-only probes, never caller-authored JavaScript. Supported probes read one allowlisted state attribute, one allowlisted primitive state property, visibility, or a selector count. Text content, form values, markup, object properties, and arbitrary attributes are not semantic-probe surfaces.

All four privacy records shown above are mandatory in that exact order with those exact identifiers, sources, and flags. The plan cannot add caller-authored regular expressions. This keeps privacy evaluation bounded to the reviewed fixed inventory and prevents an unsafe expression from becoming a renderer hang or a private-data query.

Mouse coordinates are captured-pixel client coordinates. Before input, the helper divides by the pinned scale, calls `document.elementFromPoint`, and requires the hit node to be the unique registered target or its descendant. Keyboard input requires the unique registered target to contain the current active element.

## Package receipt contract

The build receipt is schema version 2. The harness validates these boundaries before any evidence command can proceed:

- `sourceCommit` equals `sourcePreservation.candidateCommit` and the planned source commit;
- `sourcePreservation.verified` is `true`;
- the executable signing state is exactly `NotSigned`;
- the executable and `appAsar` byte counts are positive and equal the reread file sizes;
- the executable and `appAsar` paths resolve inside the disposable package directory;
- the build receipt itself is exactly `dist/package/packaged-app-manifest.json` inside that directory;
- the staged provenance path resolves inside that directory;
- `provenance.logicalPath` is exactly `app/provenance.json`;
- staged and packaged provenance hashes are equal;
- the source preservation receipt exists at its declared path;
- each `sourceBinding.appAsar` and `sourceBinding.server` record has the exact keys `fileCount`, `bytes`, `inventorySha256`, and `files`;
- every source-binding file has the exact keys `path`, `source`, `bytes`, and `sha256`;
- source-binding paths are unique and use JavaScript default code-unit ordering, `fileCount` equals the complete record count, and aggregate bytes equal the record sum;
- each source-binding inventory hash is recomputed over the UTF-8 concatenation `path + NUL + bytes + NUL + sha256 + LF` for every ordered record;
- icon inventories have bounded, valid identities;
- the plan paths and hashes equal the receipt paths and hashes;
- the executable, `app.asar`, and staged provenance bytes are hashed again from disk.

The build receipt may contain absolute local paths, so it remains local build evidence. The per-click ledger stores only bound hashes and safe relative evidence paths.

The version 2 receipt is the accepted package-composition trust boundary. The harness independently validates the complete record arrays and their canonical hashes, rereads the executable, `app.asar`, staged provenance, and receipt bytes, and binds the result to the clean source commit. Before launch it copies the complete packaged application directory into the owned run root, inventories every regular file, compares source-before, source-after, and frozen-copy manifests, then launches only the frozen executable. Every later runtime boundary rehashes that frozen directory and refuses changed bytes. It does not unpack `app.asar` or reinterpret each descriptive `source` field. The package producer owns the source-to-package comparison and must reject an incomplete or mismatched receipt before publication.

## Run lifecycle

### 1. Self-check

```powershell
node scripts/evidence/evidence-run.mjs self-test
node scripts/evidence/record-window.mjs self-test
```

These commands validate command registration only. They do not launch or capture the application.

### 2. Prepare

```powershell
node scripts/evidence/evidence-run.mjs prepare --plan "C:\path\to\temporary\evidence-plan.json"
```

Prepare performs the following ordered work:

1. verify the clean source commit and all package hashes;
2. validate the version 2 package receipt;
3. preflight the cheap Lowlevel tool inventory;
4. refuse a pre-existing hidden desktop with the owned name;
5. refuse a pre-existing listener on the planned CDP port;
6. create the fresh owned temporary run root and read its owner marker back;
7. write and read a bounded recovery marker before launch;
8. launch the packaged executable directly on the named hidden desktop;
9. prove that the returned PID did not exist in the pre-launch process inventory;
10. capture and persist the process tree identity;
11. resolve exactly one non-zero application HWND dynamically by process ownership, title, and class;
12. refuse any unowned visible window on that desktop;
13. verify the derived pixel size;
14. prove that the CDP listener belongs to exactly one process in the launched tree and is loopback-only;
15. read and verify both isolated data-root receipts;
16. require exactly one CDP page target at the exact expected URL;
17. verify the live viewport, scale, theme, language, renderer privacy, and resource-origin bounds;
18. create the per-click ledger.

Prepare never chooses a window by index and never retains a guessed HWND as proof for later interactions. Every later command resolves and revalidates the HWND again.

Every command that can mutate a ledger, recording, profile, process, or completion record owns one atomic task-run lock. Prepare first creates the otherwise absent run root behind an initialization barrier bound to its exact PID, parent PID, process creation time, and executable. Other commands refuse that initializing run. The same prepare process must acquire the command lock before it removes the barrier or launches anything. The lock receipt binds the exact run-owner marker, command, PID, parent PID, process creation time, executable, and random token. A second mutating command stops before it can read and rewrite shared state. Normal completion rereads the exact receipt before removing the lock.

Before launch, the helper writes a bounded local recovery marker with an `armed` state. The marker binds the owned frozen-package manifest and frozen executable path. After launch it records only the owned run id, hidden desktop name, PID, launch interval, source hash, executable hash, frozen package binding, PID-absence verdict, and eventually the owned process identities. It never stores a command line, URL, title, secret, or unrelated process identity. Exact owned executable paths remain only in the task-local process identity record. Stable prepare removes the marker. A later prepare failure first attempts cleanup from the in-memory exact process identity, so a runtime-state write failure cannot strand a proven process. If the launch call did not durably return a PID, `recover-launch` searches live process data in memory for the exact frozen executable, unique evidence arguments, and bounded creation time without persisting unrelated process or command-line data. It either resolves one owned root, proves that no recent packaged process or listener remains before closing an empty task desktop, or refuses ambiguity. If a PID was already recorded, recovery revalidates the PID, executable, creation interval, owner marker, hidden desktop, frozen bytes, and process tree before cleanup.

### 3. Inspect resume state

```powershell
node scripts/evidence/evidence-run.mjs status --plan "C:\path\to\temporary\evidence-plan.json"
```

The status response reports one of these actions:

| Stored status / phase | Resume action | Meaning |
| --- | --- | --- |
| `pending` / `pending` | `capture` | No trusted input or image exists for this attempt. |
| `running` or `failed` / `pre_captured` | `reset` | A pre-image exists, but no input intent was recorded. A bounded retry is safe. |
| `running` or `failed` / `input_intent` | `restart_run` | Input may have occurred. Reusing the profile could apply a non-idempotent action twice. |
| `running` or `failed` / `input_applied` | `restart_run` | Input definitely occurred. A fresh isolated run is required. |
| `captured` | `inspect` | Both original images and the semantic transition are present, but human inspection is still required. |
| `completed` | next step | Hashes, inspection, and completion marker still match. |

Status rereads the source, the package receipt, all package hashes, every retained PNG, the exact plan-to-ledger projection, and every recomputed completion marker. A stale source, package, image, plan binding, or marker stops resume.

### 4. Run one declared interaction

```powershell
node scripts/evidence/evidence-run.mjs step --plan "C:\path\to\temporary\evidence-plan.json" --step open-settings
```

The command captures a non-uniform, metadata-free pre-input PNG from the dynamic HWND and revalidates every boundary. It persists `pre_captured`, then persists `input_intent` before performing one HWND-targeted input. Immediately after input it persists the exact input receipt and `input_applied`. It polls the declarative semantic probe with a fixed deadline, then revalidates the exact CDP target, listener owner, renderer privacy, resource origins, process tree, and same HWND before and after the post-input PNG. It rereads the declarative semantic state after the PNG and binds that post-capture value separately from the initially observed post-input state.

The step stops in `captured`, not `completed`.

### 5. Inspect original pixels

The reviewer opens the exact pre-input and post-input PNGs from the ledger and writes a separate temporary inspection file:

```json
{
  "schemaVersion": 1,
  "stepId": "open-settings",
  "preSha256": "<ledger pre-image SHA-256>",
  "postSha256": "<ledger post-image SHA-256>",
  "pixelsInspected": true,
  "sensitiveDataReviewed": true,
  "targetVisible": true,
  "expectedStateVisible": true,
  "noClipping": true,
  "reviewer": "reviewer-identifier"
}
```

```powershell
node scripts/evidence/evidence-run.mjs inspect --plan "C:\path\to\temporary\evidence-plan.json" --step open-settings --inspection "C:\path\to\temporary\open-settings-inspection.json"
```

The inspection command rereads both PNG identities and hashes. It refuses a copied, replaced, edited, resized, metadata-bearing, blank, or stale image. Only then does it create the completion marker.

### 6. Bounded recovery

```powershell
node scripts/evidence/evidence-run.mjs reset --plan "C:\path\to\temporary\evidence-plan.json" --step open-settings
```

Only `failed` or interrupted `running` steps whose durable phase is `pending` or `pre_captured` can reset. The maximum is three attempts. A step cannot reset when downstream completed evidence exists. Once `input_intent` exists, reset is refused because the input may already have occurred. The only safe recovery is a fresh run id, fresh dual-profile directories, and a new isolated launch. A `captured` step must be inspected. It cannot be silently recaptured over valid original bytes.

If prepare stopped after launch and left `launch-recovery.json`, run:

```powershell
node scripts/evidence/evidence-run.mjs recover-launch --plan "C:\path\to\temporary\evidence-plan.json"
```

Recovery does not trust a PID alone. When a PID was recorded, it requires the exact owner marker and plan hashes, proves the PID was absent before launch, validates its creation time inside the recorded launch interval, matches the pinned executable, reconstructs the live process tree, refuses unowned visible windows, and then uses the same owned cleanup path. When launch remained armed without a PID, recovery either identifies exactly one process from the pinned executable, unique evidence arguments, and bounded launch time, or proves that no recent matching process, listener, or visible task window remains. A missing or ambiguous identity remains a refusal.

If a command process stopped while owning `.evidence-command-lock`, run:

```powershell
node scripts/evidence/evidence-run.mjs recover-lock --plan "C:\path\to\temporary\evidence-plan.json"
```

Lock recovery rereads the task owner marker and exact lock receipt. It refuses recovery while the recorded PID, parent PID, creation time, and executable still identify a live process. Only a missing or reused process identity permits removal of the exact lock file and directory.

### 7. Owned cleanup

```powershell
node scripts/evidence/evidence-run.mjs cleanup --plan "C:\path\to\temporary\evidence-plan.json"
```

Cleanup rereads the run-owner marker, revalidates the root process creation time and frozen executable, refuses any unowned visible window, attempts a targeted <kbd>Alt</kbd>+<kbd>F4</kbd>, then terminates only still-live identities from the owned process tree in child-first order. Every runtime boundary persists newly proved identities. Cleanup also reconstructs late descendants through the saved parent chain, refuses PID reuse, and includes those descendants even when the original root already exited. If every recorded process already exited, an empty owned-PID set is accepted only when the task desktop has no visible window. It closes only the named hidden desktop and rereads the owner marker again. Only after those proofs does it delete the two exact isolated task-profile directories and replace the local runtime state with a redacted cleanup receipt. Ledger files, captured evidence, and frozen verification inputs remain.

Cleanup never enumerates arbitrary visible desktops and never terminates a process based on a PID alone.

## Window-only recording

Recording requires a pinned local ffmpeg executable. Its absolute path remains in the temporary recording plan, while only its SHA-256 enters the public-safe receipt.

```json
{
  "schemaVersion": 1,
  "recordingId": "main-walkthrough",
  "frameRate": 4,
  "durationSeconds": 20,
  "outputFile": "recordings/main-walkthrough.webp",
  "encoder": {
    "kind": "ffmpeg",
    "path": "C:\\tools\\ffmpeg\\ffmpeg.exe",
    "sha256": "<64 lowercase hexadecimal characters>"
  },
  "actions": [
    {
      "atFrame": 8,
      "target": {
        "selector": "#settings-tab",
        "accessibleName": "Settings"
      },
      "input": {
        "method": "mouse_click",
        "x": 72,
        "y": 256,
        "button": "left",
        "clicks": 1
      },
      "semantic": {
        "probe": {
          "kind": "attribute",
          "selector": "#settings-tab",
          "name": "aria-selected"
        },
        "beforeEquals": "false",
        "afterEquals": "true",
        "timeoutMs": 5000,
        "intervalMs": 100
      }
    }
  ]
}
```

```powershell
node scripts/evidence/record-window.mjs capture --plan "C:\path\to\temporary\evidence-plan.json" --recording "C:\path\to\temporary\recording-plan.json"
```

Before the first frame, capture writes a recording progress record bound to the exact run, source, package, tuple, encoder, timing, action plan, and output. Each action advances durably through `pending`, `input_intent`, `input_applied`, and `post_captured`. `input_intent` is written before input, and the exact input receipt is written immediately afterward. An interruption at or after intent can never reset or repeat the action in the same isolated run.

Each frame repeats source, package, frozen-package, exact-target, live-tuple, privacy, CDP listener ownership, process-tree, and dynamic-window proof. An action repeats those proofs after input and before its frame. Every frame repeats them again after capture, including the final frame. Every action receipt retains its selector, accessibility name and role, exact bounded input, declarative semantic probe, expected pre-state, observed pre-state, expected post-state, observed post-state, and the state reread after the frame. The HWND, owner process, class, and bounds must remain unchanged for the recording. Before capture, the complete encoder directory is copied into the owned run root and bound by a complete manifest. Encoding and every later decoder verification use only that frozen executable. The encoder runs directly without a shell, writes an animated lossless WebP, and never receives monitor-capture input. The helper validates VP8X-first and ANIM-before-frame order, exact allowed RIFF chunks, canvas and frame geometry, positive frame duration, nested bitstream dimensions, animation identity, frame count, zero-valued padding, metadata absence, nested frame chunks, and a full decoder round trip.

Inspect recording recovery without performing input:

```powershell
node scripts/evidence/record-window.mjs status --plan "C:\path\to\temporary\evidence-plan.json" --recording "C:\path\to\temporary\recording-plan.json"
```

| Recording state | Action | Meaning |
| --- | --- | --- |
| no progress or output | `capture` | A fresh recording can begin. |
| partial frames, every action still `pending` | `reset` | No input intent exists, so exact partial outputs can be removed and retried. |
| any action at `input_intent`, `input_applied`, or `post_captured` | `restart_run` | Input may have occurred. Use a fresh run id and isolated profiles. |
| captured receipt awaiting inspection | `inspect` | Original frame and WebP bytes remain bound for review. |
| completed receipt | `complete` | Every retained identity and completion marker still verifies. |

Reset only a proven pre-input recording interruption:

```powershell
node scripts/evidence/record-window.mjs reset --plan "C:\path\to\temporary\evidence-plan.json" --recording "C:\path\to\temporary\recording-plan.json"
```

Reset rereads source and package bindings plus the exact progress record. It refuses any action phase beyond `pending`, any completed or pending-inspection receipt, and any partial output lacking its durable progress record.

Recording completion uses this separate inspection file:

```json
{
  "schemaVersion": 1,
  "recordingId": "main-walkthrough",
  "outputSha256": "<recording WebP SHA-256>",
  "frameInventorySha256": "<SHA-256 of the canonical ordered frame receipt array>",
  "everyFrameInspected": true,
  "sensitiveDataReviewed": true,
  "expectedSurfaceOnly": true,
  "expectedFlowVisible": true,
  "noClipping": true,
  "reviewer": "reviewer-identifier"
}
```

```powershell
node scripts/evidence/record-window.mjs inspect --plan "C:\path\to\temporary\evidence-plan.json" --recording "C:\path\to\temporary\recording-plan.json" --inspection "C:\path\to\temporary\recording-inspection.json"
```

Inspection rereads every retained PNG, requires complete ordered frame indexes, compares every action receipt with the exact recording plan, rereads the final WebP, repeats the decoder round trip, and recomputes a deterministic completion marker over the source, package, tuple, encoder, timing, frame, action, output, privacy, and inspection records.

Read the completed receipt and media again at any later promotion boundary:

```powershell
node scripts/evidence/record-window.mjs verify --plan "C:\path\to\temporary\evidence-plan.json" --recording "C:\path\to\temporary\recording-plan.json"
```

`inspect` invokes this verifier after writing completion. The standalone command repeats source and package binding, every frame hash and dimension, every target, role, input, semantic state, privacy boolean, final WebP identity, decoder round trip, and completion-marker computation.

## Privacy boundaries

- Monitor capture is rejected by schema and by the window-capture result check.
- Every screenshot call includes a positive dynamic HWND and must return `mode: window`, the same HWND, `rendered_ok: true`, and the exact owned output path.
- The planned CDP port must be vacant before launch. After launch, every command proves that one loopback listener belongs to the captured process tree. A stale or unrelated local listener stops the run.
- Any extra or replaced CDP target stops the run. The failure receipt records only a generic contamination class, never unrelated URLs or titles.
- Any unowned visible window on the hidden desktop stops discovery, interaction, recording, and cleanup.
- Renderer privacy probes inspect bounded document text, form-control values, accessibility and descriptive attributes, and generated pseudo-element content. They return forbidden pattern identifiers only. Matched text is never persisted, and exceeding the node or character bound is a refusal.
- Network receipts retain counts only. Request URLs and bodies are not written to evidence.
- Local `file:`, `data:`, and `blob:` resources are treated as non-network resources. Any HTTP or HTTPS origin must be explicitly allowlisted.
- Semantic probes are generated by the helper from a fixed read-only schema. A plan cannot submit JavaScript, mutate the document, or read an arbitrary property.
- Semantic results and receipts reject credential-like values and user-profile paths.
- PNG evidence rejects text, compressed text, international text, EXIF, invalid checksums, unsupported pixel formats, trailing bytes, fully transparent frames, and uniform frames.
- PNG evidence also rejects every unknown or optional chunk outside `IHDR`, `IDAT`, and `IEND`, plus compressed streams with unconsumed bytes.
- WebP evidence rejects EXIF, XMP, color-profile metadata, unknown top-level or nested frame chunks, nonzero padding, invalid RIFF lengths, out-of-order structural chunks, invalid frame rectangles or duration, nested bitstream size mismatches, invalid canvas dimensions, and non-animated recording output.
- Application profile roots are unique to the task. Their exact owner marker is verified again immediately before owned cleanup removes them.
- Human pixel inspection remains mandatory. Automated checks cannot certify that an image contains no private visual information.

## Focused checks

Run only the evidence checks:

```powershell
node --test tests/evidence/common.test.mjs tests/evidence/plan-ledger.test.mjs tests/evidence/mcp-cdp.test.mjs tests/evidence/recording-process.test.mjs tests/evidence/recovery.test.mjs tests/evidence/run-lock.test.mjs tests/evidence/harness-cli.test.mjs
```

The deliberate visible-capture break is independently runnable:

```powershell
node tests/evidence/deliberate-red-probe.mjs
```

Expected result: exit code 1 with `VISIBLE_CAPTURE_FORBIDDEN`.

Restore the valid contract by running:

```powershell
node scripts/evidence/evidence-run.mjs self-test
```

Expected result: exit code 0 with `window-only-evidence-v1`.

Additional focused negative checks cover extra or replaced CDP targets, a preoccupied CDP port, an unowned or externally reachable listener, a wrong MCP route, unowned or ambiguous windows, monitor-mode screenshot results, non-unique accessibility targets, mismatched input targets, raw semantic JavaScript, missing mandatory privacy records, privacy-scan bound exhaustion, stale package bytes, frozen-directory mutation, incomplete source-binding inventories, a tampered run-owner marker, missing dual-root proof, ambiguous post-input retry, concurrent run-lock ownership, stale lock recovery, invalid recording bounds, recording input-intent reset refusal, mutated recording privacy or semantic receipts, a stale recording completion marker, recording metadata, malformed animated WebP geometry or order, unknown PNG or WebP chunks, invisible PNGs, unsafe receipt values, late process descendants, empty-process cleanup ambiguity, invalid armed launch recovery, path escape, and incomplete process identities.

## Current integration boundary

Do not run this harness against the unfinished interface. Capture remains blocked until all of the following are true on one final commit:

- the main process data-root isolation seam is integrated;
- the non-mutating package provenance route is integrated;
- the source checkout is clean;
- the disposable package build is complete;
- the version 2 receipt is present and independently valid;
- both complete source-binding inventories pass their canonical count, byte-sum, sort, and hash checks;
- the executable and `app.asar` hashes are pinned;
- the planned CDP port is vacant before launch and listener ownership is provable afterward;
- an explicit reviewed interaction inventory and all mandatory privacy records exist;
- the built application has been proven to start with both isolated data roots before any normal data read.

Until then, the correct harness result is refusal, not a fallback capture.
