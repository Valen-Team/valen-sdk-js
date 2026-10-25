import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {smartResize,sampleIndices,formatTimestamp} from '../src/geometry.js';
const fixtures=JSON.parse(await readFile(new URL('geometry-goldens.json',import.meta.url),'utf8'));
test('Qwen resize geometry matches upstream Python, including rounding ties',()=>{
 for(const f of fixtures.resize)assert.deepEqual(smartResize(f.height,f.width,f.factor,f.minimum,f.maximum,f.frames??null,f.temporal??2),f.expected,JSON.stringify(f));
});
test('video frame indices match upstream NumPy sampling',()=>{
 for(const f of fixtures.indices)assert.deepEqual(sampleIndices(f.total,f.fps,f.config),f.expected,JSON.stringify(f));
 assert.throws(()=>sampleIndices(10,2,{num_frames:2,fps:1}),/mutually exclusive/);
});
test('video timestamp text matches Python exact binary-float round-to-even',()=>{
 for(const f of fixtures.timestamps)assert.equal(formatTimestamp(f.value),f.expected,JSON.stringify(f));
});
