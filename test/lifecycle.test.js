import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalBackend} from '../src/local.js';
test('closing drains admitted requests, rejects new work and releases sessions exactly once',async()=>{
 const backend=new LocalBackend();backend.closed=false;backend.sessions=new Map();let finish,released=0;
 backend.queue=new Promise(resolve=>{finish=resolve;});backend.sessions.set('decision',Promise.resolve({release:async()=>{released++;}}));
 const first=backend.close(),second=backend.close();await assert.rejects(()=>backend.predict({}),/closed/);assert.equal(released,0);finish();await Promise.all([first,second]);assert.equal(released,1);assert.equal(backend.sessions.size,0);await backend.close();assert.equal(released,1);
});
test('a failed graph load does not prevent releasing other sessions',async()=>{
 const backend=new LocalBackend();backend.queue=Promise.resolve();backend.sessions=new Map([['embedding',Promise.resolve({release:async()=>{}})],['decision',Promise.reject(new Error('invalid graph'))]]);await backend.close();assert.equal(backend.sessions.size,0);
});
