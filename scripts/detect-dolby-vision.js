/**
 * Detect Dolby Vision in the working file via ffprobe and stash the result
 * in `Variables.dv.*` so downstream Function elements don't have to re-probe.
 *
 * Variables written:
 *   Variables.dv.isDV       boolean
 *   Variables.dv.profile    number | null  (5, 7, 8, 10, ...)
 *   Variables.dv.blCompat   number | null  (1 = HDR10-compatible base layer,
 *                                            2 = SDR BL, 4 = HLG BL, 0 = none)
 *   Variables.dv.codecTag   string         (e.g. "dvhe", "dvh1", or "")
 *
 * @output Is Dolby Vision
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
        return 3;
    }

    var info;
    try {
        info = JSON.parse(probe.standardOutput);
    } catch (e) {
        Logger.ELog('Failed to parse ffprobe JSON: ' + e);
        return 3;
    }

    var video = null;
    var streams = info.streams || [];
    for (var i = 0; i < streams.length; i++) {
        if (streams[i].codec_type === 'video') { video = streams[i]; break; }
    }
    if (!video) {
        Logger.ELog('No video stream found');
        return 3;
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

    var tag = (video.codec_tag_string || '').toLowerCase();
    var tagLooksDV = tag.indexOf('dv') !== -1 || tag.indexOf('dolby') !== -1;
    var isDV = profile !== null || tagLooksDV;

    Variables.dv = {
        isDV:     isDV,
        profile:  profile,
        blCompat: blCompat,
        codecTag: video.codec_tag_string || ''
    };

    Logger.ILog('DV detect: isDV=' + isDV +
                ' profile=' + (profile === null ? 'none' : profile) +
                ' bl_compat=' + (blCompat === null ? '-' : blCompat) +
                ' tag=' + (video.codec_tag_string || '-'));

    return isDV ? 1 : 2;
}
