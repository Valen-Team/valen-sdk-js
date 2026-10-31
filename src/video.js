/** FFmpeg for Node and Mediabunny/WebCodecs for browsers; no decoder kernels here. */
import { isNode } from './assets.js';
import { sampleIndices } from './geometry.js';
const parseRate = (text) => {
  const [n, d = 1] = String(text ?? '')
    .split('/')
    .map(Number);
  return n / d;
};
async function nodeVideo(path, config, RawImage, options, fallbackFps) {
  const { execFile } = await import('node:child_process'),
    { promisify } = await import('node:util');
  const exec = promisify(execFile);
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises'),
    { tmpdir } = await import('node:os'),
    { join } = await import('node:path');
  let temporary;
  try {
    if (path.startsWith('data:video/')) {
      const comma = path.indexOf(',');
      if (comma < 0 || !path.slice(0, comma).endsWith(';base64'))
        throw new Error('Invalid inline video data URL');
      const data = Buffer.from(path.slice(comma + 1), 'base64');
      if (!data.length || data.length > 64 * 1024 * 1024)
        throw new Error('Inline video must be nonempty and at most 64 MiB');
      temporary = await mkdtemp(join(tmpdir(), 'valen-video-'));
      path = join(temporary, 'video');
      await writeFile(path, data);
    }
    if (/^https?:/.test(path)) throw new Error('Materialize remote videos locally before Node inference');
    const ffprobe = options.ffprobePath ?? 'ffprobe',
      ffmpeg = options.ffmpegPath ?? 'ffmpeg';
    const probe = async (count) =>
      JSON.parse(
        (
          await exec(
            ffprobe,
            [
              '-v',
              'error',
              ...(count ? ['-count_frames'] : []),
              '-select_streams',
              'v:0',
              '-show_entries',
              'stream=width,height,avg_frame_rate,nb_frames,nb_read_frames',
              '-of',
              'json',
              path,
            ],
            { timeout: options.videoTimeout ?? 120000, maxBuffer: 4 * 1024 * 1024 }
          )
        ).stdout
      ).streams?.[0];
    let stream = await probe(false);
    if (!stream) throw new Error('Video has no video stream');
    let total = Number(stream.nb_frames);
    if (!Number.isInteger(total) || total < 1) {
      stream = await probe(true);
      total = Number(stream.nb_read_frames);
    }
    const fps = parseRate(stream.avg_frame_rate) || 24,
      width = stream.width,
      height = stream.height,
      indices = sampleIndices(total, fps, config, fallbackFps);
    const unique = [...new Set(indices)],
      frameBytes = width * height * 3,
      maxBytes = options.maxVideoDecodeBytes ?? 512 * 1024 * 1024;
    if (!Number.isSafeInteger(frameBytes) || frameBytes * indices.length > maxBytes)
      throw new Error('Selected video frames exceed the decoded-memory limit');
    const select = unique.map((i) => `eq(n\\,${i})`).join('+');
    const { stdout } = await exec(
      ffmpeg,
      [
        '-v',
        'error',
        '-noautorotate',
        '-i',
        path,
        '-an',
        '-sn',
        '-vf',
        `select=${select}`,
        '-vsync',
        '0',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ],
      {
        encoding: 'buffer',
        timeout: options.videoTimeout ?? 120000,
        maxBuffer: frameBytes * unique.length + 1024 * 1024,
      }
    );
    if (stdout.length !== frameBytes * unique.length)
      throw new Error('Video frame metadata does not match decoded frames');
    const decoded = new Map(
      unique.map((index, i) => [
        index,
        new RawImage(
          new Uint8ClampedArray(stdout.subarray(i * frameBytes, (i + 1) * frameBytes)),
          width,
          height,
          3
        ),
      ])
    );
    return { frames: indices.map((i) => decoded.get(i)), indices, fps, total, width, height };
  } catch (error) {
    if (error.code === 'ENOENT')
      throw new Error('Node video requires FFmpeg and ffprobe; configure ffmpegPath and ffprobePath');
    throw error;
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
async function browserVideo(path, config, RawImage, options, fallbackFps) {
  let decoder;
  try { decoder = await import('mediabunny'); }
  catch (cause) { throw new Error('Browser video decoding requires mediabunny; install mediabunny@1.62.1', { cause }); }
  const { Input, ALL_FORMATS, UrlSource, BufferSource, VideoSampleSink, VideoSample } = decoder;
  const source = path.startsWith('data:')
    ? new BufferSource(await (await fetch(path)).arrayBuffer())
    : new UrlSource(new URL(path, location.href));
  const input = new Input({ formats: ALL_FORMATS, source });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('This browser cannot decode the video codec');
    const stats = await track.computePacketStats(),
      fps = stats.averagePacketRate,
      indices = sampleIndices(stats.packetCount, fps, config, fallbackFps);
    const width = track.codedWidth,
      height = track.codedHeight,
      unique = [...new Set(indices)],
      wanted = new Set(unique),
      decoded = new Map();
    if (width * height * 3 * indices.length > (options.maxVideoDecodeBytes ?? 512 * 1024 * 1024))
      throw new Error('Selected video frames exceed the decoded-memory limit');
    // FFmpeg/PyAV use the BT.601 matrix for untagged YUV. Mediabunny's
    // Chromium workaround fills missing tags with BT.709, so restore the
    // canonical fallback before the browser performs YUV-to-RGB conversion.
    const decoderConfig = await track.getDecoderConfig(),
      declared = decoderConfig?.colorSpace ?? {};
    const sink = new VideoSampleSink(track),
      canvas = new OffscreenCanvas(width, height),
      context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    let index = 0;
    for await (const sample of sink.samples()) {
      try {
        if (wanted.has(index)) {
          let frame, corrected;
          try {
            if (!declared.matrix && sample.format && !/^RGB|^BGR/.test(sample.format)) {
              const rect = { x: 0, y: 0, width: sample.codedWidth, height: sample.codedHeight };
              const raw = new Uint8Array(sample.allocationSize({ rect })),
                layout = await sample.copyTo(raw, { rect });
              corrected = new VideoSample(raw, {
                format: sample.format,
                codedWidth: sample.codedWidth,
                codedHeight: sample.codedHeight,
                layout,
                timestamp: sample.timestamp,
                colorSpace: {
                  matrix: 'smpte170m',
                  primaries: declared.primaries ?? 'smpte170m',
                  transfer: declared.transfer ?? 'smpte170m',
                  fullRange: declared.fullRange ?? false,
                },
              });
            }
            frame = (corrected ?? sample).toVideoFrame();
            context.drawImage(frame, 0, 0, width, height);
            const rgba = context.getImageData(0, 0, width, height).data,
              rgb = new Uint8ClampedArray(width * height * 3);
            for (let i = 0; i < width * height; ++i) {
              rgb[i * 3] = rgba[i * 4];
              rgb[i * 3 + 1] = rgba[i * 4 + 1];
              rgb[i * 3 + 2] = rgba[i * 4 + 2];
            }
            decoded.set(index, new RawImage(rgb, width, height, 3));
          } finally {
            frame?.close();
            corrected?.close();
          }
        }
        if (index++ >= unique.at(-1)) break;
      } finally {
        sample.close();
      }
    }
    if (decoded.size !== wanted.size) throw new Error('Video metadata does not match decoded frames');
    return {
      frames: indices.map((i) => decoded.get(i)),
      indices,
      fps,
      total: stats.packetCount,
      width,
      height,
    };
  } finally {
    input.dispose();
  }
}
export function decodeVideo(path, config, RawImage, options, fallbackFps) {
  if (typeof path !== 'string' || !path) throw new Error('Video path must be a nonempty string');
  if (path.startsWith('data:')) {
    const comma = path.indexOf(','),
      header = path.slice(0, comma),
      payload = path.slice(comma + 1);
    if (
      !/^data:video\/(mp4|webm|ogg|quicktime);base64$/.test(header) ||
      !payload ||
      payload.length > Math.ceil((64 * 1024 * 1024) / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)
    )
      throw new Error('Invalid or oversized inline video data URL');
  }
  return isNode
    ? nodeVideo(path, config, RawImage, options, fallbackFps)
    : browserVideo(path, config, RawImage, options, fallbackFps);
}
