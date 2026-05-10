/**
 * @name DV: Strip RPU (P8.x → clean HDR10)
 * @description For Dolby Vision Profile 8.x files (where the base layer is
 *              already valid HDR10 / SDR / HLG), the DV RPU NAL units are
 *              "extra" metadata for DV-aware players. Some non-DV devices
 *              misbehave when they see them. This script removes the DV
 *              RPU (and any EL) NAL units losslessly via ffmpeg's
 *              `filter_units` bitstream filter — no re-encode, runs at
 *              I/O speed.
 *
 *              For Profile 5 (no HDR10 fallback) this is the wrong tool —
 *              the base layer is encoded in ICtCp and stripping the RPU
 *              would leave wrong-coloured pixels. Use
 *              `transcode-libplacebo-hdr10` for that.
 *
 *              Uses ffmpeg's `dovi_rpu=strip=1` bitstream filter (the
 *              DV-aware BSF that ships with libavcodec). It removes the
 *              DV RPU NAL units AND clears the DOVI configuration record
 *              from the codec metadata — `filter_units=remove_types=62|63`
 *              would only do the former, leaving a stale container flag
 *              behind. FileFlows' built-in StripDovi flow element uses
 *              the same BSF.
 *
 * @output 1 Stripped
 * @output 2 Error
 * @output 3 Wrong profile (P5 — refuses, would corrupt output)
 */

const ffmpeg = Flow.GetToolPath('ffmpeg') || 'ffmpeg';

// Refuse to strip on Profile 5 — the BL is ICtCp, not HDR10. Caller should
// have routed P5 to the libplacebo transcode path.
const profile = (Variables && Variables.dv) ? Variables.dv.profile : null;
if (profile === 5) {
    Logger.ELog('Refusing to strip RPU on Profile 5 — the base layer is ICtCp, ' +
                'not HDR10. Use transcode-libplacebo-hdr10 instead.');
    return 3;
}

const output = Flow.TempPath + '/dv_stripped_' + Flow.NewGuid() + '.mkv';

Logger.ILog('Stripping DV RPU/EL NAL units (62, 63) → ' + output);

const result = Flow.Execute({
    command: ffmpeg,
    argumentList: [
        '-hide_banner', '-y',
        '-i', Variables.file.FullName,
        '-map', '0',
        '-map', '-0:d',                          // drop any data streams
        '-c', 'copy',                             // no re-encode
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
