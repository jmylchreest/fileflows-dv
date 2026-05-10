/**
 * @name DV: Set libplacebo options
 * @description Stash a libplacebo filter string and matching x265 HDR10
 *              parameters in Variables, so a downstream encoder element or
 *              transcode script can pick them up without hard-coding the
 *              flags. Defaults assume DV P5 → HDR10 BT.2020 PQ.
 *
 *              Downstream consumers reference these via either:
 *                - a script (`Variables.LibplaceboFilter`)
 *                - a built-in flow element parameter (`${LibplaceboFilter}`)
 *
 * @param {string} Tonemapping   Tonemapping curve (default "bt.2390")
 * @param {bool}   ApplyDolbyVision  Whether to apply DV metadata (default true)
 * @param {string} PixelFormat   libplacebo output pixel format (default "yuv420p10le")
 * @param {int}    X265Crf       libx265 CRF (default 18)
 * @param {string} X265Preset    libx265 preset (default "medium")
 * @param {int}    MaxCll        Max content light level cd/m^2 (default 1000)
 * @param {int}    MaxFall       Max frame-average light level cd/m^2 (default 400)
 *
 * @output 1 OK
 */

const tonemap     = Tonemapping       || 'bt.2390';
const applyDV     = (ApplyDolbyVision === undefined) ? true : Boolean(ApplyDolbyVision);
const pixFmt      = PixelFormat       || 'yuv420p10le';
const crf         = Number.isFinite(Number(X265Crf))    ? Number(X265Crf)    : 18;
const preset      = X265Preset        || 'medium';
const maxCll      = Number.isFinite(Number(MaxCll))     ? Number(MaxCll)     : 1000;
const maxFall     = Number.isFinite(Number(MaxFall))    ? Number(MaxFall)    : 400;

// Rec.2020 D65 master display primaries, reasonable default for consumer HDR10.
const masterDisplay =
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
Logger.ILog('x265 preset/crf:    ' + Variables.X265Preset + ' / CRF ' + Variables.X265Crf);

return 1;
