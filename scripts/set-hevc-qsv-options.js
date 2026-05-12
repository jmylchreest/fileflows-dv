/**
 * Emit Variables for an Intel-iGPU hardware-accelerated HEVC encode of
 * Dolby Vision Profile 5, using libplacebo for the ICtCp → BT.2020 PQ
 * pixel transform and `hevc_qsv` for the encode itself.
 *
 * Faster than the libx265 path (set-libplacebo-options) — typically near
 * realtime on a recent Intel iGPU — but the encoder has no equivalent
 * for `-x265-params master-display=...:max-cll=...`, so this path lands
 * HDR10 VUI tags (BT.2020 / PQ / BT.2020nc) but does NOT bake the HDR10
 * mastering display SEI metadata into the bitstream. Most TVs derive
 * HDR display correctly from the VUI flags and the PQ-encoded pixel
 * values alone; the mastering metadata only adds per-title peak-luma
 * hints. If you need it baked in, use set-libplacebo-options + libx265.
 *
 * The filter chain handles QSV-hw → libplacebo → QSV-hw round-trip via
 * `hwdownload,format=p010le,libplacebo=...,hwupload`. Because of that:
 *
 *   - this script expects QSV decode to be in effect (the FileFlows
 *     Builder picks it automatically on Intel iGPU for hevc input —
 *     just don't add `FFmpeg Builder: Disable Intel QSV` to the branch
 *     where you use this script)
 *
 *   - if you instead want software decode, use set-libplacebo-options +
 *     libx265 — the hwdownload at the start would fail on software input
 *
 * Variables written:
 *   Variables.LibplaceboFilter   string  libplacebo wrapped in hwdownload+hwupload
 *   Variables.QsvGlobalQuality   int     hevc_qsv quality value
 *   Variables.QsvPreset          string  hevc_qsv preset
 *   Variables.QsvPixFmt          string  pixel format (p010le)
 *
 * Companion Custom Parameters string:
 *
 *   -vf {LibplaceboFilter} -c:v hevc_qsv -global_quality {QsvGlobalQuality}
 *   -load_plugin hevc_hw -preset {QsvPreset} -profile:v main10
 *   -pix_fmt {QsvPixFmt}
 *   -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc
 *
 * @param {string} Tonemapping     libplacebo tonemap curve (blank → bt.2390)
 * @param {int}    GlobalQuality   hevc_qsv quality 0-51 lower=better (0 or blank → 18)
 * @param {string} Preset          hevc_qsv preset veryfast/faster/fast/medium/slow/slower/veryslow (blank → slow)
 *
 * @output OK
 */
function Script(Tonemapping, GlobalQuality, Preset) {
    function _intOr(v, def) {
        var n = Number(v);
        return (isFinite(n) && n > 0) ? n : def;
    }
    function _strOr(v, def) {
        return (typeof v === 'string' && v.length > 0) ? v : def;
    }

    var tonemap = _strOr(Tonemapping, 'bt.2390');
    var quality = _intOr(GlobalQuality, 18);
    var preset  = _strOr(Preset, 'slow');

    Variables.LibplaceboFilter =
        'hwdownload,format=p010le,' +
        'libplacebo=apply_dolbyvision=true:' +
        'colorspace=bt2020nc:' +
        'color_primaries=bt2020:' +
        'color_trc=smpte2084:' +
        'range=limited:' +
        'tonemapping=' + tonemap + ':' +
        'format=p010le,' +
        'hwupload=extra_hw_frames=64';

    Variables.QsvGlobalQuality = quality;
    Variables.QsvPreset        = preset;
    Variables.QsvPixFmt        = 'p010le';

    Logger.ILog('Libplacebo filter:  ' + Variables.LibplaceboFilter);
    Logger.ILog('QSV encoder:        hevc_qsv preset=' + preset + ' global_quality=' + quality);

    return 1;
}
