import { ValenResponseError, ValenInputError } from './errors.js';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = value => `${typeof value}:${String(value)}`;
export const responseMetadata = new WeakMap();
export function validateResponse(request, response) {
  const fail = (field, message) => { throw new ValenResponseError(`${field}: ${message}`, { ...responseMetadata.get(response), field, model: response?.model }); };
  const number = (value, field, low, high) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(field, 'expected a finite number');
    if (value < low || value > high) fail(field, 'number is out of range');
  };
  if (!object(response)) fail('response', 'expected an object');
  if (typeof response.model !== 'string' || !response.model) fail('model', 'expected a nonempty model identifier');
  if (!object(response.usage)) fail('usage', 'expected an object');
  for (const key of ['input_tokens', 'output_tokens']) {
    const value = response.usage[key];
    if (value != null && (!Number.isInteger(value) || value < 0)) fail(`usage.${key}`, 'expected a nonnegative integer or null');
  }
  response.usage = { ...response.usage, input_tokens: response.usage.input_tokens ?? null, output_tokens: response.usage.output_tokens ?? null };
  const publicProtocol = 'input' in request;
  const questions = request.questions instanceof Map ? Object.fromEntries(request.questions) : request.questions;
  const expected = publicProtocol ? new Map(questions.map((q, i) => [q.name ?? String(i), q])) : new Map(Object.entries(questions));
  let actual;
  if (publicProtocol) {
    if (!Array.isArray(response.answers)) fail('answers', 'expected a list');
    actual = new Map();
    for (const a of response.answers) {
      if (!object(a) || typeof a.name !== 'string') fail('answers', 'expected named answer objects');
      if (actual.has(a.name)) fail(`answers.${a.name}`, 'duplicate answer');
      actual.set(a.name, a);
    }
  } else {
    if (!object(response.answers)) fail('answers', 'expected an object');
    actual = new Map(Object.entries(response.answers));
  }
  if (actual.size !== expected.size || [...expected.keys()].some(k => !actual.has(k))) fail('answers', 'question names differ from the request');
  if (publicProtocol) response.answers = [...expected.keys()].map(name => actual.get(name));
  for (const [name, q] of expected) {
    const a = actual.get(name), path = `answers.${name}`;
    if (!object(a) || a.type !== q.type) fail(`${path}.type`, `expected ${q.type}`);
    if (['noul', 'predicate'].includes(q.type)) {
      const key = publicProtocol ? 'probability' : 'noul';
      number(a[key], `${path}.${key}`, 0, 1);
      continue;
    }
    const keys = publicProtocol ? (q.type === 'choice' ? q.choices.map(c => c.value) : q.levels.map(c => c.label)) :
      q.type === 'choice' ? (q.criteria instanceof Map ? [...q.criteria.keys()] : Object.keys(q.criteria)) : q.criteria.map((_, i) => String(i));
    const p = a.probabilities;
    if (publicProtocol ? !Array.isArray(p) : !object(p)) fail(`${path}.probabilities`, 'invalid probability distribution');
    const labels = publicProtocol ? p.map(v => v?.[q.type === 'choice' ? 'value' : 'label']) : Object.keys(p);
    const values = publicProtocol ? p.map(v => v?.probability) : Object.values(p);
    if (labels.length !== keys.length || JSON.stringify(labels.map(identity).sort()) !== JSON.stringify(keys.map(identity).sort()))
      fail(`${path}.probabilities`, 'candidate labels differ from the request');
    values.forEach(v => number(v, `${path}.probabilities`, 0, 1));
    if (Math.abs(values.reduce((a, b) => a+b, 0)-1) > 1e-5) fail(`${path}.probabilities`, 'probabilities must sum to 1');
    number(a.confidence, `${path}.confidence`, 0, 1);
    if (q.type === 'choice') {
      if (!keys.some(k => identity(k) === identity(a.choice))) fail(`${path}.choice`, 'unknown candidate');
    } else number(a.score, `${path}.score`, 0, keys.length-1);
  }
  return response;
}

/** Structural validation without hard-coding hosted/local candidate limits. */
export function validateRequest(request) {
  const fail = (field, message) => { throw new ValenInputError(`${field}: ${message}`, field); };
  if (!object(request)) fail('request', 'expected an object');
  const publicProtocol = 'input' in request;
  if (publicProtocol ? !(typeof request.input === 'string' || Array.isArray(request.input)) : !(typeof request.state === 'string' || object(request.state)))
    fail(publicProtocol ? 'input' : 'state', 'invalid evidence container');
  const questions = request.questions instanceof Map ? Object.fromEntries(request.questions) : request.questions;
  if (publicProtocol ? !Array.isArray(questions) : !object(questions)) fail('questions', 'invalid questions container');
  const entries = publicProtocol ? questions.map((q, i) => {
    if (!object(q)) fail(`questions.${i}`, 'expected an object');
    return [q.name ?? String(i), q];
  }) : Object.entries(questions);
  const names = new Set();
  for (const [name, q] of entries) {
    const path = `questions.${name}`;
    if (typeof name !== 'string' || !name || names.has(name)) fail('questions', 'question names must be unique nonempty strings');
    names.add(name);
    if (!object(q) || typeof q.instructions !== 'string' || !q.instructions.trim()) fail(path, 'expected nonempty instructions');
    if (q.type === (publicProtocol ? 'predicate' : 'noul')) continue;
    if (!['choice','score'].includes(q.type)) fail(`${path}.type`, 'unsupported question type; use raw predict for extensions');
    let labels, descriptions;
    if (publicProtocol) {
      const candidates = q[q.type === 'choice' ? 'choices' : 'levels'];
      if (!Array.isArray(candidates) || !candidates.length || candidates.some(c => !object(c))) fail(path, 'expected candidate objects');
      labels = candidates.map(c => c[q.type === 'choice' ? 'value' : 'label']);
      descriptions = candidates.map(c => c.description);
    } else if (q.type === 'choice') {
      if (!(q.criteria instanceof Map) && !object(q.criteria)) fail(path, 'expected named candidates');
      const entries = q.criteria instanceof Map ? [...q.criteria] : Object.entries(q.criteria);
      labels = entries.map(([key]) => key); descriptions = entries.map(([,value]) => value);
    } else {
      if (!Array.isArray(q.criteria)) fail(path, 'expected ordered descriptions');
      labels = q.criteria.map((_,i) => String(i)); descriptions = q.criteria;
    }
    if (!labels.length || (q.type === 'score' && labels.length < 2)) fail(path, 'not enough candidates');
    if (labels.some(label => !(typeof label === 'string' && label.length || publicProtocol && q.type === 'choice' && typeof label === 'boolean')))
      fail(path, 'invalid candidate labels');
    if (new Set(labels.map(identity)).size !== labels.length) fail(path, 'duplicate candidate labels');
    if (descriptions.some(d => typeof d !== 'string' || !d.trim())) fail(path, 'candidate descriptions must be nonempty text');
  }
}
