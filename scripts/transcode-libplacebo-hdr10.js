/**
 * @name DV: Transcode (libplacebo → HDR10 Main10)
 * @description Run ffmpeg with the libplacebo filter and x265 HDR10 params
 *              prepared by `set-libplacebo-options`. Falls back to sensible
 *              defaults if those variables aren't set, so this script can
 *              also be used standalone.
 *
 *              Audio and subtitles are stream-copied; data streams (DV RPU)
 *              are dropped — HDR10 metadata is baked into the encoded HEVC.
 *
 * @output 1 Converted
 * @output 2 Error
 */

const ffmpeg = Flow.GetToolPath('ffmpeg') || 'ffmpeg';

const filter = (Variables && Variables.LibplaceboFilter) ||
    'libplacebo=apply_dolbyvision=true:' +
    'colorspace=bt2020nc:color_primaries=bt2020:color_trc=smpte2084:' +
    'range=limited:tonemapping=bt.2390:format=yuv420p10le';

const x265Params = (Variables && Variables.X265Params) ||
    'hdr-opt=1:repeat-headers=1:' +
    'colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:' +
    'master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):' +
    'max-cll=1000,400';

const preset = (Variables && Variables.X265Preset) || 'medium';
const crf    = (Variables && Variables.X265Crf)    || 18;
const pixFmt = (Variables && Variables.X265PixFmt) || 'yuv420p10le';

const output = Flow.TempPath + '/libplacebo_hdr10_' + Flow.NewGuid() + '.mkv';

Logger.ILog('Transcode → ' + output);
Logger.ILog('Filter:       ' + filter);
Logger.ILog('x265 params:  ' + x265Params);
Logger.ILog('preset/CRF:   ' + preset + ' / ' + crf);

const result = Flow.Execute({
    command: ffmpeg,
    argumentList: [
        '-hide_banner', '-y',
        '-i', Variables.file.FullName,
        '-map', '0',
        '-map', '-0:d',
        '-vf', filter,
        '-c:v', 'libx265',
        '-preset', String(preset),
        '-crf', String(crf),
        '-pix_fmt', pixFmt,
        '-x265-params', x265Params,
        '-c:a', 'copy',
        '-c:s', 'copy',
        output
    ]
});

if (result.standardError) Logger.ILog(result.standardError);
if (result.exitCode !== 0) {
    Logger.ELog('ffmpeg failed, exit code ' + result.exitCode);
    return 2;
}

Flow.SetWorkingFile(output);
Logger.ILog('Transcode complete: ' + output);
return 1;
