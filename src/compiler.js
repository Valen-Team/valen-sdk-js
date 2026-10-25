/** Valen's canonical compiler, with tokenization/Jinja delegated to HF libraries. */
import { Tokenizer } from '@huggingface/tokenizers';
import { Template } from '@huggingface/jinja';

const encoder = new TextEncoder();
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const entries = (object) => (object instanceof Map ? [...object.entries()] : Object.entries(object));

export function toInternal(body) {
  assert(body && typeof body === 'object', 'Request must be an object');
  const temperature = body.temperature ?? 1;
  assert(
    typeof temperature === 'number' && Number.isFinite(temperature) && temperature > 0,
    'temperature must be finite and positive'
  );
  let state;
  if (typeof body.input === 'string') state = body.input;
  else {
    assert(Array.isArray(body.input) && body.input.length, 'input must be text or a nonempty message list');
    state = { messages: structuredClone(body.input) };
    for (const message of state.messages) {
      assert(['user', 'assistant', 'system'].includes(message.role), 'Unsupported message role');
      if (typeof message.content === 'string') continue;
      assert(Array.isArray(message.content) && message.content.length, 'Message content must be nonempty');
      for (const item of message.content) {
        if (item.type === 'input_text' && typeof item.text === 'string') item.type = 'text';
        else if (item.type === 'input_image' && typeof item.image_url === 'string') {
          item.type = 'image_url';
          item.image_url = { url: item.image_url };
        } else if (item.type === 'input_video' && typeof item.video_url === 'string') {
          item.type = 'video_url';
          item.video_url = { url: item.video_url };
        } else throw new Error('Use input_text, input_image or input_video parts');
      }
    }
  }
  assert(
    Array.isArray(body.questions) && body.questions.length >= 1 && body.questions.length <= 256,
    'questions must contain 1–256 questions'
  );
  const questions = new Map();
  body.questions.forEach((question, index) => {
    const name = question.name ?? String(index);
    assert(
      typeof name === 'string' && name.length && !questions.has(name),
      'Question names must be unique nonempty strings'
    );
    const item = {
      type: question.type === 'predicate' ? 'noul' : question.type,
      instructions: question.instructions,
    };
    if (question.type === 'choice' || question.type === 'score') {
      const values = question[question.type === 'choice' ? 'choices' : 'levels'];
      assert(
        Array.isArray(values) &&
          values.length >= (question.type === 'choice' ? 1 : 2) &&
          values.length <= 255,
        'Invalid candidate count'
      );
      const labels = values.map((value) => value[question.type === 'choice' ? 'value' : 'label']);
      assert(new Set(labels).size === labels.length, 'Candidate values must be unique');
      assert(
        labels.every(
          (value) => typeof value === 'string' || (question.type === 'choice' && typeof value === 'boolean')
        ),
        'Invalid candidate value type'
      );
      assert(
        values.every((value) => typeof value.description === 'string' && value.description.trim()),
        'Candidate descriptions must be nonempty'
      );
      if (question.type === 'choice') {
        const used = new Set(labels.filter((value) => typeof value === 'string'));
        item.criteria = new Map(
          labels.map((value, i) => {
            let key = String(value);
            if (typeof value === 'boolean') {
              while (used.has(key)) key = 'bool:' + key;
              used.add(key);
            }
            return [key, values[i].description];
          })
        );
      } else item.criteria = values.map((value) => value.description);
    } else assert(question.type === 'predicate', 'Unsupported decision type');
    questions.set(name, item);
  });
  return { state, questions };
}

function candidates(question) {
  assert(
    typeof question.instructions === 'string' && question.instructions.trim(),
    'instructions must be nonempty text'
  );
  if (question.type === 'noul')
    return [
      ['true', 'True / 是：满足问题中的条件。'],
      ['false', 'False / 否：不满足问题中的条件。'],
    ];
  let pairs;
  if (question.type === 'choice') {
    assert(question.criteria && !Array.isArray(question.criteria), 'Choice requires named criteria');
    pairs = entries(question.criteria);
    assert(pairs.length >= 1 && pairs.length <= 255, 'Choice requires 1–255 candidates');
  } else {
    assert(
      question.type === 'score' &&
        Array.isArray(question.criteria) &&
        question.criteria.length >= 2 &&
        question.criteria.length <= 255,
      'Score requires 2–255 descriptions'
    );
    pairs = question.criteria.map((value, index) => [String(index), value]);
  }
  assert(
    pairs.every(
      ([key, value]) => typeof key === 'string' && key && typeof value === 'string' && value.trim()
    ),
    'Candidate names and descriptions must be nonempty strings'
  );
  return pairs;
}

