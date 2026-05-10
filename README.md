# fileflows-dv

A small set of [FileFlows](https://fileflows.com) JavaScript flow scripts for
correct Dolby Vision handling. They run on the **stock** `revenz/fileflows`
image — no custom Docker build required.

## Why this exists

FileFlows ships a built-in **Strip DoVi** flow element (in the *Video* plugin).
It checks whether a video stream carries Dolby Vision and, if so, sets
`Model.StripDovi = true` on the FFmpeg Builder model. When the FFmpeg Builder
Executor later runs, that flag becomes a single ffmpeg argument:
`-bsf:v:0 dovi_rpu=strip=1` — a lossless RPU/EL strip via ffmpeg's
`dovi_rpu` bitstream filter.

That's the right answer for **Profile 7 / 8.x / 10**: those have an HDR10
(or SDR / HLG) base layer that plays perfectly on its own, and the DV RPU is
just dynamic metadata that some non-DV players choke on.

It's the **wrong** answer for **Profile 5**. P5 has no HDR10 fallback — its
base layer is encoded in **ICtCp**, and the only thing telling a player how
to interpret those pixels is the RPU. Strip the RPU and you get a 10-bit
HEVC Main10 stream with no colour transform; players guess BT.709 / BT.2020
Y'CbCr and you get the classic **purple/green tint**.

The built-in Strip DoVi has no profile guard. If you point a flow at a
mixed library, eventually it lands on a P5 release and silently produces a
broken file.

The scripts here:

1. Detect Dolby Vision and surface the **profile** (5, 7, 8.x, 10), not just
   "yes/no", so a flow can branch on it.
2. Provide a **profile-aware** strip that refuses to run on P5.
3. Provide the correct alternative for P5: a libplacebo re-encode with
   `apply_dolbyvision=true`, which uses libdovi to do the real ICtCp →
   BT.2020 PQ pixel transform.

Both ffmpeg paths use libraries that are already present in the stock
`revenz/fileflows` ffmpeg (it bundles `jellyfin-ffmpeg`, built
`--enable-libplacebo`, with libdovi linked into libplacebo). Nothing extra
to install.

## Scripts

| Script | Purpose | Outputs |
|---|---|---|
| [`detect-dolby-vision.js`](scripts/detect-dolby-vision.js) | Probe with ffprobe, write `Variables.dv.{isDV, profile, blCompat, codecTag}`, route on DV presence | 1 Is DV · 2 Not DV · 3 Error |
| [`route-dolby-vision-by-profile.js`](scripts/route-dolby-vision-by-profile.js) | Detect + route by profile in a single element. The one most flows want. | 1 Profile 5 (needs transcode) · 2 Profile 7/8.x/10 (safe to strip) · 3 Not DV · 4 Error |
| [`match-dolby-vision-profile.js`](scripts/match-dolby-vision-profile.js) | `if Variables.dv.profile == ExpectedProfile` — reusable predicate. Re-probes if no cached info. | 1 Match · 2 No match · 3 Not DV/error |
| [`set-libplacebo-options.js`](scripts/set-libplacebo-options.js) | Stash a libplacebo filter string and matching x265 HDR10 params in Variables for downstream consumers (script or `${VarName}`-substituting flow elements). All inputs have sensible defaults. | 1 OK |
| [`transcode-libplacebo-hdr10.js`](scripts/transcode-libplacebo-hdr10.js) | Re-encode through `libplacebo apply_dolbyvision=true` to HDR10 Main10. Reads the variables above; falls back to defaults if unset. | 1 Converted · 2 Error |
| [`strip-dolby-vision-rpu.js`](scripts/strip-dolby-vision-rpu.js) | Lossless RPU strip via `-bsf:v dovi_rpu=strip=1` (the same BSF the built-in StripDoVi uses), **refuses on Profile 5**. | 1 Stripped · 2 Error · 3 Refused (P5) |

All scripts use the FileFlows Flow Script convention: a top-level
`function Script(...)` entry point with `@param`/`@output` JSDoc tags.

## Install

In the FileFlows UI:

1. **Scripts** (left nav) → **Add** → **Flow Script**.
2. Paste the contents of one of the `.js` files. The name FileFlows uses
   comes from the filename of the script; the JSDoc block at the top tells
   FileFlows about parameters and outputs.
3. Repeat for each script you want to use. You don't need all six —
   pick a flow shape below.

## Flow shapes

### Shape A — drop-in replacement for "Strip DoVi"

When all you want is "strip DV if safe, transcode if it would be unsafe":

```
Input File
  → route-dolby-vision-by-profile
      ├─ 1 (Profile 5) ─→ set-libplacebo-options
      │                    → transcode-libplacebo-hdr10
      │                        ├─ 1 → Move/Replace Original
      │                        └─ 2 → Failure
      ├─ 2 (P7/8.x/10) ─→ strip-dolby-vision-rpu
      │                    ├─ 1 → Move/Replace Original
      │                    ├─ 2 → Failure
      │                    └─ 3 → Failure  (shouldn't happen — P5 routed elsewhere)
      ├─ 3 (Not DV) ────→ Goto Next
      └─ 4 (Error) ─────→ Failure
```

Five Function elements plus I/O blocks — well inside the free-tier
30-element-per-flow cap.

### Shape B — composable, explicit branches

When you want the profile predicate visible in the flow:

```
Input File
  → detect-dolby-vision
      ├─ 1 (is DV) ─→ match-dolby-vision-profile [ExpectedProfile=5]
      │                ├─ 1 (match P5) ──→ set-libplacebo-options
      │                │                    → transcode-libplacebo-hdr10
      │                ├─ 2 (other DV) ──→ strip-dolby-vision-rpu
      │                └─ 3 (error)     ──→ Failure
      ├─ 2 (not DV) ─→ Goto Next
      └─ 3 (error)  ─→ Failure
```

Same outcome as Shape A but you can wire the P8.x and P7 branches to
different post-processing if you want.

### Shape C — integrate with FFmpeg Builder

`set-libplacebo-options` writes `Variables.LibplaceboFilter` and
`Variables.X265Params`. Built-in FileFlows flow elements that accept
`${VarName}`-style substitution (e.g. `FFmpeg Builder: Custom Video Filter`,
`FFmpeg Builder: Custom Parameters`) can read these directly, so you can
keep the audio/subtitle/remux logic in the FFmpeg Builder graph and only
use a script to compute the libplacebo + x265 args.

## Verifying your FileFlows ffmpeg has libdovi

```bash
# From whatever shell can reach the FileFlows pod/container
ffmpeg -hide_banner -h filter=libplacebo | grep apply_dolbyvision
```

You should see `apply_dolbyvision <boolean> ...`. That option only exists
when libplacebo was compiled against libdovi, which the stock FileFlows
image's `jellyfin-ffmpeg` is.

## Free-tier compatibility

[FileFlows free tier](https://fileflows.com/pricing) limits:

- **1 processing node** — these scripts run on the internal node, no
  external workers needed.
- **5 concurrent flow runners** — unaffected by the scripts.
- **30 flow elements per flow** — Shape A uses ~5 + I/O; Shape B uses ~6.
  Plenty of headroom.

No paid plugins required.

## Archive

The `archive/` directory contains an earlier version of this repo that
shipped a custom FileFlows Docker image (`ghcr.io/jmylchreest/fileflows-dv`)
layered on `tvarr-ffmpeg`. It turned out the stock `revenz/fileflows` image
already had the libplacebo+libdovi support we needed. See
[`archive/README.md`](archive/README.md) for the full story; the Dockerfile,
wrappers, CI workflow, and example k8s manifest are kept there for
reference.

## Credits / references

- [FileFlows](https://fileflows.com) (Strip DoVi behaviour confirmed by
  decompiling `VideoNodes.dll` → `FfmpegBuilderStripDovi.cs`)
- [libplacebo](https://github.com/haasn/libplacebo) (HDR / DV tone-mapping
  filter)
- [libdovi](https://github.com/quietvoid/dovi_tool) (Dolby Vision metadata
  parsing — what makes `apply_dolbyvision=true` actually transform pixels)
- [jellyfin-ffmpeg](https://github.com/jellyfin/jellyfin-ffmpeg) (the
  ffmpeg build shipped with `revenz/fileflows`)

## License

MIT — see [LICENSE](LICENSE).
