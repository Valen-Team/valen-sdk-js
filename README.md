<p align="center">
  <a href="https://github.com/Valen-Team/Valen"><img src="assets/branding/valen-mark-white.png" alt="Valen" width="112"></a>
</p>
<h1 align="center">Valen JavaScript SDK</h1>
<p align="center"><strong>Fast Decisions. Continuous Evolution.</strong></p>
<p align="center">Bring Valen’s multimodal System One decisions to Node.js and the browser.</p>

<p align="center">
  <strong>English</strong> · <a href="README_zh.md">简体中文</a><br>
  <a href="https://github.com/Valen-Team/Valen">Valen</a> · <a href="https://valen-team.github.io/">Try Valen</a> · <a href="https://valen-team.github.io/docs/">Documentation</a> · <a href="https://huggingface.co/Valen-Team">Models</a>
</p>

<p align="center">
  <a href="https://github.com/Valen-Team/valen-sdk-python">Python SDK</a> · <strong>JavaScript SDK</strong> · <a href="https://github.com/Valen-Team/valen-sdk-cpp">C++ integration</a>
</p>

[Valen](https://github.com/Valen-Team/Valen) is a multimodal System One decision model that returns structured decision probabilities for your tasks. This repository provides the JavaScript SDK for Valen.

Add Valen decisions to a Node.js service or browser application. Turn text, images and video into categories, yes/no probabilities and scores for routing, screening and ranking. Run local ONNX inference or call an existing HTTP service. TypeScript declarations are included.

## Stable version 0.2.0

Install the GitHub stable release (this does not mean publication on PyPI/npm):

```sh
npm install https://github.com/Valen-Team/valen-sdk-js/releases/download/v0.2.0/valen-sdk-0.2.0.tgz
```

Registry publication still requires maintainer permissions. Only after 0.2.0 appears in the registry, use:

```sh
npm install @valen/sdk@0.2.0
```

For a first try, use the [web experience or free API](https://valen-team.github.io/). See [version selection](https://valen-team.github.io/docs/valen/choosing/).

## Node.js quick start

Use Node.js 22.12+ or 24 and Git. This example runs on CPU:

```bash
git clone --branch v0.2.0 --depth 1 https://github.com/valen-team/valen-sdk-js.git
cd valen-sdk-js
npm ci --ignore-scripts
node examples/local.mjs
```

Example output:

```text
Intent: address
Address change probability: 0.998
Explicitness score (0–2): 1.921
```

[The complete example](examples/local.mjs) covers `choice`, `predicate` and `score` questions. The first run downloads required components; later runs reuse the cache. Text requests do not download vision weights. See the [0.8B](https://huggingface.co/Valen-Team/Valen-0.8B-ONNX), [2B](https://huggingface.co/Valen-Team/Valen-2B-ONNX) and [4B](https://huggingface.co/Valen-Team/Valen-4B-ONNX) cards for model sizes and variants.

To install in your own application:

```bash
npm install https://github.com/valen-team/valen-sdk-js.git#v0.2.0
npm install @huggingface/tokenizers@0.2.0 @huggingface/jinja@0.5.10 @huggingface/transformers@4.3.1 onnxruntime-node@1.30.0
```

Save this as `example.mjs` and run `node example.mjs`:

```js
import { Valen } from '@valen/sdk';

const client = await Valen.local('Valen-Team/Valen-0.8B-ONNX', { variant: 'fp32' });
try {
  const result = await client.decisions({
    input: 'Please send my order to my new address.',
    questions: [{ name: 'change_address', type: 'predicate',
      instructions: 'Is the customer requesting a delivery address change?' }],
  });
  console.log('Address change probability:', result.answers[0].probability);
} finally {
  await client.close();
}
```

Yes/no probabilities range from 0 to 1. In multi-question requests, `answers` follows request order. Each example creates and closes its own client.

## Browser WebGPU

Start the included [Vite example](examples/browser):

```bash
cd examples/browser
npm install
npm run dev
```

Open the localhost URL printed in the terminal and click **Run locally**. First use downloads the 0.8B browser model components; later runs reuse the browser cache. The example includes runtime assets, a page and error feedback. Use a WebGPU-capable browser.

From `examples/browser`, run `npm run build` to build and `npm run preview` to preview locally. Deploy over HTTPS with the example's COOP/COEP response headers. The full browser variant is about 2.44 GB; single-question warm p50 was 3.13 s in Chrome on Apple M2.

## Images and video

From the SDK repository root, run the image example:

```bash
curl -L https://raw.githubusercontent.com/Valen-Team/Valen/main/assets/cookbook/sheep.jpg -o sheep.jpg
node examples/media.mjs sheep.jpg
```

Node video needs FFmpeg and ffprobe. Install with `brew install ffmpeg` on macOS or `sudo apt install ffmpeg` on Debian/Ubuntu. The example samples four frames:

```bash
curl -L https://raw.githubusercontent.com/Valen-Team/Valen/main/assets/cookbook/momos.mp4 -o momos.mp4
node examples/media.mjs momos.mp4 --video
```

[The media example](examples/media.mjs) uses `input_image` / `input_video` messages and local paths. Browser video decoding uses WebCodecs; supported codecs depend on the browser.

## HTTP client

For an existing Valen service, install only the SDK; inference runs on the server:

```bash
npm install https://github.com/valen-team/valen-sdk-js.git#v0.2.0
```

```js
import { Valen } from '@valen/sdk';

const client = Valen.remote('http://127.0.0.1:8000/v1', { model: 'valen' });
try {
  const result = await client.decisions({
    input: 'Please send my order to my new address.',
    questions: [{ name: 'change_address', type: 'predicate',
      instructions: 'Is the customer requesting a delivery address change?' }],
  });
  console.log('Address change probability:', result.answers[0].probability);
} finally {
  await client.close();
}
```

This example calls `http://127.0.0.1:8000/v1`. Start a local service with the [Python SDK](https://github.com/valen-team/valen-sdk-python#local-http-service). Pass `apiKey` in the `Valen.remote` options when the server uses authentication.

## SystemOne and options

Run `node examples/system-one.mjs` for the same task in SystemOne format. `client.systemOne(state, questions)` uses questions keyed by ID; read answers by ID. `client.predict(request)` accepts raw JSON.

| Option | Use |
| --- | --- |
| `variant` | Node CPU: `fp32` or `q8-mlp`; browser: `web-portable` |
| `cacheDir` / `revision` | Choose a cache location or HF model revision |
| `localFilesOnly` | Run from an existing cache offline; a local model directory also works |
| `numThreads` | Node CPU inference threads, default 4 |
| `execution` | Default `shared_state` shares a forward pass within a request; `question` compiles questions separately |
| `temperature` | Request temperature, default 1 |
| `mediaKwargs` | Image size, video frame count or FPS |

One local client executes requests serially. For CUDA, use a [Python service](https://github.com/valen-team/valen-sdk-python#cuda) and call it over HTTP from Node.

## More

[Python SDK](https://github.com/valen-team/valen-sdk-python) · [C++ text integration](https://github.com/valen-team/valen-sdk-cpp) · [Free API documentation](https://valen-team.github.io/docs/valen/api/)

Apache-2.0. See [LICENSE](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md) and the [Pillow license](PILLOW-LICENSE.txt).