export class Compiler {
  constructor(tokenizerJson, tokenizerConfig, template, config, mediaProcessor) {
    this.tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
    this.template = new Template(template);
    this.config = config;
    this.mediaProcessor = mediaProcessor;
    this.specials = tokenizerJson.added_tokens.filter((token) => token.special).map((token) => token.content);
    assert(
      tokenizerJson.normalizer?.type === 'NFC' && tokenizerJson.decoder?.type === 'ByteLevel',
      'This Valen compiler requires the validated NFC/ByteLevel tokenizer'
    );
    const bytes = [...Array(94)]
      .map((_, i) => i + 33)
      .concat(
        [...Array(12)].map((_, i) => i + 161),
        [...Array(82)].map((_, i) => i + 174)
      );
    const codes = [...bytes];
    for (let value = 0, extra = 0; value < 256; ++value)
      if (!bytes.includes(value)) {
        bytes.push(value);
        codes.push(256 + extra++);
      }
    this.byteDecoder = new Map(codes.map((code, i) => [String.fromCodePoint(code), bytes[i]]));
  }
  encode(text) {
    return this.tokenizer.encode(text, { add_special_tokens: false }).ids;
  }
  encodeSpan(text, span) {
    const encoded = this.tokenizer.encode(text, { add_special_tokens: false });
    const start = encoder.encode(text.slice(0, span[0]).normalize('NFC')).length;
    const end = encoder.encode(text.slice(0, span[1]).normalize('NFC')).length;
    let cursor = 0;
    const indices = [];
    const reconstructed = [];
    encoded.tokens.forEach((token, index) => {
      const bytes = [...token].map((char) => this.byteDecoder.get(char));
      assert(
        bytes.every((byte) => byte !== undefined),
        'Unsupported non-byte token in role text'
      );
      if (cursor < end && cursor + bytes.length > start) indices.push(index);
      reconstructed.push(...bytes);
      cursor += bytes.length;
    });
    const normalized = encoder.encode(text.normalize('NFC'));
    assert(
      reconstructed.length === normalized.length && reconstructed.every((byte, i) => byte === normalized[i]),
      'Tokenizer byte alignment failed'
    );
    assert(indices.length, 'Empty token span for decision role');
    return { ids: encoded.ids, span: [indices[0], indices.at(-1) + 1] };
  }
  checkText(text) {
    assert(!this.specials.some((token) => text.includes(token)), 'Reserved tokenizer control token');
  }
  async compile(request, execution = this.config.qwen_execution ?? 'shared_state') {
    assert(['shared_state', 'question'].includes(execution), 'Unknown execution mode');
    const selected = entries(request.questions).map(([qid, question]) => ({
      ...question,
      qid,
      pairs: candidates(question),
    }));
    assert(selected.length, 'questions must be nonempty');
    const messages =
      typeof request.state === 'string'
        ? [{ role: 'user', content: request.state }]
        : structuredClone(request.state.messages);
    for (const message of messages) {
      assert(['user', 'assistant', 'system'].includes(message.role), 'Unsupported state role');
      if (typeof message.content === 'string') message.content = [{ type: 'text', text: message.content }];
      for (const item of message.content) {
        if (item.type === 'text') this.checkText(item.text);
        else {
          assert(['image_url', 'video_url'].includes(item.type), 'Unsupported content type');
          item.path = item[item.type].url;
          item.type = item.type.slice(0, -4);
        }
      }
    }
    let text = this.template.render({ messages, add_generation_prompt: false });
    const media = await this.mediaProcessor(messages);
    let imageIndex = 0;
    text = text.replaceAll('<|image_pad|>', () => '<|image_pad|>'.repeat(media.images[imageIndex++].tokens));
    if (media.videos?.length) {
      let videoIndex = 0;
      text = text.replaceAll(
        '<|vision_start|><|video_pad|><|vision_end|>',
        () => '<|vision_start|>' + media.videos[videoIndex++].placeholder + '<|vision_end|>'
      );
    }
    const base = this.encode(text);
    const baseLength = base.length;
    const questions = [];
    let logicalTokens = baseLength,
      computeTokens = 0;
    const appendFactory = (suffix) => (text, span) => {
      const start = baseLength + suffix.length;
      if (!span) {
        suffix.push(...this.encode(text));
        return null;
      }
      const encoded = this.encodeSpan(text, span);
      suffix.push(...encoded.ids);
      return encoded.span.map((index) => start + index);
    };
    const validateLength = (length) =>
      assert(length <= (this.config.valen_max_length ?? 32768), 'Input exceeds max_length; no truncation');
    const makeInputs = (ids) => ({ ids, media, positions: mrope(ids, media, this.config) });
    const checkedQuestion = (question) => {
      for (const value of [question.instructions, ...question.pairs.flat()]) this.checkText(value);
    };
    if (execution === 'shared_state') {
      const suffix = [],
        append = appendFactory(suffix);
      append('<|im_start|>user\n');
      selected.forEach((question, index) => {
        checkedQuestion(question);
        const prefix = `Question ${index + 1}\nTask: ${question.type}\nQuestion: `;
        const instruction = append(prefix + question.instructions + '\nCandidates:\n', [
          prefix.length,
          prefix.length + question.instructions.length,
        ]);
        const spans = [],
          positions = [];
        for (const [key, description] of question.pairs) {
          const prefix = question.type === 'score' ? '' : key + ': ';
          spans.push(append(prefix + description, [prefix.length, prefix.length + description.length]));
          positions.push(baseLength + suffix.length - 1);
          append('\n');
        }
        questions.push({
          ...question,
          keys: question.pairs.map((pair) => pair[0]),
          descriptions: question.pairs.map((pair) => pair[1]),
          branches: [
            {
              context_span: [0, baseLength],
              instruction_span: instruction,
              candidate_spans: spans,
              candidate_positions: positions,
              decision_position: -1,
            },
          ],
        });
      });
      append('<|im_end|>\n<|im_start|>assistant\n');
      questions.forEach((question, index) => {
        append(`Question ${index + 1} Decision:`);
        question.branches[0].decision_position = baseLength + suffix.length - 1;
        append('\n');
      });
      const ids = base.concat(suffix);
      validateLength(ids.length);
      const inputs = makeInputs(ids);
      for (const question of questions) question.branches[0].inputs = inputs;
      return { questions, inputs, logical_tokens: ids.length, compute_tokens: ids.length };
    }
    for (const question of selected) {
      checkedQuestion(question);
      const branches = [];
      for (const group of question.type === 'score'
        ? question.pairs.map((pair) => [pair])
        : [question.pairs]) {
        const suffix = [],
          append = appendFactory(suffix);
        append('<|im_start|>user\n');
        const prefix = `Task: ${question.type}\nQuestion: `;
        const instruction = append(prefix + question.instructions + '\nCandidates:\n', [
          prefix.length,
          prefix.length + question.instructions.length,
        ]);
        const spans = [],
          positions = [];
        for (const [key, description] of group) {
          const prefix = question.type === 'score' ? '' : key + ': ';
          spans.push(append(prefix + description, [prefix.length, prefix.length + description.length]));
          positions.push(baseLength + suffix.length - 1);
          append('\n');
        }
        append('Decision:');
        const ids = base.concat(suffix);
        validateLength(ids.length);
        branches.push({
          inputs: makeInputs(ids),
          context_span: [0, baseLength],
          instruction_span: instruction,
          candidate_spans: spans,
          candidate_positions: positions,
          decision_position: ids.length - 1,
        });
        logicalTokens += suffix.length;
        computeTokens += ids.length;
      }
      questions.push({
        ...question,
        keys: question.pairs.map((pair) => pair[0]),
        descriptions: question.pairs.map((pair) => pair[1]),
        branches,
      });
    }
    return { questions, inputs: null, logical_tokens: logicalTokens, compute_tokens: computeTokens };
  }
}

