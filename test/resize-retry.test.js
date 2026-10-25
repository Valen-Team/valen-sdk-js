import test from 'node:test';
import assert from 'node:assert/strict';
import {withConsistentResize} from '../src/resizing.js';
class RGB {constructor(data,width,height){this.data=data;this.width=width;this.height=height;}rgb(){return this;}}
test('a failed optional WASM path can be corrected without restarting the process',async()=>{
 const data=new Uint8ClampedArray([13,29,101]);
 await assert.rejects(()=>withConsistentResize(new RGB(data,1,1),RGB,{pillowWasmUrl:'/missing-valen-pillow-fixture.wasm'}).resize(2,2),/ENOENT/);
 const actual=await withConsistentResize(new RGB(data,1,1),RGB).resize(2,2);assert.deepEqual([...actual.data],[...data,...data,...data,...data]);
});
