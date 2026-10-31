import test from 'node:test';
import assert from 'node:assert/strict';
import { Valen, ValenTimeoutError, ValenResponseError, predicate } from '../src/index.js';
const questions = { flag: predicate('Flag?') };
const result = () => ({ model:'test', answers:{ flag:{ type:'noul', noul:.8 } }, usage:{} });

test('deadline covers retry-after waits and controls never enter the body', async () => {
  let calls = 0;
  const events = [];
  const client = Valen.remote('https://example.test/v1', { totalTimeout:30, onEvent: e => events.push(e), fetch:async (_, options) => {
    calls++;
    assert.deepEqual(Object.keys(JSON.parse(options.body)), ['state','questions']);
    return new Response('{}', { status:429, headers:{'retry-after':'60'} });
  }});
  // Timeout signals do not keep the process alive; this timer stands for the caller's event loop.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(client.systemOne('private', questions, { timeout:500 }), ValenTimeoutError);
    assert.equal(calls, 1);
    assert.equal(events.at(-1).code, 'timeout');
    assert.ok(!JSON.stringify(events).includes('private'));
  } finally { clearTimeout(keepAlive); }
});

test('response validation rejects incomplete answers once and reports the field', async () => {
  let calls = 0;
  const client = Valen.remote('https://example.test/v1', { fetch:async () => {
    calls++; return new Response(JSON.stringify({...result(), answers:{}}));
  }});
  await assert.rejects(client.systemOne('x', questions), e => e instanceof ValenResponseError && e.field === 'answers' && !e.retryable);
  assert.equal(calls, 1);
});

test('events cannot break a request; closing is idempotent', async () => {
  let closed = 0;
  const client = new Valen({ predict:async () => result(), close:async () => { closed++; } });
  assert.equal((await client.systemOne('x', questions)).answers.flag.noul, .8);
  await client.close(); await client.close();
  assert.equal(closed, 1);
  await assert.rejects(client.systemOne('x', questions), /closed/);
});

test('cancel during active request propagates unchanged and is not retried', async () => {
  let calls = 0;
  const client = Valen.remote('https://example.test/v1', { fetch:async (_, {signal}) => {
    calls++;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once:true}));
  }});
  const controller = new AbortController();
  const pending = client.systemOne('x', questions, { signal:controller.signal, totalTimeout:1000 });
  const reason = new Error('caller stopped');
  controller.abort(reason);
  await assert.rejects(pending, e => e === reason);
  assert.equal(calls, 1);
});

test('bad questions fail before fetch and response errors preserve request ID', async () => {
  let calls = 0;
  const client = Valen.remote('https://example.test/v1', { fetch:async () => {
    calls++; return new Response(JSON.stringify({...result(), answers:{}}), {headers:{'x-request-id':'req-9'}});
  }});
  await assert.rejects(client.decisions({input:'x', questions:[
    {name:'same',type:'predicate',instructions:'X?'}, {name:'same',type:'predicate',instructions:'Y?'},
  ]}), e => e.code === 'invalid_input');
  assert.equal(calls, 0);
  await assert.rejects(client.systemOne('x', questions), e => e.requestId === 'req-9' && e.statusCode === 200);
});