export function mrope(ids, media, config) {
  const imageId = config.image_token_id,
    videoId = config.video_token_id;
  const merge = config.vision_config.spatial_merge_size;
  const grids = {
    1: media.images.map((image) => image.grid),
    2: (media.videos ?? []).flatMap((video) =>
      Array.from({ length: video.grid[0] }, () => [1, video.grid[1], video.grid[2]])
    ),
  };
  const indices = { 1: 0, 2: 0 },
    positions = [[], [], []];
  let offset = 0;
  for (let index = 0; index < ids.length; ) {
    const kind = ids[index] === imageId ? 1 : ids[index] === videoId ? 2 : 0;
    let end = index + 1;
    while (end < ids.length && (ids[end] === imageId ? 1 : ids[end] === videoId ? 2 : 0) === kind) ++end;
    if (kind === 0) {
      for (let i = 0; i < end - index; ++i) for (const axis of positions) axis.push(offset + i);
      offset += end - index;
    } else {
      const [t, h, w] = grids[kind][indices[kind]++];
      assert(t * (h / merge) * (w / merge) === end - index, 'Visual grid mismatch');
      for (let z = 0; z < t; ++z)
        for (let y = 0; y < h / merge; ++y)
          for (let x = 0; x < w / merge; ++x) {
            positions[0].push(offset + z);
            positions[1].push(offset + y);
            positions[2].push(offset + x);
          }
      offset += Math.max(h, w) / merge;
    }
    index = end;
  }
  return positions;
}

