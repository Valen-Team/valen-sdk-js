import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Valen, ValenInputError, ValenResponseError, bbox } from '../src/index.js';
import { box, toInternal, toPublic } from '../src/compiler.js';
import { validateRequest, validateResponse } from '../src/validation.js';
import { LocalBackend } from '../src/local.js';

const ANSWER = { bbox: [0.25, 0.3, 0.8, 0.9], point: [0.525, 0.6], confidence: 0.9 };
const USAGE = { input_tokens: 10, output_tokens: 0 };

test('decisions protocol round trip', () => {
  const body = { input: 'Test', questions: [
    { name: 'mug', type: 'bbox', instructions: 'The mug.', image: 1 },
    { name: 'cup', type: 'bbox', instructions: 'The cup.' },
    { name: 'full', type: 'predicate', instructions: 'Full?' }] };
  assert.deepEqual(Object.fromEntries(toInternal(body).questions), {
    mug: { type: 'bbox', instructions: 'The mug.', image: 1 },
    cup: { type: 'bbox', instructions: 'The cup.', image: 0 },
    full: { type: 'noul', instructions: 'Full?' } });
  const response = { model: 'Valen', usage: USAGE, answers: {
    mug: { type: 'bbox', ...ANSWER }, cup: { type: 'bbox', ...ANSWER }, full: { type: 'noul', noul: 0.8 } } };
  const result = toPublic(body, response);
  assert.deepEqual(result.answers, [{ name: 'mug', type: 'bbox', ...ANSWER }, { name: 'cup', type: 'bbox', ...ANSWER },
    { name: 'full', type: 'predicate', probability: 0.8 }]);
  assert.equal(validateResponse(body, result), result);
});

test('invalid image index', () => {
  for (const image of [-1, 1.5, true, '0']) {
    const question = { type: 'bbox', instructions: 'The mug.', image };
    assert.throws(() => toInternal({ input: 'Test', questions: [question] }), /image/);
    for (const body of [{ input: 'Test', questions: [question] }, { state: 'Test', questions: { mug: question } }])
      assert.throws(() => validateRequest(body), (error) => error instanceof ValenInputError && error.field.endsWith('.image'));
  }
});

test('response validation', () => {
  const request = { input: 'Test', questions: [{ name: 'mug', type: 'bbox', instructions: 'The mug.' }] };
  const internal = { state: 'Test', questions: { mug: bbox('The mug.') } };
  assert.deepEqual(internal.questions.mug, { type: 'bbox', instructions: 'The mug.', image: 0 });
  validateRequest(request);
  validateRequest(internal);
  const good = { type: 'bbox', ...ANSWER };
  validateResponse(request, { model: 'Valen', usage: USAGE, answers: [{ name: 'mug', ...good }] });
  validateResponse(internal, { model: 'Valen', usage: USAGE, answers: { mug: good } });
  for (const change of [{ bbox: [0.1, 0.2, 0.3] }, { bbox: [0.1, 0.2, 0.3, 1.5] }, { point: [0.5] }, { point: null },
    { confidence: 2 }, { bbox: [0.1, 0.2, 0.3, NaN] }]) {
    const bad = { ...good, ...change };
    for (const [body, answers] of [[request, [{ name: 'mug', ...bad }]], [internal, { mug: bad }]])
      assert.throws(() => validateResponse(body, { model: 'Valen', usage: USAGE, answers }),
        (error) => error instanceof ValenResponseError && error.field === 'answers.mug.' + Object.keys(change)[0]);
  }
});

test('remote passes bbox through', async () => {
  const requests = [];
  const client = Valen.remote('https://example.test/v1', { fetch: async (url, options) => {
    requests.push(JSON.parse(options.body));
    const answer = { type: 'bbox', ...ANSWER };
    return new Response(JSON.stringify({ model: 'Valen', usage: USAGE,
      answers: url.endsWith('decisions') ? [{ name: 'mug', ...answer }] : { mug: answer } }));
  } });
  const decisions = await client.decisions({ input: 'Test', questions: [{ name: 'mug', type: 'bbox', instructions: 'The mug.' }] });
  assert.deepEqual(decisions.answers[0], { name: 'mug', type: 'bbox', ...ANSWER });
  const one = await client.systemOne('Test', { mug: bbox('The mug.', 1) });
  assert.equal(one.answers.mug.confidence, 0.9);
  assert.deepEqual(requests[1].questions.mug, { type: 'bbox', instructions: 'The mug.', image: 1 });
});

