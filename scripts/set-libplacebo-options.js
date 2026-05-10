/**
 * Stash a libplacebo filter string and matching x265 HDR10 parameters in
 * `Variables.*`, so a downstream encoder element or transcode script can
 * pick them up without hard-coding the flags. Defaults assume DV P5 →
 * HDR10 BT.2020 PQ.
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
 * @param {string} Tonemapping   Tonemapping curve (e.g. bt.2390, bt.2446a)
 * @param {bool}   ApplyDolbyVision  Apply DV metadata via libdovi (default true)
 * @param {string} PixelFormat   libplacebo output pixel format
 * @param {int}    X265Crf       libx265 CRF (lower = higher quality, default 18)
 * @param {string} X265Preset    libx265 preset (ultrafast..placebo, default medium)
 * @param {int}    MaxCll        Max content light level cd/m^2 (default 1000)
 * @param {int}    MaxFall       Max frame-average light level cd/m^2 (default 400)
 *
 * @output OK
 */
function Script(Tonemapping, ApplyDolbyVision, PixelFormat, X265Crf, X265Preset, MaxCll, MaxFall) {
    var tonemap = Tonemapping || 'bt.2390';
    var applyDV = (ApplyDolbyVision === undefined || ApplyDolbyVision === null)
                  ? true : Boolean(ApplyDolbyVision);
    var pixFmt  = PixelFormat  || 'yuv420p10le';
    var crf     = isFinite(Number(X265Crf))  ? Number(X265Crf)  : 18;
    var preset  = X265Preset   || 'medium';
    var maxCll  = isFinite(Number(MaxCll))   ? Number(MaxCll)   : 1000;
    var maxFall = isFinite(Number(MaxFall))  ? Number(MaxFall)  : 400;

    // Rec.2020 D65 master display primaries (reasonable consumer-HDR10 default)
    var masterDisplay =
        'G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)';

    Variables.LibplaceboFilter =
        'libplacebo=' +
        'apply_dolbyvision=' + (applyDV ? 'true' : 'false') + ':' +
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
