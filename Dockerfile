# syntax=docker/dockerfile:1.7
#
# fileflows-dv: drop-in replacement for revenz/fileflows that ships
# tvarr-ffmpeg's ffmpeg/ffprobe (libplacebo + libdovi) under an isolated
# /opt prefix, so Dolby Vision Profile 5 → HDR10 conversions work without
# the green/purple ICtCp tint.
#
# Strategy: keep the official FileFlows image as-is (Ubuntu, .NET 8 in
# /dotnet, /app/docker-entrypoint.sh, DockerMods, PUID/PGID logic) and
# bolt on a second, fully-isolated ffmpeg under /opt/tvarr-ffmpeg/. The
# bundled binary is invoked through Arch's own ld-linux-x86-64.so.2 and
# library set, dodging the glibc 2.43 (Arch) vs 2.39 (Ubuntu 24.04)
# mismatch that would otherwise break dynamic linking.
#
# Wrappers in /usr/local/bin/{ffmpeg,ffprobe} take precedence on PATH,
# so FileFlows discovers the bundled build automatically — no extra UI
# configuration required.

ARG TVARR_FFMPEG_REF=ghcr.io/jmylchreest/tvarr-ffmpeg:latest
ARG FILEFLOWS_REF=revenz/fileflows:latest

FROM ${TVARR_FFMPEG_REF} AS ffmpeg

FROM ${FILEFLOWS_REF}

# Bundled tvarr-ffmpeg under an isolated prefix.
COPY --from=ffmpeg /lib/ld-linux-x86-64.so.2 /opt/tvarr-ffmpeg/lib/ld-linux-x86-64.so.2
COPY --from=ffmpeg /usr/lib /opt/tvarr-ffmpeg/usr/lib
COPY --from=ffmpeg /usr/share/vulkan /opt/tvarr-ffmpeg/usr/share/vulkan
COPY --from=ffmpeg /usr/bin/ffmpeg /opt/tvarr-ffmpeg/usr/bin/ffmpeg.real
COPY --from=ffmpeg /usr/bin/ffprobe /opt/tvarr-ffmpeg/usr/bin/ffprobe.real

# Wrappers that invoke the binary via its own loader / library set.
COPY wrappers/ffmpeg /opt/tvarr-ffmpeg/usr/bin/ffmpeg
COPY wrappers/ffprobe /opt/tvarr-ffmpeg/usr/bin/ffprobe
RUN chmod +x /opt/tvarr-ffmpeg/usr/bin/ffmpeg /opt/tvarr-ffmpeg/usr/bin/ffprobe \
    && ln -sf /opt/tvarr-ffmpeg/usr/bin/ffmpeg  /usr/local/bin/ffmpeg \
    && ln -sf /opt/tvarr-ffmpeg/usr/bin/ffprobe /usr/local/bin/ffprobe

# Bundled flow scripts: an all-in-one DV detect/convert plus a set of
# composable elements (detect / match-profile / set-options / transcode).
# Users import whichever they want from the FileFlows UI.
COPY scripts/ /opt/fileflows-dv/scripts/

LABEL org.opencontainers.image.title="fileflows-dv" \
      org.opencontainers.image.description="FileFlows + tvarr-ffmpeg (libplacebo + libdovi) for Dolby Vision Profile 5 → HDR10 conversion" \
      org.opencontainers.image.source="https://github.com/jmylchreest/fileflows-dv" \
      org.opencontainers.image.licenses="MIT"

# Keep the upstream entrypoint, ports, env, working dir untouched —
# this image is meant to be a strict drop-in for revenz/fileflows.
