/**
 * @name DV: Match Profile
 * @description Compare the detected DV profile to an expected profile number.
 *              Reads `Variables.dv.profile` (set by `detect-dolby-vision`);
 *              falls back to a fresh ffprobe call if the variable isn't set,
 *              so this script also works standalone.
 *
 * @param {int} ExpectedProfile The DV profile number to match against (e.g. 5)
 * @output 1 Match
 * @output 2 No match
 * @output 3 Error / not Dolby Vision
 */

const expected = Number(ExpectedProfile);
if (!Number.isFinite(expected)) {
    Logger.ELog('ExpectedProfile parameter is missing or not a number');
    return 3;
}

let profile = (Variables && Variables.dv) ? Variables.dv.profile : undefined;

if (profile === undefined) {
    Logger.ILog('No cached DV info; probing now.');
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
    try { info = JSON.parse(probe.standardOutput); }
    catch (e) { Logger.ELog('JSON parse failed: ' + e); return 3; }
    const video = (info.streams || []).find(s => s.codec_type === 'video');
    profile = null;
    for (const sd of (video?.side_data_list || [])) {
        if (sd.side_data_type === 'DOVI configuration record') {
            profile = sd.dv_profile;
            break;
        }
    }
}

if (profile === null || profile === undefined) {
    Logger.ILog('No DV profile present — not Dolby Vision.');
    return 3;
}

Logger.ILog(`DV profile=${profile} expected=${expected}`);
return profile === expected ? 1 : 2;
