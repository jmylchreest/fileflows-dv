/**
 * Strip the Dolby Vision RPU losslessly using ffmpeg's `dovi_rpu=strip=1`
 * bitstream filter. Same BSF the FileFlows-bundled "Strip DoVi" flow element
 * uses (confirmed by decompilation of `FfmpegBuilderStripDovi`), but with a
 * Profile 5 guard the built-in lacks.
 *
 *   Profile 7 / 8.x / 10  → base layer is already a valid HDR10 / SDR / HLG
 *                           stream; this strip just removes the DV metadata
 *                           so non-DV players don't trip over it. No re-encode.
 *
 *   Profile 5             → refused. The base layer is encoded in ICtCp;
 *                           stripping the RPU leaves pixels with no
 *                           instructions for how to be interpreted, which is
 *                           exactly the purple/green tint failure mode. Use
 *                           `transcode-libplacebo-hdr10` for Profile 5 — it
 *                           does the real ICtCp → BT.2020 PQ conversion via
 *                           `libplacebo apply_dolbyvision=true`.
 *
 * @output Stripped
 * @output Error
 * @output Refused (Profile 5 — use libplacebo transcode instead)
 */
function Script() {
    var ffmpeg = Flow.GetToolPath('ffmpeg') || 'ffmpeg';

    var profile = (Variables && Variables.dv) ? Variables.dv.profile : null;
    if (profile === 5) {
        Logger.ELog('Refusing to strip RPU on Profile 5 — base layer is ICtCp, ' +
                    'not HDR10. Use transcode-libplacebo-hdr10 instead.');
        return 3;
    }

    var output = Flow.TempPath + '/dv_stripped_' + Flow.NewGuid() + '.mkv';

    Logger.ILog('Stripping DV RPU with dovi_rpu=strip=1 → ' + output);

    var result = Flow.Execute({
        command: ffmpeg,
        argumentList: [
            '-hide_banner', '-y',
            '-i', Variables.file.FullName,
            '-map', '0',
            '-map', '-0:d',
            '-c', 'copy',
            '-bsf:v', 'dovi_rpu=strip=1',
            output
        ]
    });

    if (result.standardError) Logger.ILog(result.standardError);
    if (result.exitCode !== 0) {
        Logger.ELog('ffmpeg failed, exit code ' + result.exitCode);
        return 2;
    }

    Flow.SetWorkingFile(output);
    Logger.ILog('Strip complete: ' + output);
    return 1;
}
