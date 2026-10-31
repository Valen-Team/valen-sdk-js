/** Verify the published tarball, without resolving imports from the source tree. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceTextModule, createContext } from 'node:vm';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'valen-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args, cwd) => execFileSync(command, args, {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe'], shell:process.platform === 'win32'});
try {
  const packed = JSON.parse(run(npm, ['pack','--json','--pack-destination',temporary], root));
  writeFileSync(join(temporary,'package.json'), JSON.stringify({private:true,type:'module'}));
  run(npm, ['install','--ignore-scripts','--omit=optional','--no-audit','--no-fund', ...(process.env.VALEN_PACKAGE_OFFLINE ? ['--offline'] : []), join(temporary,packed[0].filename)], temporary);
  const installed = join(temporary,'node_modules/@valen-team/sdk');
  const fixture = JSON.parse(readFileSync(join(installed,'contracts/v1.json')));
  assert.equal(fixture.contract, 'valen-sdk-contract-1');
  writeFileSync(join(temporary,'smoke.mjs'), `
import assert from 'node:assert/strict';
import { Valen, predicate, ValenResponseError } from '@valen-team/sdk';
const client = Valen.remote('https://example.test/v1', { fetch:async () => new Response(JSON.stringify({ model:'installed', answers:{flag:{type:'noul',noul:.8}}, usage:{} })) });
assert.equal((await client.systemOne('x',{flag:predicate('Flag?')})).answers.flag.noul,.8);
await client.close();
assert.equal(typeof ValenResponseError, 'function');
`);
  run(process.execPath, ['smoke.mjs'], temporary);
  run(process.execPath, ['-e', "if(!require('@valen-team/sdk').Valen)process.exit(1)"], temporary);
  const typeTest = readFileSync(join(root,'test-d/types.ts'),'utf8').replaceAll("'../src/index.js'", "'@valen-team/sdk'");
  writeFileSync(join(temporary,'types.mts'), typeTest);
  run(process.execPath, [join(root,'node_modules/typescript/bin/tsc'), '--noEmit','--strict','--module','nodenext','--target','es2022','--lib','es2022,dom','types.mts'], temporary);
  // Browser-global check: no process, Buffer, require, or Node built-ins exist here.
  const context = createContext({Response, AbortController, AbortSignal, performance, console, setTimeout, clearTimeout});
  const modules = new Map();
  async function load(path) {
    if (modules.has(path)) return modules.get(path);
    const module = new SourceTextModule(readFileSync(path,'utf8'), {context, identifier:path});
    modules.set(path,module);
    await module.link((specifier, parent) => {
      assert.ok(specifier.startsWith('.'), `unexpected browser dependency: ${specifier}`);
      return load(resolve(dirname(parent.identifier),specifier));
    });
    return module;
  }
  const entry = await load(join(installed,'src/index.js'));
  await entry.evaluate();
  const browserClient = entry.namespace.Valen.remote('https://example.test/v1', {fetch:async (_,options) => {
    assert.ok(!('User-Agent' in options.headers));
    return new Response(JSON.stringify({model:'browser',answers:{flag:{type:'noul',noul:.8}},usage:{}}));
  }});
  assert.equal((await browserClient.systemOne('x',{flag:entry.namespace.predicate('Flag?')})).answers.flag.noul,.8);
  await browserClient.close();
  console.log('Installed tarball: ESM, CommonJS, strict TypeScript and browser-global HTTP checks passed.');
} finally { rmSync(temporary,{recursive:true,force:true}); }
