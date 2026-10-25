/** Qwen's canonical geometry and NumPy/Python rounding semantics. */
export function roundEven(value) {
  const floor = Math.floor(value),
    fraction = value - floor;
  return fraction < 0.5 ? floor : fraction > 0.5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;
}
export function smartResize(height, width, factor, minimum, maximum, frames = null, temporal = 2) {
  if (!(height > 0 && width > 0) || Math.max(height, width) / Math.min(height, width) > 200)
    throw new Error('Invalid image dimensions/aspect ratio');
  if (frames !== null) {
    if (frames < temporal)
      throw new Error('Video must contain at least one temporal patch of sampled frames');
    if (height < factor || width < factor) {
      const scale = Math.max(factor / height, factor / width);
      height = Math.trunc(height * scale);
      width = Math.trunc(width * scale);
    }
  }
  let h = roundEven(height / factor) * factor,
    w = roundEven(width / factor) * factor;
  const count = frames === null ? 1 : roundEven(frames / temporal) * temporal;
  if (count * h * w > maximum) {
    const beta = Math.sqrt((height * width * (frames ?? 1)) / maximum);
    h = Math.max(factor, Math.floor(height / beta / factor) * factor);
    w = Math.max(factor, Math.floor(width / beta / factor) * factor);
  } else if (count * h * w < minimum) {
    const beta = Math.sqrt(minimum / (height * width * (frames ?? 1)));
    h = Math.ceil((height * beta) / factor) * factor;
    w = Math.ceil((width * beta) / factor) * factor;
  }
  return [w, h];
}
export function sampleIndices(total, fps, config, fallbackFps = 2) {
  if (!Number.isInteger(total) || total < 1 || !Number.isFinite(fps) || fps <= 0)
    throw new Error('Invalid video frame metadata');
  let count = config.num_frames;
  if (config.do_sample_frames === false) count = total;
  else {
    if (count != null && config.fps != null) throw new Error('num_frames and fps are mutually exclusive');
    if (count == null) {
      const requested = config.fps ?? fallbackFps;
      if (requested != null) {
        if (!Number.isFinite(requested) || requested <= 0)
          throw new Error('Video fps must be finite and positive');
        count = Math.min(
          Math.max(Math.trunc((total / fps) * requested), config.min_frames ?? 4),
          config.max_frames ?? 768,
          total
        );
      } else count = Math.min(Math.max(total, config.min_frames ?? 4), config.max_frames ?? 768);
    }
  }
  if (!Number.isInteger(count) || count < 1) throw new Error('num_frames must be a positive integer');
  const step = count === 1 ? 0 : (total - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 && count > 1 ? total - 1 : roundEven(i * step)
  );
}
// Python formats the actual binary float, with round-to-even, rather than the
// decimal value obtained by multiplying and rounding a second time.
export function formatTimestamp(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid frame timestamp');
  const bytes = new ArrayBuffer(8),
    view = new DataView(bytes);
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false);
  const exponent = Number((bits >> 52n) & 2047n),
    mantissa = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  const power = (exponent || 1) - 1023 - 52;
  let numerator = mantissa * 10n,
    denominator = 1n;
  if (power < 0) denominator <<= BigInt(-power);
  else numerator <<= BigInt(power);
  let rounded = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n > denominator || (remainder * 2n === denominator && rounded % 2n)) ++rounded;
  return `${rounded / 10n}.${rounded % 10n}`;
}
