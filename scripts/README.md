# Scripts reference

Each script here is a FileFlows JavaScript Flow Script (Jint runtime, `function Script(...)` entry point, `@param`/`@output` JSDoc). Drop a script into **Scripts → Add → Flow Script** in the FileFlows UI; the filename becomes the element name in the flow editor, and the JSDoc declares its parameters and outputs.

See the [top-level README](../README.md) for the *why*, the flow shapes that wire these together, and free-tier compatibility notes.

---

## `detect-dolby-vision.js`

Probe the working file with ffprobe; stash DV info in `Variables.dv.*` for any downstream element that wants to read it without re-probing.

**Parameters** — none.

**Variables written**

| Name | Type | Meaning |
|---|---|---|
| `Variables.dv.isDV` | bool | True if a DOVI configuration record is present or the codec tag looks DV-like. |
| `Variables.dv.profile` | int \| null | The Dolby Vision profile number (5, 7, 8, 10, …) or null if not present. |
| `Variables.dv.blCompat` | int \| null | Base-layer signal compatibility (1 = HDR10 BL, 2 = SDR BL, 4 = HLG BL, 0 = none). |
| `Variables.dv.codecTag` | string | The raw `codec_tag_string` from ffprobe (e.g. `dvhe`, `dvh1`). |

**Outputs**

| # | Label | When |
|---|---|---|
| 1 | `Is Dolby Vision` | A DOVI configuration record was found (or the codec tag looks DV-like). |
| 2 | `Not Dolby Vision` | No DV signal in either side data or codec tag. |
| 3 | `Error` | ffprobe failed, JSON parse failed, or no video stream. |

---

## `route-dolby-vision-by-profile.js`

Detect Dolby Vision and route the flow by profile in a single element. Combines the work of `detect-dolby-vision` + `match-dolby-vision-profile`. The branches it produces are the ones that matter for picking a correction strategy.

**Parameters** — none.

**Variables written** — same as `detect-dolby-vision.js`: `Variables.dv.{isDV, profile, blCompat, codecTag}`.

**Outputs**

| # | Label | When |
|---|---|---|
| 1 | `Profile 5 (transcode)` | DV Profile 5. Base layer is ICtCp; stripping the RPU alone leaves wrong-coloured pixels. Re-encode through libplacebo `apply_dolbyvision=true`. |
| 2 | `Profile 7, 8.x, 10 (strip)` | DV Profile 7, 8.x, or 10. Base layer is already HDR10 / SDR / HLG; the DV RPU is just dynamic metadata that can be stripped losslessly. |
| 3 | `Not Dolby Vision` | No DOVI configuration record in the video stream's side data. |
| 4 | `Error` | ffprobe failed, JSON parse failed, no video stream, or an unknown DV profile (anything not in 5/7/8/10). |

---

## `match-dolby-vision-profile.js`

Compare the detected DV profile to an expected one. Reads `Variables.dv.profile` (set by `detect-dolby-vision` or `route-dolby-vision-by-profile`); falls back to a fresh ffprobe call if no cached info, so this script also works standalone.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `ExpectedProfile` | int | The DV profile number to match against (e.g. `5`). Required. |

**Outputs**

| # | Label | When |
|---|---|---|
| 1 | `Match` | The file's DV profile equals `ExpectedProfile`. |
| 2 | `No match` | The file's DV profile is a different DV profile. |
| 3 | `Not Dolby Vision` | No DV profile on the file, or ffprobe/JSON-parse error, or `ExpectedProfile` is missing/invalid. |

---

## `set-libplacebo-options.js`

Stash a libplacebo filter string and matching x265 HDR10 parameters in `Variables.*` so downstream consumers — either another script or an `FFmpeg Builder: Custom Parameters` element using `${VarName}` substitution — can pick them up without hard-coding the flags.

