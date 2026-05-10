/**
 * @name DV: Detect Dolby Vision
 * @description Probe the working file with ffprobe and stash Dolby Vision
 *              metadata in `Variables.dv.*` so downstream Function elements
 *              don't have to re-probe.
 *
 * Variables written:
 *   Variables.dv.isDV              boolean
 *   Variables.dv.profile           number | null  (5, 7, 8, 10, ...)
 *   Variables.dv.blCompat          number | null  (1 = HDR10-compatible base layer)
 *   Variables.dv.codecTag          string         (e.g. "dvhe", "dvh1", or "")
 *
 * Outputs:
 *   1 = Dolby Vision detected
 *   2 = Not Dolby Vision
 *   3 = Error
 *
 * @output 1 Is Dolby Vision
 * @output 2 Not Dolby Vision
 * @output 3 Error
 */

const ffprobe = Flow.GetToolPath('ffprobe') || 'ffprobe';

const probe = Flow.Execute({
    command: ffprobe,
    argumentList: [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
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

let profile = null;
let blCompat = null;
for (const sd of (video.side_data_list || [])) {
    if (sd.side_data_type === 'DOVI configuration record') {
        profile = sd.dv_profile;
        blCompat = sd.dv_bl_signal_compatibility_id;
        break;
    }
}

const tag = (video.codec_tag_string || '').toLowerCase();
const tagLooksDV = tag.includes('dv') || tag.includes('dolby');
const isDV = profile !== null || tagLooksDV;

Variables.dv = {
    isDV: isDV,
    profile: profile,
    blCompat: blCompat,
    codecTag: video.codec_tag_string || ''
};

Logger.ILog(`DV detect: isDV=${isDV} profile=${profile ?? 'none'} ` +
            `bl_compat=${blCompat ?? '-'} tag=${video.codec_tag_string || '-'}`);

return isDV ? 1 : 2;
