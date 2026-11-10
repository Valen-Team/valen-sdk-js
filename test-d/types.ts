// Compiled by `npm run typecheck`; never executed.
import { Valen, ValenAPIError, VERSION, bbox, choice, predicate, score } from '../src/index.js';

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
// @ts-expect-error unknown question names cannot be accessed
one.answers.missing;
// @ts-expect-error candidate names are retained
const impossible: 'technical' = one.answers.team.choice;
const billing: 'billing' = one.answers.team.choice;
score('How urgent?', ['Low', 'High']);

const decisions = await client.predict({ input: 'red', questions: [{ type: 'predicate', instructions: 'Red?' }] });
const first: number = decisions.answers.length;

const error = new ValenAPIError('failed', 503, 'id-1', { cause: new Error('upstream') });
const version: string = VERSION;

const dynamicQuestions: Record<string, import('../src/index.js').SystemOneQuestion> = {};
const dynamic = await client.systemOne('x', dynamicQuestions);
if (dynamic.answers.anything.type === 'score') dynamic.answers.anything.score;
const mixed = await client.systemOne('x', { q: choice('Which?', { red: 'Red', blue: 'Blue' }), s: score('Rate?', ['Low','High']) });
const label: 'red' | 'blue' = mixed.answers.q.choice;
const expectedScore: number = mixed.answers.s.score;
// @ts-expect-error scores do not have a choice
mixed.answers.s.choice;
await client.systemOne('x', new Map([['flag', predicate('Flag?')]]));

const typedDecisions = await client.decisions({ input: 'red', questions: [
  { name: 'flag', type: 'predicate', instructions: 'Flag?' },
  { name: 'color', type: 'choice', instructions: 'Colour?', choices: [{ value: true, description: 'Yes' }, { value: 'red', description: 'Red' }] },
] });
const p: number = typedDecisions.answers[0].probability;
const value: true | 'red' = typedDecisions.answers[1].choice;
// @ts-expect-error predicate answers have no choice
 typedDecisions.answers[0].choice;

const located = await client.decisions({ input: 'red', questions: [{ name: 'mug', type: 'bbox', instructions: 'The mug.', image: 0 }] });
const corners: [number, number, number, number] = located.answers[0].bbox;
// @ts-expect-error bbox answers have no probability
located.answers[0].probability;
const found = await client.systemOne('x', { mug: bbox('The mug.'), flag: predicate('Flag?') });
const centre: [number, number] = found.answers.mug.point;