Every parameter is optional. Leaving them all at the FileFlows-supplied defaults (blank strings, zero ints) produces a sane HDR10 setup: `bt.2390` tonemap, `yuv420p10le`, libx265 `medium` CRF 18, MaxCLL 1000, MaxFALL 400. `apply_dolbyvision=true` is always set — there's no reason to use this script otherwise.

**Parameters**

| Name | Type | Default | Description |
|---|---|---|---|
| `Tonemapping` | string | `bt.2390` | libplacebo tonemap curve (alternatives: `bt.2446a`, `hable`, `mobius`, `reinhard`). |
| `PixelFormat` | string | `yuv420p10le` | libplacebo output pixel format. |
| `Crf` | int | `18` | libx265 CRF; lower = higher quality. |
| `Preset` | string | `medium` | libx265 preset (`ultrafast`…`placebo`). |
| `MaxCll` | int | `1000` | Max content light level cd/m². |
| `MaxFall` | int | `400` | Max frame-average light level cd/m². |

**Variables written**

| Name | Type | Used by |
|---|---|---|
| `Variables.LibplaceboFilter` | string | `transcode-libplacebo-hdr10`, or `{LibplaceboFilter}` in `FFmpeg Builder: Custom Parameters` |
| `Variables.X265Params` | string | `transcode-libplacebo-hdr10`, or `{X265Params}` in `FFmpeg Builder: Custom Parameters` |
| `Variables.X265Crf` | int | `transcode-libplacebo-hdr10` (Shape C uses the Video Encode Advanced "Quality" field instead) |
| `Variables.X265Preset` | string | `transcode-libplacebo-hdr10` (Shape C uses the Video Encode Advanced "Speed" field instead) |
| `Variables.X265PixFmt` | string | `transcode-libplacebo-hdr10` (Shape C: Builder sets pix_fmt) |

**Companion Custom Parameters string** (use with `FFmpeg Builder: Video Encode Advanced` set to HEVC / `libx265` explicitly / your chosen Quality+Speed on the same branch — Video Encode Advanced commits `libx265` into the Builder model so the Executor doesn't default the video stream to `-c:v:0 copy`):

```
-vf {LibplaceboFilter} -x265-params {X265Params}
```

The Builder element provides `-c:v libx265`, `-preset`, `-crf`, `-pix_fmt`, `-profile:v main10`. The Custom Parameters element only contributes the libplacebo filter and `-x265-params` (which bakes the HDR10 master-display / max-cll SEI into the encoded HEVC). The script's `Crf` / `Preset` / `PixelFormat` parameters become informational in this integration — set those values on the Video Encode Advanced element instead. Also drop `FFmpeg Builder: Disable Intel QSV` on the same branch *before* this script to force software decode (libplacebo can't read QSV hardware buffers).

**Outputs**

| # | Label | When |
|---|---|---|
| 1 | `OK` | Always. |

---

## `set-hevc-qsv-options.js`

Sibling to `set-libplacebo-options.js` for users with Intel iGPU + QSV hardware encode available. Same DV → HDR10 transform via libplacebo, but the encode happens on the iGPU through `hevc_qsv` (much faster than CPU libx265 — typically near realtime on modern Intel hardware).

The filter chain it emits is wrapped with `hwdownload,format=p010le,...,hwupload=extra_hw_frames=64` so it bridges QSV hardware-decoded input frames through libplacebo's CPU pipeline and back into QSV hardware buffers for the encode.

**Tradeoff vs libx265**: HDR10 VUI tags (BT.2020 / SMPTE 2084 / BT.2020nc) survive in the encoded bitstream, but the HDR10 *mastering display* SEI metadata (`master-display=...`, `max-cll=...`) does **not** — the hevc_qsv encoder has no equivalent flag. Most TVs derive HDR display correctly from VUI + PQ pixel values alone; mastering metadata is a per-title peak-luma hint. If you need it baked in, stay on libx265 (`set-libplacebo-options`).

**Important**: don't pair this with `FFmpeg Builder: Disable Intel QSV` on the same branch. The script's `hwdownload` filter requires QSV decode to be in effect; with QSV disabled it would error on software input.