export function answer(question, logits, temperature = 1) {
  assert(
    typeof temperature === 'number' && Number.isFinite(temperature) && temperature > 0,
    'temperature must be finite and positive'
  );
  assert(
    logits.length === question.keys.length && logits.every(Number.isFinite),
    'Expected one finite logit per candidate'
  );
  const maximum = Math.max(...logits),
    exps = logits.map((value) => Math.exp((value - maximum) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0),
    probs = exps.map((value) => value / sum);
  const mode = probs.indexOf(Math.max(...probs)),
    result = { type: question.type };
  if (question.type === 'noul') return { ...result, noul: probs[question.keys.indexOf('true')] };
  result.probabilities = Object.fromEntries(question.keys.map((key, i) => [key, probs[i]]));
  Object.defineProperty(result, '_orderedProbabilities', { value: probs });
  if (question.type === 'choice') {
    result.choice = question.keys[mode];
    result.confidence =
      probs.length === 1 ? 1 : Math.max(0, (probs[mode] - 1 / probs.length) / (1 - 1 / probs.length));
  } else {
    result.score = probs.reduce((total, p, i) => total + i * p, 0);
    result.legend = Object.fromEntries(question.keys.map((key, i) => [key, question.descriptions[i]]));
    const distance = probs.reduce((total, p, i) => total + p * Math.abs(i - mode), 0);
    const uniform =
      probs.reduce((total, _, i) => total + Math.abs(i - (probs.length - 1) / 2), 0) / probs.length;
    result.confidence = Math.max(0, 1 - distance / uniform);
  }
  return result;
}

export function toPublic(body, response) {
  return {
    ...response,
    answers: body.questions.map((question, index) => {
      const name = question.name ?? String(index),
        old = response.answers[name];
      const result = { name, type: question.type };
      if (question.type === 'predicate') result.probability = old.noul;
      else {
        const candidates = question.type === 'choice' ? question.choices : question.levels;
        // Use the compiler's explicit candidate order, including integer-like keys.
        const probs = old._orderedProbabilities ?? Object.values(old.probabilities);
        result.probabilities = candidates.map((candidate, i) =>
          question.type === 'choice'
            ? { value: candidate.value, probability: probs[i] }
            : { label: candidate.label, value: i, probability: probs[i] }
        );
        result.confidence = old.confidence;
        if (question.type === 'choice') result.choice = candidates[probs.indexOf(Math.max(...probs))].value;
        else result.score = old.score;
      }
      return result;
    }),
  };
}
