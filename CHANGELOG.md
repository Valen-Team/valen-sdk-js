# 0.3.0 — 2026-10-31

- Browser video decoding now uses the optional `mediabunny` peer (`npm install mediabunny@1.62.1`). HTTP-only installs have no runtime dependencies and avoid unrelated WebCodecs global type conflicts.

- Validate typed answers against request names, kinds, candidates and finite probability distributions. Raw `predict` remains available. Malformed responses previously accepted now fail explicitly.
- Add total request budgets, Retry-After with jitter, stable timeout/response errors and metadata-only event hooks.
- Add local loading stages, runtime information and representative-request warmup; document concurrency and ownership.
- Add versioned cross-language protocol/formula fixtures and installed-package smoke tests.
- Infer SystemOne question names, answer kinds and Choice literals; infer Decisions tuple answer kinds and candidate values.
- Remove abort listeners after retry waits, preserve cancellation reasons and make public close idempotent.

# Changelog

## 0.2.1 — 2026-10-30

- HTTP error responses throw `ValenAPIError`: a non-JSON error page (such as a gateway's HTML 502) keeps its status code, request ID and text, and network failures keep their `cause`.
- A self-hosted server's `{"error": {"message": ...}}` becomes the error message, and the hosted APIs' `x-llm-proxy-request-id` fills `requestId`.
- Requests take `signal` and `timeout` options to cancel one request or set its own timeout; a cancelled request rejects with the signal's reason at once, including during the wait between retries, and is not retried. Passing `signal` uses `AbortSignal.any`; requests without one work as before.
- Node sends `User-Agent: valen-sdk-js/<version>`; `VERSION` is exported.
- CommonJS can `require('@valen-team/sdk')`. Node.js 22.12+ is required.
- System One answers are typed by `type` (`NoulAnswer`, `SystemOneChoiceAnswer`, `SystemOneScoreAnswer`, with `legend` on scores), and `predict` returns `DecisionResponse` or `SystemOneResponse` for those request shapes.
- Releases publish from the `npm-v*` tag through GitHub Actions with npm provenance.

## 0.2.0 — 2026-10-26

The npm package uses `@valen-team/sdk`: the original `@valen` scope was unavailable. The existing GitHub `v0.2.0` tag is preserved; `npm-v0.2.0` records the scope migration. Update imports and dependency names to `@valen-team/sdk`. Inference source and dependency versions are unchanged.

First stable GitHub release of the modular ONNX and HTTP SDK. Promotes the 0.2.0 development API without a request/response schema change. Supports Decisions and SystemOne, local asset integrity/offline caching, and text/image/video preprocessing. Local real-model evidence is recorded separately from contract tests.

Compatibility: Python HTTP requires 3.10+; local ONNX requires 3.11+ and ONNX Runtime 1.31+. JavaScript requires Node.js 20+; the measured Node backend uses ONNX Runtime 1.30.0; browser inference uses the explicitly pinned development WebGPU runtime. Stable SDK version does not make this browser dependency stable. ONNX format_version=2, contract_version=valen-decisions-1. GGUF is served through HTTP, not Valen.local. See README for optional dependencies and backend-specific scope.

Published on npm as `@valen-team/sdk@0.2.0`, with `latest` set to `0.2.0`. Registry SRI/SHA1 match the reviewed tarball. The package passed 12 contract tests, TypeScript checks and import resolution under the new name. No model or dependency download was needed for the scope migration. See `validation/npm-0.2.0.json`.
