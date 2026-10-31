import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateResponse } from '../src/validation.js';
import { ValenResponseError } from '../src/errors.js';
import { answer } from '../src/compiler.js';
const contract = JSON.parse(readFileSync(new URL('../contracts/v1.json', import.meta.url)));
for (const c of contract.cases) test(`contract: ${c.name}`, () => {
  if (c.valid) {
    assert.equal(validateResponse(c.request, c.response), c.response);
    if (c.expected_answer_names) assert.deepEqual(c.response.answers.map(a => a.name), c.expected_answer_names);
  }
  else assert.throws(() => validateResponse(c.request, c.response), error => error instanceof ValenResponseError && error.code === 'invalid_response' && !error.retryable && error.field.startsWith('answers'));
});
for (const c of contract.formula_cases) test(`formula: ${c.type}`, () => {
  const result = answer({ type: c.type, keys: c.keys, descriptions: c.descriptions }, c.logits);
  for (const [key, expected] of Object.entries(c.expected)) {
    if (typeof expected === 'number') assert.ok(Math.abs(result[key]-expected) < 1e-8);
    else if (typeof expected === 'object') for (const [label, p] of Object.entries(expected)) assert.ok(Math.abs(result[key][label]-p) < 1e-8);
    else assert.equal(result[key], expected);
  }
});
