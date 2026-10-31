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

## 完整应用教程

完整业务流程只在[官网 Cookbook](https://valen-team.github.io/zh-Hans/cookbook/)维护：[工单分流](https://valen-team.github.io/zh-Hans/cookbook/ticket-routing/)、[候选项都不对](https://valen-team.github.io/zh-Hans/cookbook/unknown-categories/)、[商品图片筛选](https://valen-team.github.io/zh-Hans/cookbook/product-screening/)、[短视频标注](https://valen-team.github.io/zh-Hans/cookbook/video-tagging/)。代码、样例和实测结果来自同一维护源。本仓库保留 SDK 接口与安装示例；`Valen.local` 是 ONNX 路径，GGUF 服务使用远程 HTTP 客户端。C++ 集成的支持范围以本仓库说明为准。


## 稳定版本 0.3.0

已正式发布到 [npm](https://www.npmjs.com/package/@valen-team/sdk/v/0.3.0)：

```sh
npm install @valen-team/sdk@0.3.0
```

应用中使用 `import { Valen } from '@valen-team/sdk'`；CommonJS 中可用 `require('@valen-team/sdk')`。包名是 `@valen-team/sdk`；此前计划的 `@valen/sdk` 未发布到 npm，不应继续使用。推理源码和依赖版本未变。HTTP 客户端无需模型下载；本地 ONNX 推理还需下方列出的可选运行时依赖。

[GitHub npm-v0.3.0](https://github.com/Valen-Team/valen-sdk-js/releases/tag/npm-v0.3.0)保留对应源码与发布记录。首次体验也可以使用[网页或免费 API](https://valen-team.github.io/)。

## Node.js 快速开始

建议使用 Node.js 22.12+ 或 24，以及 Git。以下示例使用 CPU：

```bash
git clone --branch npm-v0.3.0 --depth 1 https://github.com/valen-team/valen-sdk-js.git
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
npm install @valen-team/sdk@0.3.0
npm install @huggingface/tokenizers@0.2.0 @huggingface/jinja@0.5.10 @huggingface/transformers@4.3.1 onnxruntime-node@1.30.0
```

将下面代码保存为 `example.mjs`，运行 `node example.mjs`：

```js
import { Valen } from '@valen-team/sdk';

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

本地媒体接口的最短示例保留在 `examples/`；完整输入、依赖、运行命令、结果与不确定性处理统一见[图片筛选](https://valen-team.github.io/zh-Hans/cookbook/product-screening/)、[短视频标注](https://valen-team.github.io/zh-Hans/cookbook/video-tagging/)和[直接视频基础](https://valen-team.github.io/zh-Hans/cookbook/local-inference/)。共享素材 `Valen/assets/cookbook/` 的 URL 保持不变。

## HTTP 客户端

已有 Valen HTTP 服务时，只安装 SDK 即可使用，模型在服务端运行：

```bash
npm install @valen-team/sdk@0.3.0
```

```js
import { Valen } from '@valen-team/sdk';

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

`timeout`（毫秒，默认 120000）和 `maxRetries`（默认 2）作用于每个请求；429、502、503、504 和连接失败会退避重试。在请求选项中传入 `{ signal, timeout }` 可取消单个请求或单独设置超时，例如 `client.systemOne(state, questions, { signal: AbortSignal.timeout(5000) })`。服务和网络失败抛出 `ValenAPIError`，带有 `statusCode`、`requestId` 和底层的 `cause`；被取消的请求以 signal 的原因拒绝，例如 `AbortError` 或 `TimeoutError`。传入 `signal` 需要 `AbortSignal.any`（Node 20.3+、Chrome 116+、Safari 17.4+、Firefox 124+）。

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

[Python SDK](https://github.com/valen-team/valen-sdk-python) · [C++ 文本集成](https://github.com/valen-team/valen-sdk-cpp) · [免费 API 文档](https://valen-team.github.io/docs/valen/api/) · [Agent skill](https://github.com/Valen-Team/skills) · [llms.txt](https://valen-team.github.io/zh-Hans/llms.txt)

Apache-2.0。见 [LICENSE](LICENSE)、[第三方许可](THIRD_PARTY_NOTICES.md) 和 [Pillow 许可](PILLOW-LICENSE.txt)。

用户指南唯一维护在官网：[Documentation](https://valen-team.github.io/zh-Hans/docs/) · [Fine-tuning](https://valen-team.github.io/zh-Hans/docs/valen/training/) · [Probabilities](https://valen-team.github.io/zh-Hans/docs/valen/probabilities/) · [Cookbook](https://valen-team.github.io/zh-Hans/cookbook/).

## 类型推导与调用预算

`systemOne` / `system_one` 根据问题推导问题名、答案类型和 Choice 候选值；`decisions` 支持问题元组的答案类型推导。类型化调用会拒绝漏答、重复答案和非法概率，原始 `predict` 保留宽松接口。

`timeout` 是每次尝试的毫秒数，`totalTimeout` 包含重试等待；`signal` 取消网络请求和等待。`onEvent` 仅提供请求或本地加载元数据。用本地 `info` 查看配置，`warmup(request)` 加载实际请求需要的模型图。[行为契约](contracts/README.md) · [可运行示例](examples/reliability.mjs)。

浏览器视频解码需额外安装 `npm install mediabunny@1.62.1`；仅 HTTP 调用无运行时依赖。浏览器示例已显式声明此依赖。