**Parameters**

| Name | Type | Default | Description |
|---|---|---|---|
| `Tonemapping` | string | `bt.2390` | libplacebo tonemap curve. |
| `GlobalQuality` | int | `18` | hevc_qsv quality on the 0–51 scale (lower = better). |
| `Preset` | string | `slow` | hevc_qsv preset (`veryfast`..`veryslow`). |

**Variables written**

| Name | Used by |
|---|---|
| `Variables.LibplaceboFilter` | Custom Parameters `-vf` |
| `Variables.QsvGlobalQuality` | `-global_quality {QsvGlobalQuality}` |
| `Variables.QsvPreset` | `-preset {QsvPreset}` |
| `Variables.QsvPixFmt` | `-pix_fmt {QsvPixFmt}` (`p010le`) |

**Companion Custom Parameters string** (use with `FFmpeg Builder: Video Encode Advanced` set to HEVC / `hevc_qsv` or `Automatic` on the same branch — it commits the encoder into the Builder model; without it the Executor defaults the video stream to `-c:v:0 copy` and the libplacebo filter errors out):

```
-vf {LibplaceboFilter} -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc
```

The Builder element provides `-c:v hevc_qsv`, `-global_quality`, `-preset`, `-pix_fmt` from its Quality / Speed fields. The Custom Parameters element only contributes the libplacebo filter and the HDR10 VUI flags. The script's `GlobalQuality` / `Preset` parameters become informational in this integration — set the values on the Video Encode Advanced element instead.

**Outputs**

| # | Label | When |
|---|---|---|
| 1 | `OK` | Always. |

---

## `transcode-libplacebo-hdr10.js`

Re-encode the working file through libplacebo with `apply_dolbyvision=true` to produce Main10 HDR10 BT.2020 PQ output. This is the path Dolby Vision Profile 5 needs: its base layer is in ICtCp and stripping the RPU alone leaves wrong-coloured pixels.

Reads `Variables.LibplaceboFilter` / `Variables.X265Params` / `Variables.X265Preset` / `Variables.X265Crf` / `Variables.X265PixFmt` from a prior `set-libplacebo-options` element; falls back to sensible HDR10 defaults if those aren't set so the script also works standalone.

Audio and subtitles are stream-copied; data streams (DV RPU) are dropped because HDR10 metadata is baked into the encoded HEVC. Output is `.mkv` written to `Flow.TempPath`, then `Flow.SetWorkingFile` points the rest of the flow at it.

**Parameters** — none.

**Outputs**

| # | Label | When |
|---|---|---|
| 1 | `Converted` | ffmpeg exited 0; the working file is now the new HDR10 .mkv. |
| 2 | `Error` | ffmpeg exited non-zero. |

---

## `strip-dolby-vision-rpu.js`

Strip the Dolby Vision RPU losslessly using ffmpeg's `dovi_rpu=strip=1` bitstream filter — the same BSF the FileFlows-bundled "Strip DoVi" element uses internally, but with a Profile 5 guard the built-in lacks.

- **Profile 7 / 8.x / 10** → base layer is already a valid HDR10 / SDR / HLG stream; this strip just removes the DV metadata so non-DV players don't trip over it. **No re-encode.**
- **Profile 5** → refused. The base layer is encoded in ICtCp; stripping the RPU leaves pixels with no instructions for how to be interpreted, which is exactly the purple/green tint failure mode. Use `transcode-libplacebo-hdr10` for Profile 5.

**Parameters** — none. (Reads `Variables.dv.profile` for the P5 guard; if no cached info is present, the script still runs but won't catch a P5 file.)

**Outputs**

| # | Label | When |
|---|---|---|
| 1 | `Stripped` | ffmpeg exited 0; the working file is now the stripped .mkv. |
| 2 | `Error` | ffmpeg exited non-zero. |
| 3 | `Refused (Profile 5)` | `Variables.dv.profile === 5` — caller should route P5 to `transcode-libplacebo-hdr10` instead. |
