# Archived

Originally this repo shipped a custom FileFlows image (`ghcr.io/jmylchreest/fileflows-dv`) layered on top of [`tvarr-ffmpeg`](https://github.com/jmylchreest/tvarr) so the bundled ffmpeg would have `libplacebo` + `libdovi` for Dolby Vision Profile 5 handling.

While building it I verified by direct probe that **the official `revenz/fileflows` image already ships an ffmpeg with both** — it bundles `jellyfin-ffmpeg`, built `--enable-libplacebo`, with `libplacebo.so.351` linked, and the libplacebo filter exposes the `apply_dolbyvision` option (which only appears when libplacebo was compiled against libdovi). The original premise turned out to be wrong.

The official image is also a better fit for an Intel-iGPU cluster: it has the QSV encoders (`hevc_qsv`, `av1_qsv`, etc.) that `tvarr-ffmpeg` lacks, plus AMF, libsvtav1, libfdk-aac, libass + fontconfig, libbluray, libdav1d, and OpenCL.

So the Dockerfile, the binary wrappers (`wrappers/ffmpeg`, `wrappers/ffprobe`), the build CI (`.github/workflows/build.yml`), and the k8s example manifest (`examples/fileflows.yaml`) are all archived. They run, but there's no reason to use them — point your existing FileFlows install at the stock image and use the JS scripts in `scripts/` directly.

If you want to read the design or revive the image build for some other reason (different ffmpeg base, particular codec mix `jellyfin-ffmpeg` doesn't ship, etc.), everything is here.
