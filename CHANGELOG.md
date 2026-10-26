# Changelog

## 0.2.0 — 2026-10-26

The npm package uses `@valen-team/sdk`: the original `@valen` scope was unavailable. The existing GitHub `v0.2.0` tag is preserved; `npm-v0.2.0` records the scope migration. Update imports and dependency names to `@valen-team/sdk`. Inference source and dependency versions are unchanged.

First stable GitHub release of the modular ONNX and HTTP SDK. Promotes the 0.2.0 development API without a request/response schema change. Supports Decisions and SystemOne, local asset integrity/offline caching, and text/image/video preprocessing. Local real-model evidence is recorded separately from contract tests.

Compatibility: Python HTTP requires 3.10+; local ONNX requires 3.11+ and ONNX Runtime 1.31+. JavaScript requires Node.js 20+; the measured Node backend uses ONNX Runtime 1.30.0; browser inference uses the explicitly pinned development WebGPU runtime. Stable SDK version does not make this browser dependency stable. ONNX format_version=2, contract_version=valen-decisions-1. GGUF is served through HTTP, not Valen.local. See README for optional dependencies and backend-specific scope.

Published on npm as `@valen-team/sdk@0.2.0`, with `latest` set to `0.2.0`. Registry SRI/SHA1 match the reviewed tarball. The package passed 12 contract tests, TypeScript checks and import resolution under the new name. No model or dependency download was needed for the scope migration. See `validation/npm-0.2.0.json`.
