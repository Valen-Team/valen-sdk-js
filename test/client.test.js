import { test } from "node:test";
import assert from "node:assert/strict";
import { Valen, ValenAPIError, predicate } from "../src/index.js";

test("HTTP authentication, endpoint, typed request and close", async () => {
  const requests = [];
  const client = Valen.remote("https://example.test/v1", { apiKey: "test", model: "Valen", fetch: async (url, options) => {
    requests.push([url, options]);
    return new Response(JSON.stringify({ model: "Valen", answers: { red: { type: "noul", noul: .8 } }, usage: { input_tokens: 10, output_tokens: 0 } }));
  }});
  const result = await client.systemOne("red", { red: predicate("Red?") });
  assert.equal(result.answers.red.noul, .8);
  assert.equal(requests[0][0], "https://example.test/v1/systemone");
  assert.equal(requests[0][1].headers.Authorization, "Bearer test");
  assert.deepEqual(JSON.parse(requests[0][1].body).questions.red, { type: "noul", instructions: "Red?" });
  await client.close();
  await assert.rejects(client.systemOne("red", {}), /closed/);
});

test("HTTP authentication failure is not retried", async () => {
  let calls = 0;
  const client = Valen.remote("https://example.test/v1", { fetch: async () => {
    ++calls; return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "x-request-id": "id-1" } });
  }});
  await assert.rejects(client.systemOne("red", {}), error => error instanceof ValenAPIError && error.statusCode === 401 && error.requestId === "id-1");
  assert.equal(calls, 1);
});

test("retryable service failure recovers", async () => {
  let calls = 0;
  const client = Valen.remote("https://example.test/v1", { fetch: async () => {
    if (++calls === 1) return new Response("{}", { status: 503 });
    return new Response(JSON.stringify({ answers: [] }));
  }});
  assert.deepEqual(await client.decisions({ input: "red", questions: [] }), { answers: [] });
  assert.equal(calls, 2);
});
