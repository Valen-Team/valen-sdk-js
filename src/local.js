/** Local inference reuses ONNX Runtime and Transformers.js image processing. */
import { smartResize, formatTimestamp } from './geometry.js';
import { withConsistentResize } from './resizing.js';
import { Assets, isNode } from './assets.js';
import { Compiler, answer, toInternal, toPublic } from './compiler.js';

export class LocalBackend {
  static async create(model, options = {}) {
    if (options.device && !['cpu', 'wasm', 'webgpu'].includes(options.device))
      throw new Error('Unsupported local device');
    if (isNode && options.device && options.device !== 'cpu')
      throw new Error('Node local inference supports CPU; use WebGPU/WASM in a browser');
    if (options.numThreads !== undefined && (!Number.isInteger(options.numThreads) || options.numThreads < 1))
      throw new Error('numThreads must be a positive integer');
    const backend = new LocalBackend();
    backend.assets = await Assets.create(model, options);
    backend.manifest = await backend.assets.json('valen_onnx.json');
    if (backend.manifest.format_version !== 2) throw new Error('Unsupported Valen ONNX manifest');
    backend.variant = backend.manifest.variants[options.variant ?? 'fp32'];
    if (!backend.variant) throw new Error('Requested model variant is unavailable');
    if (backend.manifest.contract_version !== 'valen-decisions-1')
      throw new Error('Unsupported Valen decision contract');
    backend.assets.setVariant(backend.variant);
    backend.name = options.modelName ?? backend.manifest.model_name;
    backend.config = await backend.assets.json('config.json');
    backend.processorConfig = await backend.assets.json('processor_config.json');
    backend.options = options;
    backend.sessions = new Map();
    backend.closed = false;
    backend.queue = Promise.resolve();
    backend.ort = await (isNode ? import('onnxruntime-node') : import('onnxruntime-web/webgpu'));
    if (!isNode && options.wasmPaths) backend.ort.env.wasm.wasmPaths = options.wasmPaths;
    const [tokenizer, tokenizerConfig, template] = await Promise.all([
      backend.assets.json('tokenizer.json'),
      backend.assets.json('tokenizer_config.json'),
      backend.assets.text('chat_template.jinja'),
    ]);
    backend.compiler = new Compiler(tokenizer, tokenizerConfig, template, backend.config, (messages) =>
      backend.processMedia(messages)
    );
    return backend;
  }
  tensor(type, values, shape) {
    if (!['float32', 'float16', 'int64'].includes(type))
      throw new Error(`Unsupported graph tensor type: ${type}`);
    let data;
    if (type === 'int64') data = BigInt64Array.from(values, BigInt);
    else if (type === 'float16') {
      if (typeof Float16Array === 'undefined')
        throw new Error('FP16 variants require Float16Array support or a compatible polyfill');
      data = new Uint16Array(Float16Array.from(values).buffer);
    } else data = values instanceof Float32Array ? values : Float32Array.from(values);
    return new this.ort.Tensor(type, data, shape);
  }
  async session(name) {
    if (!this.sessions.has(name)) {
      const loading = (async () => {
        const graph = this.variant.graphs[name];
        const components = this.variant.components[name];
        const options = {
          executionProviders: [this.options.device === 'webgpu' ? 'webgpu' : isNode ? 'cpu' : 'wasm'],
          graphOptimizationLevel: 'all',
          intraOpNumThreads: this.options.numThreads ?? 4,
        };
        let model;
        if (isNode && this.options.device !== 'webgpu') {
          await Promise.all(components.map((file) => this.assets.file(file)));
          model = await this.assets.file(graph);
        } else {
          model = await (await this.assets.response(graph)).arrayBuffer();
          options.externalData = await Promise.all(
            components
              .filter((file) => file.endsWith('.data'))
              .map(async (file) => ({
                path: file.split('/').at(-1),
                data: await (await this.assets.response(file)).arrayBuffer(),
              }))
          );
        }
        return this.ort.InferenceSession.create(model, options);
      })();
      this.sessions.set(name, loading);
    }
    return this.sessions.get(name);
  }
  async processMedia(messages) {
    const images = [],
      videos = [];
    for (const message of messages)
      for (const item of message.content) {
        if (item.type !== 'image' && item.type !== 'video') continue;
        const { RawImage, Qwen2VLImageProcessor } = await import('@huggingface/transformers');
        const video = item.type === 'video';
        const config = {
          ...this.processorConfig[video ? 'video_processor' : 'image_processor'],
          ...(this.config.valen_media_kwargs?.[video ? 'videos_kwargs' : 'images_kwargs'] ?? {}),
          ...(this.options.mediaKwargs?.[video ? 'videos_kwargs' : 'images_kwargs'] ?? {}),
        };
        const processor = new Qwen2VLImageProcessor(config);
        let frames, metadata;
        if (video) {
          const { decodeVideo } = await import('./video.js');
          metadata = await decodeVideo(
            item.path,
            config,
            RawImage,
            this.options,
            this.processorConfig.video_processor.fps
          );
          frames = [...metadata.frames];
        } else frames = [await RawImage.read(item.path)];
        const count = video ? frames.length : null,
          factor = config.patch_size * config.merge_size;
        let maximum = config.size.longest_edge;
        if (video && config.cap_pixels_per_frame) {
          const cap = (config.max_video_tokens ?? 768) * factor ** 2;
          maximum =
            Math.max(
              Math.min(cap, Math.floor(maximum / count)),
              Math.trunc(config.size.shortest_edge * 1.05)
            ) * count;
        }
        const target =
          config.do_resize === false
            ? [frames[0].width, frames[0].height]
            : smartResize(
                frames[0].height,
                frames[0].width,
                factor,
                config.size.shortest_edge,
                maximum,
                count,
                config.temporal_patch_size
              );
        processor.get_resize_output_image_size = () => target;
        if (video) while (frames.length % config.temporal_patch_size) frames.push(frames.at(-1));
        const result = await processor(
          frames.map((frame) => withConsistentResize(frame, RawImage, this.options))
        );
        const grid = result.image_grid_thw.tolist()[0].map(Number),
          tokens = grid.reduce((a, b) => a * b, 1) / config.merge_size ** 2;
        const media = { grid, tokens, pixels: result.pixel_values.data };
        if (video) {
          const indices = [...metadata.indices];
          while (indices.length % config.temporal_patch_size) indices.push(indices.at(-1));
          const timestamps = [];
          for (let i = 0; i < indices.length; i += config.temporal_patch_size)
            timestamps.push((indices[i] + indices[i + config.temporal_patch_size - 1]) / (2 * metadata.fps));
          media.metadata = {
            fps: metadata.fps,
            total_num_frames: metadata.total,
            frames_indices: metadata.indices,
          };
          const perFrame = (grid[1] * grid[2]) / config.merge_size ** 2;
          media.placeholder = timestamps
            .map(
              (t) =>
                `<${formatTimestamp(t)} seconds><|vision_start|>` +
                '<|video_pad|>'.repeat(perFrame) +
                '<|vision_end|>'
            )
            .join('');
          videos.push(media);
        } else images.push(media);
      }
    return { images, videos };
  }
  async vision(image) {
    const session = await this.session('vision');
    const config = this.config.vision_config;
    const [frames, height, width] = image.grid;
    const merge = config.spatial_merge_size,
      side = Math.sqrt(config.num_position_embeddings),
      count = frames * height * width;
    const indices = new BigInt64Array(4 * count),
      weights = new Float32Array(4 * count);
    const coordinates = [],
      frameIds = [];
    let index = 0;
    for (let frame = 0; frame < frames; ++frame)
      for (let row = 0; row < height / merge; ++row)
        for (let col = 0; col < width / merge; ++col)
          for (let dy = 0; dy < merge; ++dy)
            for (let dx = 0; dx < merge; ++dx) {
              const y = row * merge + dy,
                x = col * merge + dx;
              const yf = Math.fround(height === 1 ? 0 : (y * (side - 1)) / (height - 1));
              const xf = Math.fround(width === 1 ? 0 : (x * (side - 1)) / (width - 1));
              const y0 = Math.floor(yf),
                x0 = Math.floor(xf),
                y1 = Math.min(y0 + 1, side - 1),
                x1 = Math.min(x0 + 1, side - 1);
              const hy = yf - y0,
                hx = xf - x0;
              [y0 * side + x0, y0 * side + x1, y1 * side + x0, y1 * side + x1].forEach((value, k) => {
                indices[k * count + index] = BigInt(value);
              });
              [(1 - hy) * (1 - hx), (1 - hy) * hx, hy * (1 - hx), hy * hx].forEach((value, k) => {
                weights[k * count + index] = value;
              });
              coordinates.push([y, x]);
              frameIds.push(frame);
              ++index;
            }
    const head = config.hidden_size / config.num_heads,
      quarter = head / 4;
    const cosine = new Float32Array(count * head),
      sine = new Float32Array(count * head);
    coordinates.forEach(([y, x], index) => {
      const angles = [];
      for (const value of [y, x])
        for (let i = 0; i < quarter; ++i) angles.push(Math.fround(value / 10000 ** ((2 * i) / (head / 2))));
      [...angles, ...angles].forEach((angle, i) => {
        cosine[index * head + i] = Math.cos(angle);
        sine[index * head + i] = Math.sin(angle);
      });
    });
    const mask = new Float32Array(count * count);
    for (let i = 0; i < count; ++i)
      for (let j = 0; j < count; ++j)
        if (frameIds[i] !== frameIds[j]) mask[i * count + j] = -3.4028234663852886e38;
    const feeds = session.inputNames.includes('image_grid_thw')
      ? {
          pixel_values: this.tensor('float32', image.pixels, [count, image.pixels.length / count]),
          image_grid_thw: this.tensor('int64', image.grid, [1, 3]),
        }
      : {
          pixel_values: this.tensor('float32', image.pixels, [count, image.pixels.length / count]),
          position_indices: new this.ort.Tensor('int64', indices, [4, count]),
          position_weights: this.tensor('float32', weights, [4, count]),
          rotary_cos: this.tensor('float32', cosine, [count, head]),
          rotary_sin: this.tensor('float32', sine, [count, head]),
          attention_mask: this.tensor('float32', mask, [count, count]),
        };
    const result = await session.run(feeds);
    return result[session.outputNames[0]];
  }
  async run(inputs, branches) {
    const length = inputs.ids.length,
      hidden = this.config.text_config.hidden_size;
    const embedding = await this.session('embedding');
    const embedded = (await embedding.run({ input_ids: this.tensor('int64', inputs.ids, [1, length]) }))[
      embedding.outputNames[0]
    ];
    for (const [kind, media] of [
      [this.config.image_token_id, inputs.media.images],
      [this.config.video_token_id, inputs.media.videos],
    ]) {
      let cursor = 0;
      const positions = inputs.ids.flatMap((id, index) => (id === kind ? [index] : []));
      for (const item of media) {
        const visual = await this.vision(item);
        for (let row = 0; row < visual.dims[0]; ++row) {
          const values = visual.data.subarray(row * hidden, (row + 1) * hidden);
          const converted =
            embedded.type === 'float16' && embedded.data instanceof Uint16Array
              ? new Uint16Array(Float16Array.from(values).buffer)
              : values;
          embedded.data.set(converted, positions[cursor++] * hidden);
        }
      }
      if (cursor !== positions.length) throw new Error('Visual placeholder mismatch');
    }
    const spans = branches.flatMap((branch) =>
      branch.candidate_spans.flatMap((candidate) =>
        [
          branch.context_span,
          branch.instruction_span,
          candidate,
          [branch.decision_position, branch.decision_position + 1],
        ].flat()
      )
    );
    const count = spans.length / 8;
    const session = await this.session('decision');
    const feeds = {
      inputs_embeds: embedded,
      attention_mask: this.tensor('int64', Array(length).fill(1), [1, length]),
      position_ids: this.tensor('int64', inputs.positions.flat(), [3, 1, length]),
      role_spans: this.tensor('int64', spans, [count, 4, 2]),
    };
    const dimensions = {
      batch_size: 1,
      past_sequence_length: 0,
      kv_cache_dim: this.config.text_config.head_dim,
    };
    const types = { float: 'float32', float32: 'float32', float16: 'float16', int64: 'int64' };
    for (const input of this.variant.io_schema.decision.inputs) {
      if (input.name in feeds) continue;
      if (!input.name.startsWith('past')) throw new Error(`Unknown graph input ${input.name}`);
      const shape = input.shape.map((dim) => (typeof dim === 'number' ? dim : dimensions[dim]));
      if (shape.some((dim) => !Number.isInteger(dim) || dim < 0))
        throw new Error(`Unknown graph dimensions for ${input.name}`);
      const type = types[String(input.dtype ?? input.type).toLowerCase()];
      feeds[input.name] = this.tensor(type, new Float32Array(shape.reduce((a, b) => a * b, 1)), shape);
    }
    for (const name of Object.keys(feeds)) if (!session.inputNames.includes(name)) delete feeds[name];
    const output = (await session.run(feeds)).logits;
    const logits = Array.from(output.data),
      result = [];
    let offset = 0;
    for (const branch of branches) {
      result.push(logits.slice(offset, (offset += branch.candidate_spans.length)));
    }
    return result;
  }
  predict(body) {
    if (this.closed || this.closing) return Promise.reject(new Error('Valen client is closed'));
    const result = this.queue.then(() => this._predict(body));
    this.queue = result.catch(() => {});
    return result;
  }
  async _predict(body) {
    if (body.model && body.model !== this.name) throw new Error(`This instance serves ${this.name}`);
    const public_ = 'input' in body,
      request = public_ ? toInternal(body) : body;
    const temperature = body.temperature ?? 1;
    const perType = temperature && typeof temperature === 'object' && !Array.isArray(temperature);
    for (const [, question] of request.questions instanceof Map
      ? request.questions
      : Object.entries(request.questions ?? {})) {
      const value = perType ? temperature[question.type] : temperature;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        throw new Error('temperature must be finite and positive for every question type');
    }
    const compiled = await this.compiler.compile(
      request,
      body.execution ?? this.options.execution ?? this.config.qwen_execution
    );
    const values = compiled.inputs
      ? await this.run(
          compiled.inputs,
          compiled.questions.flatMap((question) => question.branches)
        )
      : [];
    const answers = Object.create(null);
    let index = 0;
    for (const question of compiled.questions) {
      const logits = [];
      for (const branch of question.branches)
        logits.push(...(compiled.inputs ? values[index++] : (await this.run(branch.inputs, [branch]))[0]));
      answers[question.qid] = answer(question, logits, perType ? temperature[question.type] : temperature);
    }
    const result = {
      model: this.name,
      answers,
      usage: { input_tokens: compiled.logical_tokens, output_tokens: 0 },
      internal_usage: { compute_tokens: compiled.compute_tokens },
    };
    return public_ ? toPublic(body, result) : result;
  }
  async close() {
    if (!this.closing)
      this.closing = (async () => {
        await this.queue;
        this.closed = true;
        const loaded = await Promise.allSettled([...this.sessions.values()]);
        this.sessions.clear();
        await Promise.all(
          loaded.filter((item) => item.status === 'fulfilled').map((item) => item.value.release())
        );
      })();
    return this.closing;
  }
}
