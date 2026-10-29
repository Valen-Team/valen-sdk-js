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

test("non-JSON error pages and unreachable services become ValenAPIError with a cause", async () => {
  const gateway = Valen.remote("https://example.test/v1", { maxRetries: 0, fetch: async () =>
    new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "x-request-id": "id-2" } }) });
  await assert.rejects(gateway.systemOne("red", {}), error => error instanceof ValenAPIError && error.statusCode === 502
    && error.requestId === "id-2" && error.message.includes("Bad Gateway") && error.cause instanceof SyntaxError);
  const down = Valen.remote("https://example.test/v1", { maxRetries: 0, fetch: async () => { throw new TypeError("connection refused"); } });
  await assert.rejects(down.systemOne("red", {}), error => error instanceof ValenAPIError && error.cause.message === "connection refused");
});

test("per-request signal and timeout stay out of the body, and an abort is not retried", async () => {
  const requests = [];
  const client = Valen.remote("https://example.test/v1", { fetch: async (url, options) => {
    requests.push(options);
    if (options.signal.aborted) throw options.signal.reason;
    return new Response(JSON.stringify({ answers: {} }));
  }});
  await client.systemOne("red", {}, { timeout: 5000, temperature: .5 });
  assert.deepEqual(JSON.parse(requests[0].body), { state: "red", questions: {}, temperature: .5 });
  assert.match(requests[0].headers["User-Agent"], /^valen-sdk-js\/\d/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.systemOne("red", {}, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(requests.length, 2);
});

test("CommonJS can require the package and VERSION matches package.json", async () => {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const output = execFileSync(process.execPath, ["-e", "process.stdout.write(require('@valen-team/sdk').VERSION)"]);
  assert.equal(output.toString(), JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version);
});

test("requests without a signal do not need AbortSignal.any", async () => {
  const any = AbortSignal.any;
  AbortSignal.any = undefined;
  try {
    const client = Valen.remote("https://example.test/v1", { fetch: async () => new Response(JSON.stringify({ answers: {} })) });
    assert.deepEqual((await client.systemOne("red", {})).answers, {});
  } finally {
    AbortSignal.any = any;
  }
});
