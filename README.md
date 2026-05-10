# fileflows-dv

A drop-in replacement for the official [`revenz/fileflows`](https://hub.docker.com/r/revenz/fileflows)
image that bundles [`tvarr-ffmpeg`](https://github.com/jmylchreest/tvarr) — an
ffmpeg build with **libplacebo + libdovi** — under an isolated `/opt` prefix.

The point: convert **Dolby Vision Profile 5** files to **HDR10 Main10** without
the green/purple ICtCp tint that you get from a naive libplacebo invocation
(missing `apply_dolbyvision=true`, or a libplacebo not linked against
libdovi).

```
ghcr.io/jmylchreest/fileflows-dv:latest
ghcr.io/jmylchreest/fileflows-dv:<fileflows-version>   # e.g. :24.04
```

## How it works

* `FROM revenz/fileflows:latest` — keeps the upstream entrypoint, .NET runtime,
  DockerMods, PUID/PGID logic, ports, env. No behaviour changes for normal
  flows.
* tvarr-ffmpeg's `ffmpeg`, `ffprobe`, `/usr/lib`, `/usr/share/vulkan`, and
  `ld-linux-x86-64.so.2` are copied into `/opt/tvarr-ffmpeg/`.
* Wrappers at `/usr/local/bin/{ffmpeg,ffprobe}` invoke the bundled binaries
  through Arch's own dynamic loader with `--library-path` pointed at the
  bundled libs. This dodges the glibc 2.43 (Arch) vs 2.39 (Ubuntu 24.04) ABI
  mismatch — the bundled binary never touches the host libc.
* `/usr/local/bin` precedes `/usr/bin` on `PATH`, so FileFlows' auto-discovery
  picks up the bundled build with no UI configuration.

## Free-tier compliance

[FileFlows free tier](https://fileflows.com/pricing) caps you at:

* **1 processing node** — this image runs the internal node only. No external
  worker pods.
* **5 flow runners** — concurrency cap; unaffected here.
* **30 flow elements per flow** — the bundled DV flow uses one Function
  element plus standard input/route blocks. Well under the cap.

This image deliberately does *not* enable FFNODE-style external worker
deployments.

## Drop-in for an existing FileFlows manifest

Find the image in your existing FileFlows Deployment and change it. Everything
else (PVCs, NFS mounts, `gpu.intel.com/i915`, ports, ingress) stays.

```diff
       containers:
         - name: fileflows
-          image: revenz/fileflows
+          image: ghcr.io/jmylchreest/fileflows-dv:latest
```

A complete worked example (mirroring the layout of the manifest this was built
to extend) lives at [`examples/fileflows.yaml`](examples/fileflows.yaml).

## Bundled flow scripts

All scripts ship at `/opt/fileflows-dv/scripts/` inside the container and at
[`scripts/`](scripts/) in this repo. Two flow shapes are supported.

### Shape A — single all-in-one element

Simplest. One Function element that does detect + convert + skip in one go.

| Script | Outputs |
|---|---|
| `dv-detect-and-convert.js` | `1` converted · `2` skipped (not P5) · `3` error |

```
Input File → Function(dv-detect-and-convert) ─┬─ 1 → Move/Replace Original
                                              ├─ 2 → Goto Next (skip)
                                              └─ 3 → Failure
```

### Shape B — composable elements (visual flow logic)

Smaller scripts wired together via FileFlows `Variables`. Lets you express
`if dv-profile == 5 then transcode else skip` as visible flow branches, and
reuse the same scripts for other profiles or other transcoder configs.

| Script | Reads | Writes | Outputs |
|---|---|---|---|
| `detect-dolby-vision.js` | input file | `Variables.dv.{isDV, profile, blCompat, codecTag}` | `1` is DV · `2` not DV · `3` error |
| `match-dolby-vision-profile.js` | `Variables.dv.profile` (re-probes if unset) | — | `1` match · `2` no match · `3` not DV |
| `set-libplacebo-options.js` | (script parameters, all optional) | `Variables.LibplaceboFilter`, `Variables.X265Params`, `Variables.X265{Crf,Preset,PixFmt}` | `1` ok |
| `transcode-libplacebo-hdr10.js` | the Variables above (sensible defaults if unset) | new working file | `1` converted · `2` error |

Example flow:

```
Input File
  → detect-dolby-vision
      ├─ 1 (is DV) → match-dolby-vision-profile [ExpectedProfile=5]
      │                  ├─ 1 (match) → set-libplacebo-options
      │                  │                → transcode-libplacebo-hdr10
      │                  │                    ├─ 1 → Move/Replace Original
      │                  │                    └─ 2 → Failure
      │                  ├─ 2 (no match) → Goto Next (skip)
      │                  └─ 3 (error)    → Failure
      ├─ 2 (not DV)   → Goto Next (skip)
      └─ 3 (error)    → Failure
```

Five Function elements + I/O blocks — well inside the free-tier 30-element
cap. The variables set by `set-libplacebo-options` can also be referenced
from built-in encoder flow elements that take `${VarName}`-style parameter
substitutions, so you can mix scripts with native FileFlows nodes.

### Importing in the UI

1. **Scripts** → **Add** → **Flow Script** → name it (e.g. `DV: Detect`),
   paste the JS contents.
2. Repeat for each script you want to use.
3. Build the flow above, wiring the outputs as shown.
4. Attach a Library that watches your media path.

### Verifying libdovi

```bash
docker run --rm ghcr.io/jmylchreest/fileflows-dv:latest \
  ffmpeg -hide_banner -h filter=libplacebo 2>&1 | grep apply_dolbyvision
```

Should print `apply_dolbyvision <boolean> ...` — confirms libplacebo was
linked against libdovi at build time.

Verify the bundled ffmpeg has libdovi support:

```bash
docker run --rm ghcr.io/jmylchreest/fileflows-dv:latest \
  ffmpeg -hide_banner -h filter=libplacebo 2>&1 | grep -i dolby
```

You should see `apply_dolbyvision` listed.

## Tagging & release cadence

* `:latest` always points at the newest successful build.
* `:<fileflows-version>` (e.g. `:24.04`) tracks the upstream FileFlows
  `org.opencontainers.image.version` label.
* The build workflow runs **nightly**, but only pushes when either upstream
  image's manifest digest has changed since our previous `:latest`. Manual
  runs (`workflow_dispatch`) and pushes to `main` always rebuild; manual runs
  also expose a `force` toggle.
* Source digests are stamped into the published image as the labels
  `fileflows-dv.fileflows.digest` / `fileflows-dv.tvarr-ffmpeg.digest`, which
  is how the workflow decides whether to rebuild.

## Local build

```bash
docker build -t fileflows-dv:dev .
docker run --rm fileflows-dv:dev ffmpeg -version
docker run --rm fileflows-dv:dev ffmpeg -hide_banner -h filter=libplacebo \
  2>&1 | grep apply_dolbyvision
```

## License

MIT. tvarr-ffmpeg and FileFlows retain their own licences; this repo ships no
upstream binaries directly — they are pulled at build time from each
project's published image.
