# OCI container packaging

The hair-length service is packaged as a deterministic Linux amd64 OCI image layout archive. The archive is a downloadable transport asset for container tools that support OCI archives. It is not published to a registry by default.

## Source and runtime contract

The Dockerfile uses this immutable base:

```text
node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
```

That value is the multi-platform index digest. The selected `linux/amd64` manifest digest is independently pinned as `sha256:76789712cd1ae89a1225eac9077010d68987a423588042dac30446f502f1858c`. Before building, Buildx returns the raw base index bytes. The build helper hashes those retained bytes, requires the declared index digest, selects the exact Linux amd64 descriptor, and requires its independently declared manifest digest. The validator repeats the derivation from the retained raw proof instead of trusting labels. Both identities are recorded in image labels and release metadata.

The image:

- copies only the bounded `server/` build context;
- runs as `node:node`;
- binds the service to `0.0.0.0:4782` for a direct published-port run;
- records OCI source, version, revision, creation, and base-digest labels;
- declares only the service entry point and exposed port.

The Compose definition adds operational restrictions:

- numeric non-root identity `1000:1000`;
- read-only root filesystem;
- writable named volume only for service data;
- `no-new-privileges:true`;
- all Linux capabilities dropped;
- bounded health check and restart policy.

## Build command

After preparing release context:

```text
node scripts/release/build-container.mjs
```

The script invokes Docker Buildx twice with `--no-cache` for `linux/amd64`. Both builds receive the exact version, revision, creation timestamp, base index digest, selected manifest digest, and `SOURCE_DATE_EPOCH`. Additional provenance and SBOM attachments are disabled so the declared output remains exact. Each OCI archive is canonicalized for outer tar ordering, ownership, modes, and timestamps. Publication continues only when both canonical archive hashes, image digests, config digests, and candidate source-binding records are identical.

The `linux-container` job inventories GNU tar `>=1.35 <2.0` explicitly. Its bootstrap checks `tar --version` before container work and installs the signed Ubuntu 24.04 package fallback only when the available command is missing or outside that range. A runner image is never treated as proof that the required archive tool is already present.

## Validation

The validator requires:

- one OCI manifest for `linux/amd64`;
- index, manifest, configuration, and layer descriptors whose media types are allowlisted, whose sizes equal the referenced blob lengths, and whose SHA-256 values match the referenced bytes;
- a non-root image configuration;
- `HAIR_HOST=0.0.0.0` in the runtime environment;
- exact version, revision, source, creation, and base-digest labels;
- supported layer compression;
- the final `/opt/hair-growth/server/` file set and bytes equal to Git blobs from the exact candidate commit.

`container-manifest.json` records the outer archive hash, image and config digests, layer count, both base identities, source binding inventory, runtime constraints, every declared build input hash, and the two-build reproducibility proof.

## Direct local build and run

For ordinary local hosting from source, Docker Compose applies the documented constraints:

Set `HAIR_API_KEY` in the process environment or in an untracked local environment file before starting the service. Never commit the value or place it in a shell history entry.

```text
docker compose up --build -d
```

The service is then reachable through the published port configured in `docker-compose.yml`. Deployers should retain a private-LAN or loopback exposure unless they deliberately add authentication, TLS termination, rate limits, and a reviewed public-network policy.

## Failure modes

- A mutable or mismatched base image stops source validation.
- A missing provenance label stops archive validation.
- A root user or loopback-only container binding stops validation.
- A changed, missing, or extra server file inside the actual image layer stops source binding.
- A corrupt OCI blob stops before a manifest can be emitted.
- A wrong descriptor size or media type stops even when its digest is otherwise self-consistent.
- Any difference between the two no-cache canonical builds stops reproducibility validation.
- A failed build never produces a release-ready `container-manifest.json`.

## Suggested articles

- [Dependency inventory and bootstrap](dependency-inventory.md)
- [Provenance, integrity, and line-count evidence](provenance-and-integrity.md)
