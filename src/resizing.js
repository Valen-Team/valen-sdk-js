/** The unmodified Pillow 13.0 resampling kernel, built as a small standalone WASM asset. */
import { isNode } from './assets.js';
let ready;
async function getPillow(options) {
  if (!ready)
    ready = (async () => {
      const url = options.pillowWasmUrl ?? new URL('./wasm/pillow_resize.wasm', import.meta.url);
      let bytes;
      if (isNode) {
        const { readFile } = await import('node:fs/promises');
        bytes = await readFile(
          url instanceof URL ? url : typeof url === 'string' && url.startsWith('file:') ? new URL(url) : url
        );
      } else {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Pillow WASM download failed (${response.status})`);
        bytes = await response.arrayBuffer();
      }
      const { instance } = await WebAssembly.instantiate(bytes, {
        env: { emscripten_notify_memory_growth() {} },
        wasi_snapshot_preview1: { fd_close: () => 8, fd_seek: () => 8, fd_write: () => 8 },
      });
      instance.exports._initialize?.();
      return instance.exports;
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}
export function withConsistentResize(image, RawImage, options = {}) {
  image = image.rgb();
  image.resize = async function (width, height, { resample = 3 } = {}) {
    if (width === this.width && height === this.height) return this;
    const filter =
      typeof resample === 'number'
        ? resample
        : { nearest: 0, lanczos: 1, bilinear: 2, bicubic: 3, box: 4, hamming: 5 }[resample];
    if (!Number.isInteger(filter) || filter < 0 || filter > 5)
      throw new Error('Unsupported Pillow resampling filter');
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
      throw new Error('Invalid resized image dimensions');
    const module = await getPillow(options);
    const input = module.malloc(this.data.length),
      output = module.malloc(width * height * 3);
    if (!input || !output) {
      if (input) module.free(input);
      if (output) module.free(output);
      throw new Error('Image resize memory allocation failed');
    }
    try {
      new Uint8Array(module.memory.buffer).set(this.data, input);
      if (!module.pillow_resize(input, this.width, this.height, output, width, height, filter))
        throw new Error('Pillow image resize failed');
      const data = new Uint8ClampedArray(module.memory.buffer, output, width * height * 3).slice();
      return new RawImage(data, width, height, 3);
    } finally {
      module.free(input);
      module.free(output);
    }
  };
  return image;
}
