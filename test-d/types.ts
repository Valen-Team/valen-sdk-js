// Compiled by `npm run typecheck`; never executed.
import { Valen, ValenAPIError, VERSION, choice, predicate, score } from '../src/index.js';

const client = Valen.remote('https://example.test/v1', { model: 'valen-2b' });
const controller = new AbortController();

const one = await client.systemOne(
  'I was charged twice.',
  { billing: predicate('Is this a billing problem?'), team: choice('Which team?', { billing: 'Payments' }) },
  { signal: controller.signal, timeout: 5000 }
);
const answer = one.answers.billing;
if (answer.type === 'noul') {
  const probability: number = answer.noul;
  // @ts-expect-error a noul answer has no choice
  answer.choice;
}
if (answer.type === 'score') {
  const levels: Record<string, string> = answer.legend;
}
score('How urgent?', ['Low', 'High']);

const decisions = await client.predict({ input: 'red', questions: [{ type: 'predicate', instructions: 'Red?' }] });
const first: number = decisions.answers.length;

const error = new ValenAPIError('failed', 503, 'id-1', { cause: new Error('upstream') });
const version: string = VERSION;
