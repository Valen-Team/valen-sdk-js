# Third party components

Valen's compiler, protocol and response formulas derive from the Apache-2.0 Valen project. Tokenization and template rendering use Hugging Face tokenizers and Jinja; media patch processing uses Transformers.js, under their respective Apache-2.0 licenses. Qwen geometry and mRoPE follow the Qwen/Transformers reference implementation.

`src/wasm/pillow_resize.wasm` contains Pillow 13.0.0's unmodified resampling kernel (revision `293218ad059d994baf1777d882911bed6a49704a`) and a small Valen allocation/layout adapter. Pillow's full MIT-CMU copyright and permission notice is included in `PILLOW-LICENSE.txt`. Rebuilding instructions and adapter source are in `native/pillow/` in the source distribution. The published package includes the compiled WASM asset.

Local model execution uses Microsoft ONNX Runtime under MIT. Browser video decoding uses Mediabunny under MPL-2.0 through a normal package dependency; its files are unmodified and retain their upstream license and source availability. Browser video additionally requires a codec supported by the browser's WebCodecs implementation.

Node video invokes an externally installed FFmpeg and ffprobe. No FFmpeg binaries are shipped in this package. Development-only fixture generation used ffmpeg-static; that binary is excluded from the package. Consumers choose and license their own FFmpeg distribution.

The browser graph template comes from `onnx-community/Qwen3.5-0.8B-ONNX` revision `8fe9dbe3fb39fe902e18df9be84b6a0ac77ae0f6`; only graph structure is reused. All learned tensors are mapped from Valen weights, with tensor hashes recorded by the exporter. Model assets are distributed separately from this SDK.
