/**
 * Stash a libplacebo filter string and matching x265 HDR10 parameters in
 * `Variables.*`, so a downstream encoder element or transcode script can
 * pick them up without hard-coding the flags. Defaults assume DV P5 →
 * HDR10 BT.2020 PQ.
 *
 * Every parameter is optional. Leave them all at the FileFlows-supplied
 * defaults (blank strings, zero ints) and you get a sane HDR10 setup:
 * bt.2390 tonemap, yuv420p10le, libx265 medium CRF 18, MaxCLL 1000 /
 * MaxFALL 400. `apply_dolbyvision=true` is always set — there's no reason
 * to use this script otherwise.
 *
 * Variables written:
 *   Variables.LibplaceboFilter   string  (-vf argument for ffmpeg)
 *   Variables.X265Params         string  (-x265-params argument)
 *   Variables.X265Crf            int
 *   Variables.X265Preset         string
 *   Variables.X265PixFmt         string
 *
 * Downstream consumers reference these via either:
 *   - a script   →  `Variables.LibplaceboFilter`
 *   - a built-in flow element  →  `${LibplaceboFilter}` parameter substitution
 *
 * @param {string} Tonemapping  Tonemapping curve (blank → bt.2390; other options include bt.2446a, hable, mobius, reinhard)
 * @param {string} PixelFormat  libplacebo output pixel format (blank → yuv420p10le)
 * @param {int}    Crf          libx265 CRF, lower = higher quality (0 or blank → 18)
 * @param {string} Preset       libx265 preset ultrafast..placebo (blank → medium)
 * @param {int}    MaxCll       Max content light level cd/m^2 (0 or blank → 1000)
 * @param {int}    MaxFall      Max frame-average light level cd/m^2 (0 or blank → 400)
 *
 * @output OK
 */
function Script(Tonemapping, PixelFormat, Crf, Preset, MaxCll, MaxFall) {
    // Treat blank strings and zero/negative ints as "use default" so the
    // FileFlows UI's pre-filled 0s and empty boxes don't override sensible
    // values.
    function _intOr(v, def) {
        var n = Number(v);
        return (isFinite(n) && n > 0) ? n : def;
    }
    function _strOr(v, def) {
        return (typeof v === 'string' && v.length > 0) ? v : def;
    }

    var tonemap = _strOr(Tonemapping, 'bt.2390');
    var pixFmt  = _strOr(PixelFormat, 'yuv420p10le');
    var crf     = _intOr(Crf,     18);
    var preset  = _strOr(Preset,  'medium');
    var maxCll  = _intOr(MaxCll,  1000);
    var maxFall = _intOr(MaxFall, 400);

    // Rec.2020 D65 master display primaries (reasonable consumer-HDR10 default)
    var masterDisplay =
        'G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)';

    Variables.LibplaceboFilter =
        'libplacebo=' +
        'apply_dolbyvision=true:' +
        'colorspace=bt2020nc:' +
        'color_primaries=bt2020:' +
        'color_trc=smpte2084:' +
        'range=limited:' +
        'tonemapping=' + tonemap + ':' +
        'format=' + pixFmt;

    Variables.X265Params =
        'hdr-opt=1:repeat-headers=1:' +
        'colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:' +
        'master-display=' + masterDisplay + ':' +
        'max-cll=' + maxCll + ',' + maxFall;

    Variables.X265Crf    = crf;
    Variables.X265Preset = preset;
    Variables.X265PixFmt = pixFmt;

    Logger.ILog('Libplacebo filter:  ' + Variables.LibplaceboFilter);
    Logger.ILog('x265 params:        ' + Variables.X265Params);
    Logger.ILog('x265 preset/CRF:    ' + Variables.X265Preset + ' / ' + Variables.X265Crf);

    return 1;
}
