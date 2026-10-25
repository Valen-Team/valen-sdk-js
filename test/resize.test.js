import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withConsistentResize} from '../src/resizing.js';
class RGBImage {
 constructor(data,width,height){this.data=data;this.width=width;this.height=height;}
 rgb(){return this;}
}
const fixtures=JSON.parse(await readFile(new URL('./resize-goldens.json',import.meta.url),'utf8'));
test('bundled Pillow WASM matches native Pillow bytes across all six filters',async()=>{
 for(const row of fixtures.records){
  const source=new Uint8ClampedArray(Buffer.from(row.source_base64,'base64')),expected=Buffer.from(row.expected_base64,'base64');
  const image=withConsistentResize(new RGBImage(source,row.width,row.height),RGBImage),actual=await image.resize(row.out_width,row.out_height,{resample:row.resample});
  assert.deepEqual(Buffer.from(actual.data),expected,JSON.stringify({resample:row.resample,width:row.width,height:row.height}));
 }
});