test('decode by hand', () => {
  // 2 x 2 grid; token 3 (bottom right, centre 0.75, 0.75) wins.
  // x1 = 0.75 - 1.2 / 2, y1 = 0.75 - 0.6 / 2, x2 = min(0.75 + 0.9 / 2, 1), y2 = min(0.75 + 0.5 / 2, 1);
  // centres inside: tokens 2 (0.25, 0.75) and 3, with probabilities 1/8 and 5/8.
  assert.deepEqual(box([0, 0, 0, Math.log(5)], [...Array(12).fill(0.5), 1.2, 0.6, 0.9, 0.5], [2, 2]),
    { type: 'bbox', bbox: [0.15, 0.45, 1, 1], point: [0.575, 0.725], confidence: 0.75 });
  // A box that contains no centre reports the winning token's probability.
  const result = box([0, 0, 0, 0, Math.log(4)], [...Array(16).fill(0.6), ...Array(4).fill(0.5)], [1, 5]);
  assert.deepEqual([result.bbox, result.confidence], [[0.8, 0, 1, 1], 0.5]);
  assert.equal(box([1000, -1000], Array(8).fill(0.5), [1, 2]).confidence, 1);
});

test('decode matches valen_sdk.responses.box', () => {
  // 3 x 4 grids; logits, flattened distances and the answer of the Python SDK.
  const cases = [
    [[0.377, -0.396, 1.921, 0.315, -1.607, 1.085, 3.912, 2.841, -2.111, -3.796, -1.87, 0.124],
      [0.53, 1.042, 0.643, 0.788, 0.866, 0.984, 1.549, 2.254, 1.101, 2.671, 0.814, 1.491, 2.085, 1.266, 0.784, 0.724, 0.908, 1.372, 0.699, 1.049, 1.081, 1.679, 1.367, 1.495, 0.818, 1.101, 1.945, 2.841, 0.641, 2.869, 2.644, 1.942, 1.411, 0.985, 2.793, 3.492, 3.267, 2.603, 1.497, 0.651, 1.19, 1.802, 0.635, 1.533, 1.567, 1.846, 0.656, 0.815],
      { type: 'bbox', bbox: [0.4205, 0.133, 1, 1], point: [0.7103, 0.5665], confidence: 0.9338 }],
    [[-1.309, -3.509, 5.218, -1.488, 0.987, -0.776, 4.75, 3.961, 1.9, -6.611, 0.156, 2.051],
      [2.206, 0.833, 3.296, 0.629, 0.815, 2.122, 1.231, 3.552, 1.344, 0.827, 0.95, 0.678, 0.637, 1.774, 1.721, 2.576, 0.779, 3.11, 1.001, 2.952, 0.92, 0.787, 1.398, 2.24, 1.321, 0.847, 0.626, 0.615, 1.64, 2.189, 1.077, 0.682, 2.049, 0.637, 0.795, 1.764, 0.534, 1.524, 0.849, 1.278, 1.138, 1.356, 1.844, 0.778, 2.744, 1.879, 2.014, 2.408],
      { type: 'bbox', bbox: [0.289, 0, 0.8625, 0.3927], point: [0.5757, 0.1963], confidence: 0.4963 }],
    [[2.363, 2.532, 0.227, -4.28, -0.405, -2.309, -4.268, 0.775, -1.706, -3.089, -3.129, 0.805],
      [1.498, 2.613, 1.183, 2.253, 2.719, 2.389, 0.528, 2.49, 1.48, 1.561, 1.51, 1.521, 1.461, 0.96, 0.556, 1.115, 0.762, 2.301, 1, 1.258, 0.747, 0.882, 1.185, 0.602, 1.444, 1.117, 0.656, 0.527, 1.65, 0.995, 0.873, 1.032, 3.288, 1.156, 1.26, 0.602, 3.052, 2.101, 2.284, 1.23, 2.1, 1.51, 1.755, 1.086, 0.604, 2.237, 0.553, 1.029],
      { type: 'bbox', bbox: [0, 0, 0.507, 0.9967], point: [0.2535, 0.4984], confidence: 0.8084 }],
    [[-0.614, -3.129, 1.839, -0.601, -1.311, 1.56, -1.43, 4.167, 1.054, -1.423, -5.833, -3.923],
      [2.309, 1.156, 1.003, 3.046, 0.636, 0.847, 0.9, 1.727, 0.815, 0.835, 0.586, 1.883, 1.97, 0.898, 1.323, 0.634, 0.901, 2.686, 1.3, 3.996, 0.768, 1.72, 1.057, 1.705, 1.188, 0.858, 0.741, 5.109, 1.137, 0.547, 0.821, 1.826, 0.887, 2.663, 2.204, 1.085, 0.9, 0.7, 0.8, 0.604, 2.459, 2.974, 0.641, 0.657, 0.568, 0.712, 0.509, 0.666],
      { type: 'bbox', bbox: [0.5907, 0.3177, 1, 1], point: [0.7954, 0.6588], confidence: 0.8063 }],
  ];
  for (const [logits, distances, expected] of cases) assert.deepEqual(box(logits, distances, [3, 4]), expected);
});

