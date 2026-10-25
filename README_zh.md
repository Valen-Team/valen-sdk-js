<p align="center">
  <a href="https://github.com/Valen-Team/Valen"><img src="assets/branding/valen-mark-white.png" alt="Valen" width="112"></a>
</p>
<h1 align="center">Valen JavaScript SDK</h1>
<p align="center"><strong>快速决策，持续进化。</strong></p>
<p align="center">将 Valen 的多模态 System One 决策接入 Node.js 和浏览器。</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong><br>
  <a href="https://github.com/Valen-Team/Valen">Valen 主仓库</a> · <a href="https://valen-team.github.io/zh-Hans/">在线体验</a> · <a href="https://valen-team.github.io/zh-Hans/docs/">文档</a> · <a href="https://huggingface.co/Valen-Team">模型</a>
</p>

<p align="center">
  <a href="https://github.com/Valen-Team/valen-sdk-python">Python SDK</a> · <strong>JavaScript SDK</strong> · <a href="https://github.com/Valen-Team/valen-sdk-cpp">C++ 集成</a>
</p>

[Valen（万澜）](https://github.com/Valen-Team/Valen) 是多模态 System One 决策模型，面向给定任务输出结构化决策概率。本仓库提供 Valen 的 JavaScript SDK。

将 Valen 决策接入 Node.js 服务或浏览器应用。输入文本、图片或视频，获取类别、是非概率和评分，用于路由、筛选和排序。支持本地 ONNX 推理，也可通过 HTTP 调用已有服务；包内提供 TypeScript 类型。

## Node.js 快速开始

建议使用 Node.js 22.12+ 或 24，以及 Git。以下示例使用 CPU：

```bash
git clone https://github.com/valen-team/valen-sdk-js.git
cd valen-sdk-js
npm ci --ignore-scripts
node examples/local.mjs
```

示例输出：

```text
Intent: address
Address change probability: 0.998
Explicitness score (0–2): 1.921
```

[完整示例](examples/local.mjs) 同时展示 `choice`、`predicate`、`score` 三类问题。首次运行下载所需组件，后续复用缓存；纯文本不下载视觉权重。模型和体积见 [0.8B](https://huggingface.co/Valen-Team/Valen-0.8B-ONNX)、[2B](https://huggingface.co/Valen-Team/Valen-2B-ONNX)、[4B](https://huggingface.co/Valen-Team/Valen-4B-ONNX)。

在自己的项目中安装：

```bash
npm install https://github.com/valen-team/valen-sdk-js.git
npm install @huggingface/tokenizers@0.2.0 @huggingface/jinja@0.5.10 @huggingface/transformers@4.3.1 onnxruntime-node@1.30.0
```

将下面代码保存为 `example.mjs`，运行 `node example.mjs`：

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

是非概率范围为 0–1；多问题请求的 `answers` 按请求顺序返回。每个示例自行创建并关闭客户端。

## 浏览器 WebGPU

仓库包含可直接启动的 [Vite 示例](examples/browser)：

```bash
cd examples/browser
npm install
npm run dev
```

打开终端显示的 localhost 地址，点击 **Run locally**。首次运行会下载 0.8B 的浏览器模型组件，随后复用浏览器缓存。示例提供运行时资源、页面和错误提示；使用支持 WebGPU 的浏览器。

在 `examples/browser` 中执行 `npm run build` 构建，`npm run preview` 本地预览。部署时通过 HTTPS 提供页面，并保留示例中的 COOP/COEP 响应头。0.8B 的完整浏览器变体约 2.44 GB；Apple M2 Chrome 单问题热运行 p50 为 3.13 秒。

## 图片和视频

回到 SDK 仓库根目录后运行图片示例：

```bash
curl -L https://raw.githubusercontent.com/Valen-Team/Valen/main/assets/cookbook/sheep.jpg -o sheep.jpg
node examples/media.mjs sheep.jpg
```

Node 视频需要 FFmpeg 和 ffprobe；macOS 使用 `brew install ffmpeg`，Debian/Ubuntu 使用 `sudo apt install ffmpeg` 安装。示例采样四帧：

```bash
curl -L https://raw.githubusercontent.com/Valen-Team/Valen/main/assets/cookbook/momos.mp4 -o momos.mp4
node examples/media.mjs momos.mp4 --video
```

[媒体示例](examples/media.mjs) 使用 `input_image` / `input_video` 消息和本地路径。浏览器视频解码使用 WebCodecs，支持的格式由浏览器决定。

## HTTP 客户端

已有 Valen HTTP 服务时，只安装 SDK 即可使用，模型在服务端运行：

```bash
npm install https://github.com/valen-team/valen-sdk-js.git
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

该例调用 `http://127.0.0.1:8000/v1`；可用 [Python SDK](https://github.com/valen-team/valen-sdk-python#local-http-service) 启动本地服务。服务启用鉴权时，在 `Valen.remote` 选项中传入 `apiKey`。

## SystemOne 与参数

`node examples/system-one.mjs` 展示同一任务的 SystemOne 格式。`client.systemOne(state, questions)` 使用按问题 ID 索引的字典，结果同样按 ID 读取。`client.predict(request)` 接受原始 JSON。

| 选项 | 用途 |
| --- | --- |
| `variant` | Node CPU 使用 `fp32` 或 `q8-mlp`；浏览器使用 `web-portable` |
| `cacheDir` / `revision` | 指定缓存位置或 HF 模型版本 |
| `localFilesOnly` | 从已有缓存离线运行，也可直接传入本地模型目录 |
| `numThreads` | Node CPU 推理线程数，默认 4 |
| `execution` | 默认 `shared_state`，同一请求内共享前向；`question` 单独编译各问题 |
| `temperature` | 请求温度，默认 1 |
| `mediaKwargs` | 图片尺寸、视频帧数或 FPS |

一个本地客户端按序执行请求。Node CUDA 推理使用 [Python 服务](https://github.com/valen-team/valen-sdk-python#cuda) 配合 HTTP 客户端。

## 更多

[Python SDK](https://github.com/valen-team/valen-sdk-python) · [C++ 文本集成](https://github.com/valen-team/valen-sdk-cpp) · [免费 API 文档](https://valen-team.github.io/docs/valen/api/)

Apache-2.0。见 [LICENSE](LICENSE)、[第三方许可](THIRD_PARTY_NOTICES.md) 和 [Pillow 许可](PILLOW-LICENSE.txt)。
