import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,chmod,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {Assets} from '../src/assets.js';
const digest=b=>createHash('sha256').update(b).digest('hex');
test('offline local assets verify hashes and never write to read-only directories',async()=>{
 const root=await mkdtemp(join(tmpdir(),'valen-assets-'));
 try{
  await writeFile(join(root,'config.json'),'{"model":"Valen"}');await chmod(root,0o555);
  await assert.rejects(()=>Assets.create(join(root,'missing'),{}),/Local model directory does not exist/);
  const assets=await Assets.create(root,{localFilesOnly:true,verify:true});assets.setVariant({sha256:{'config.json':digest('{"model":"Valen"}')}});
  assert.deepEqual(await assets.json('config.json'),{model:'Valen'});await assert.rejects(()=>assets.file('missing.data'),/Missing local asset/);
  assets.setVariant({sha256:{'config.json':'0'.repeat(64)}});await assert.rejects(()=>assets.file('config.json'),/Checksum mismatch/);
  for(const path of ['../weights','/weights','a/../b','a\\b','a//b','a\0b'])assert.throws(()=>assets.check(path),/Invalid asset path/);
 }finally{await chmod(root,0o755);await rm(root,{recursive:true,force:true});}
});
test('download cache is selective, works offline, and never retains corrupt downloads',async()=>{
 const root=await mkdtemp(join(tmpdir(),'valen-download-')),requests=[];
 const server=createServer((req,res)=>{requests.push(req.url);if(req.url==='/weights.data'){res.end('weights');}else{res.statusCode=404;res.end('missing');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const assets=await Assets.create(base,{cacheDir:root,verify:true,revision:'fixed'});assets.setVariant({sha256:{'weights.data':digest('weights')}});
  assert.equal(await readFile(await assets.file('weights.data'),'utf8'),'weights');assert.deepEqual(requests,['/weights.data']);
  const offline=await Assets.create(base,{cacheDir:root,localFilesOnly:true,revision:'fixed'});assert.equal(await readFile(await offline.file('weights.data'),'utf8'),'weights');await assert.rejects(()=>offline.file('vision.data'),/Missing local asset/);assert.equal(requests.length,1);
  const bad=await Assets.create(base,{cacheDir:root,verify:true,revision:'other'});bad.setVariant({sha256:{'weights.data':'f'.repeat(64)}});await assert.rejects(()=>bad.file('weights.data'),/Checksum mismatch/);assert.deepEqual(await readdir(bad.root),[]);
  const revision=await Assets.create(base,{cacheDir:root,revision:'new',localFilesOnly:true});await assert.rejects(()=>revision.file('weights.data'),/Missing local asset/);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
