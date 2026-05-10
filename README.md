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

## Using the bundled DV flow script

The DV detect/convert JS lives at `/opt/fileflows-dv/scripts/dv-detect-and-convert.js`
inside the container, and at [`scripts/dv-detect-and-convert.js`](scripts/dv-detect-and-convert.js)
in this repo.

In the FileFlows UI:

1. **Scripts** → **Add** → **Flow Script** → name it `DV P5 → HDR10`, paste
   the contents of `dv-detect-and-convert.js`.
2. Build a flow:
   * **Input File** → **Function** (your script) → outputs:
     * `1 Converted` → **Move/Replace Original File**
     * `2 Skipped` → **Goto next** (or terminate as success)
     * `3 Error` → **Failure**
3. Wire the flow up to a Library that watches your media path.

The script:

* Probes with `ffprobe` and inspects `side_data_list` for a DOVI configuration
  record.
* If `dv_profile == 5`, transcodes with libplacebo (`apply_dolbyvision=true`)
  to HDR10 BT.2020 PQ Main10 and copies audio/subs.
* Profiles 7/8 (which have an HDR10-compatible base layer) are left alone.
* Non-DV files are left alone.

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