// A backend over fake graphs: 6 tokens of hidden size 2, where final_hidden row i is [i, 10 + i].
function fake(outputNames, graphs = { embedding: 1, decision: 1, grounding: 1 }) {
  const backend = new LocalBackend(), calls = {};
  backend.config = { text_config: { hidden_size: 2 }, image_token_id: 8, video_token_id: 9, valen_full_attention_mask: 'bbox_blocks' };
  backend.variant = { graphs, io_schema: { decision: { inputs: [] } } };
  backend.ort = { Tensor: class { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } } };
  const session = (name, inputNames, outputNames, run) => [name, { inputNames, outputNames,
    run: async (feeds, outputs) => { calls[name] = { feeds, outputs }; return run(feeds); } }];
  backend.sessions = new Map([
    session('embedding', ['input_ids'], ['inputs_embeds'], () => ({ inputs_embeds: { type: 'float32', data: new Float32Array(12) } })),
    session('decision', ['inputs_embeds', 'position_ids', 'role_spans', 'block_mask'], outputNames, (feeds) => ({
      logits: { data: Float32Array.from({ length: feeds.role_spans.dims[0] }, (_, i) => i) },
      final_hidden: { data: Float32Array.from({ length: 12 }, (_, i) => (i % 2 ? 10 : 0) + (i >> 1)) } })),
    session('grounding', ['decision', 'tokens'], ['logits', 'distances'], () => ({
      logits: { data: Float32Array.of(0, Math.log(3)) }, distances: { data: new Float32Array(8).fill(0.5) } })),
  ].filter(([name]) => graphs[name]));
  return { backend, calls };
}
const inputs = { ids: [1, 1, 1, 1, 1, 1], media: { images: [], videos: [] }, positions: [[], [], []] };
const shared = { context_span: [0, 3], segments: [-1, -1, -1, 1, 2, 2], bbox_segments: [1] };
const located = { ...shared, candidate_spans: [], decision_position: 4, image_positions: [2, 0], image_grid: [1, 2] };
const decided = { ...shared, instruction_span: [3, 4], candidate_spans: [[3, 4], [4, 5]], decision_position: 5 };

test('run feeds the grounding graph the decision row and the image rows of final_hidden', async () => {
  const { backend, calls } = fake(['logits', 'final_hidden']);
  const answer = { type: 'bbox', bbox: [0.5, 0, 1, 1], point: [0.75, 0.5], confidence: 0.75 };
  assert.deepEqual(await backend.run(inputs, [located, decided]), [answer, [0, 1]]);
  assert.deepEqual(calls.decision.outputs, ['logits', 'final_hidden']);
  assert.deepEqual(Array.from(calls.decision.feeds.role_spans.data, Number), [0, 3, 3, 4, 3, 4, 5, 6, 0, 3, 3, 4, 4, 5, 5, 6]);
  assert.deepEqual([calls.grounding.feeds.decision.dims, Array.from(calls.grounding.feeds.decision.data)], [[2], [4, 14]]);
  assert.deepEqual([calls.grounding.feeds.tokens.dims, Array.from(calls.grounding.feeds.tokens.data)], [[2, 2], [2, 12, 0, 10]]);
  // Only bbox questions: one dummy row keeps the decision graph running and its logit is ignored.
  assert.deepEqual(await backend.run(inputs, [located]), [answer]);
  assert.deepEqual(Array.from(calls.decision.feeds.role_spans.data, Number), [0, 3, 0, 3, 0, 3, 0, 3]);
  // Without bbox questions the hidden states are not requested.
  await backend.run(inputs, [decided]);
  assert.deepEqual(calls.decision.outputs, ['logits']);
});

test('bundles without final_hidden or a grounding graph reject bbox questions', async () => {
  await assert.rejects(fake(['logits']).backend.run(inputs, [located]), /This model does not answer bbox questions/);
  const { backend } = fake(['logits', 'final_hidden'], { embedding: 1, decision: 1 });
  await assert.rejects(backend.run(inputs, [located]), /Missing ONNX graph: grounding/);
  assert.deepEqual(await backend.run(inputs, [decided]), [[0, 1]]);
});
