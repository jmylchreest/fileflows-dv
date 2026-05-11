/**
 * Compare the detected DV profile to an expected profile number. Reads
 * `Variables.dv.profile` (set by `detect-dolby-vision` or
 * `route-dolby-vision-by-profile`); falls back to a fresh ffprobe call if
 * the variable isn't set, so this script can also be used standalone.
 *
 * @param {int} ExpectedProfile The DV profile number to match against (e.g. 5)
 *
 * @output Match
 * @output No match
 * @output Not Dolby Vision
 */
function Script(ExpectedProfile) {
    var expected = Number(ExpectedProfile);
    if (!isFinite(expected)) {
        Logger.ELog('ExpectedProfile parameter is missing or not a number');
        return 3;
    }

    var profile;
    if (Variables.dv && Variables.dv.profile !== undefined) {
        profile = Variables.dv.profile;
    } else {
        Logger.ILog('No cached DV info; probing now.');
        var ffprobe = Flow.GetToolPath('ffprobe') || 'ffprobe';
        var probe = Flow.Execute({
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
        var info;
        try { info = JSON.parse(probe.standardOutput); }
        catch (e) { Logger.ELog('JSON parse failed: ' + e); return 3; }

        var video = null;
        var streams = info.streams || [];
        for (var i = 0; i < streams.length; i++) {
            if (streams[i].codec_type === 'video') { video = streams[i]; break; }
        }
        profile = null;
        var sd = (video && video.side_data_list) || [];
        for (var j = 0; j < sd.length; j++) {
            if (sd[j].side_data_type === 'DOVI configuration record') {
                profile = sd[j].dv_profile;
                break;
            }
        }
    }

    if (profile === null || profile === undefined) {
        Logger.ILog('No DV profile present — not Dolby Vision.');
        return 3;
    }

    Logger.ILog('DV profile=' + profile + ' expected=' + expected);
    return profile === expected ? 1 : 2;
}
