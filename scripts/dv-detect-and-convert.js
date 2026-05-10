/**
 * @name DV Profile 5 → HDR10 (libplacebo)
 * @description Detect Dolby Vision via ffprobe; for Profile 5 (single-layer
 *              ICtCp), tonemap to HDR10 BT.2020 PQ Main10 with libplacebo's
 *              apply_dolbyvision=true so colours land correctly (no purple/
 *              green ICtCp tint). Profiles 7/8 with an HDR10 base layer or
 *              non-DV files are skipped.
 *
 * Requirements: ffmpeg built with libplacebo + libdovi (the fileflows-dv
 *               image bundles tvarr-ffmpeg, which has both).
 *
 * Free-tier note: this is a single Function flow element. Combined with an
 * Input File and an output route it is well under the 30-element cap.
 *
 * Outputs:
 *   1 = Converted (DV P5 → HDR10)
 *   2 = Skipped   (not DV P5, or already HDR10/SDR you don't want touched)
 *   3 = Error
 *
 * @output 1 Converted
 * @output 2 Skipped
 * @output 3 Error
 */

const ffprobe = Flow.GetToolPath('ffprobe') || 'ffprobe';
const ffmpeg  = Flow.GetToolPath('ffmpeg')  || 'ffmpeg';

// --- Probe ----------------------------------------------------------------
const probe = Flow.Execute({
    command: ffprobe,
    argumentList: [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        Variables.file.FullName
    ]
});

if (probe.exitCode !== 0) {
    Logger.ELog('ffprobe failed:\n' + probe.standardError);
    return 3;
}

let info;
try {
    info = JSON.parse(probe.standardOutput);
} catch (e) {
    Logger.ELog('Failed to parse ffprobe JSON: ' + e);
    return 3;
}

const video = (info.streams || []).find(s => s.codec_type === 'video');
if (!video) {
    Logger.ELog('No video stream found');
    return 3;
}

// --- Detect DV profile ----------------------------------------------------
// ffprobe surfaces DV via side_data_list with a "DOVI configuration record"
// entry. dv_profile is 5 for single-layer ICtCp (no HDR10 base layer);
// profiles 7/8 carry an HDR10 base layer that plays correctly without a
// re-encode, so we leave them alone.
let dvProfile = null;
let dvBlSignalCompat = null;
for (const sd of (video.side_data_list || [])) {
    if (sd.side_data_type === 'DOVI configuration record') {
        dvProfile = sd.dv_profile;
        dvBlSignalCompat = sd.dv_bl_signal_compatibility_id;
        break;
    }
}

const tag = (video.codec_tag_string || '').toLowerCase();
const looksLikeDV = dvProfile !== null || tag.includes('dv') || tag.includes('dolby');

Logger.ILog(`codec=${video.codec_name} tag=${video.codec_tag_string || '-'} ` +
            `dv_profile=${dvProfile ?? 'none'} bl_compat=${dvBlSignalCompat ?? '-'} ` +
            `trc=${video.color_trc || '-'} primaries=${video.color_primaries || '-'}`);

if (!looksLikeDV) {
    Logger.ILog('Not Dolby Vision — skipping.');
    return 2;
}

if (dvProfile !== 5) {
    Logger.ILog(`Dolby Vision profile ${dvProfile} (HDR10-compatible base layer) — skipping.`);
    return 2;
}

// --- Convert P5 → HDR10 Main10 -------------------------------------------
Logger.ILog('Dolby Vision Profile 5 confirmed. Converting to HDR10 Main10 with libplacebo.');

const output = Flow.TempPath + '/dv_hdr10_' + Flow.NewGuid() + '.mkv';

// libplacebo with apply_dolbyvision=true is what removes the ICtCp purple/
// green tint. format=yuv420p10le forces a 10-bit pipeline; we then encode
// HEVC Main10 with HDR10 metadata baked in.
const placebo =
    'libplacebo=' +
    'apply_dolbyvision=true:' +
    'colorspace=bt2020nc:' +
    'color_primaries=bt2020:' +
    'color_trc=smpte2084:' +
    'range=limited:' +
    'tonemapping=bt.2390:' +
    'format=yuv420p10le';

const result = Flow.Execute({
    command: ffmpeg,
    argumentList: [
        '-hide_banner',
        '-y',
        '-i', Variables.file.FullName,
        // Drop the DV RPU data stream (and any other data streams) — we're
        // baking HDR10 metadata into the encoded HEVC, the RPU is no longer
        // meaningful.
        '-map', '0',
        '-map', '-0:d',
        '-vf', placebo,
        '-c:v', 'libx265',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p10le',
        '-x265-params',
            'hdr-opt=1:repeat-headers=1:' +
            'colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:' +
            'master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):' +
            'max-cll=1000,400',
        '-c:a', 'copy',
        '-c:s', 'copy',
        output
    ]
});

if (result.standardError) {
    Logger.ILog(result.standardError);
}

if (result.exitCode !== 0) {
    Logger.ELog('ffmpeg failed, exit code ' + result.exitCode);
    return 3;
}

Flow.SetWorkingFile(output);
Logger.ILog('DV P5 → HDR10 conversion complete: ' + output);
return 1;
