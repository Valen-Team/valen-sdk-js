import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const runtime = fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/', import.meta.url));
const target = fileURLToPath(new URL('./public/ort/', import.meta.url));
mkdirSync(target, { recursive: true });
cpSync(runtime, target, { recursive: true });
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
export default {
  server: { headers },
  preview: { headers },
  build: { rollupOptions: { external: ['onnxruntime-node', /^node:/] } },
};
