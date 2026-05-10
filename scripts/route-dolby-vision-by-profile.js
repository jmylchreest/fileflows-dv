/**
 * Detect Dolby Vision and route the flow by profile. One Function element that
 * replaces the chain of `detect-dolby-vision` + `match-dolby-vision-profile`.
 * The branches it produces are the ones that matter for picking a correction
 * strategy:
 *
 *   Profile 5     → ICtCp base layer, no HDR10 fallback. The base layer must
 *                   be re-encoded through libplacebo (`apply_dolbyvision=true`)
 *                   to produce playable HDR10. Stripping the RPU here would
 *                   leave wrong-coloured pixels (the purple/green tint).
 *
 *   Profile 7     → Dual-layer (BL+EL+RPU). The base layer is HDR10 already;
 *                   you can strip the RPU and ignore the EL.
 *
 *   Profile 8.x   → Single-layer (BL+RPU). The base layer is already valid
 *                   HDR10 (bl_compat=1), SDR (=2), or HLG (=4). Strip RPU
 *                   safely with `dovi_rpu=strip=1`.
 *
 *   Profile 10    → AV1 with HDR10-compatible base. Strip RPU safely.
 *
 *   Not DV / error → skip / fail.
 *
 * Variables written (same as detect-dolby-vision):
 *   Variables.dv.isDV, .profile, .blCompat, .codecTag
 *
 * @output Profile 5 — needs libplacebo transcode
 * @output Profile 7/8.x/10 — safe to strip RPU
 * @output Not Dolby Vision
 * @output Error
 */
function Script() {
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
        return 4;
    }

    var info;
    try {
        info = JSON.parse(probe.standardOutput);
    } catch (e) {
        Logger.ELog('Failed to parse ffprobe JSON: ' + e);
        return 4;
    }

    var video = null;
    var streams = info.streams || [];
    for (var i = 0; i < streams.length; i++) {
        if (streams[i].codec_type === 'video') { video = streams[i]; break; }
    }
    if (!video) {
        Logger.ELog('No video stream found');
        return 4;
    }

    var profile = null;
    var blCompat = null;
    var sd = video.side_data_list || [];
    for (var j = 0; j < sd.length; j++) {
        if (sd[j].side_data_type === 'DOVI configuration record') {
            profile = sd[j].dv_profile;
            blCompat = sd[j].dv_bl_signal_compatibility_id;
            break;
        }
    }

    Variables.dv = {
        isDV:     profile !== null,
        profile:  profile,
        blCompat: blCompat,
        codecTag: video.codec_tag_string || ''
    };

    Logger.ILog('DV route: profile=' + (profile === null ? 'none' : profile) +
                ' bl_compat=' + (blCompat === null ? '-' : blCompat));

    if (profile === null) {
        Logger.ILog('Not Dolby Vision — output 3.');
        return 3;
    }
    if (profile === 5) {
        Logger.ILog('Dolby Vision Profile 5 — needs libplacebo transcode, output 1.');
        return 1;
    }
    if (profile === 7 || profile === 8 || profile === 10) {
        Logger.ILog('Dolby Vision Profile ' + profile + ' — safe to strip RPU, output 2.');
        return 2;
    }
    Logger.ILog('Unknown DV profile ' + profile + ' — routing as error.');
    return 4;
}
