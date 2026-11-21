import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {CommunityCache} from '../src/main/community-cache';

const policy={freshMs:60_000,keepMs:360_000,diskBytes:2048,entries:8};
const options={canUseStale:(error:unknown)=>error===offline};
const offline=Error('offline');
const bytes=(value:string)=>Buffer.from(value);

async function fixture(t:import('node:test').TestContext){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-community-cache-'));
  t.after(async()=>{
    for(const file of await fs.readdir(folder))await fs.unlink(path.join(folder,file));
    await fs.rmdir(folder);
  });
  return folder;
}

test('community browse merges requests, persists public entries and keeps author entries in memory',async t=>{
  const folder=await fixture(t),cache=new CommunityCache(folder,policy);
  let requests=0;
  const fetchPage=async()=>{requests++;return bytes('public catalog');};
  const [first,second]=await Promise.all([cache.get('list',fetchPage,options),cache.get('list',fetchPage,options)]);
  assert.equal(requests,1);
  assert.deepEqual(first,second);
  assert.equal(first.checked,true);
  await cache.get('author',async()=>bytes('author catalog'),{...options,persist:false});
  assert.equal((await cache.peek('author',false))?.toString(),'author catalog');

  const reopened=new CommunityCache(folder,policy);
  assert.equal((await reopened.peek('list'))?.toString(),'public catalog');
  const cached=await reopened.get('list',fetchPage,options);
  assert.equal(cached.bytes?.toString(),'public catalog');
  assert.equal(cached.checked,undefined);
  assert.equal(await reopened.peek('author',false),null);
  assert.equal(requests,1);
  await reopened.get('list',fetchPage,{...options,refresh:true});
  assert.equal(requests,2);
});

test('an expired community page is available offline but cannot survive deletion or invalidation',async t=>{
  const folder=await fixture(t),warming=new CommunityCache(folder,policy);
  await warming.get('detail',async()=>bytes('earlier release'),options);
  const [file]=await fs.readdir(folder);
  const expired=new Date(Date.now()-120_000);
  await fs.utimes(path.join(folder,file),expired,expired);

  const cache=new CommunityCache(folder,policy);
  assert.equal((await cache.peek('detail'))?.toString(),'earlier release');
  assert.deepEqual(await cache.get('detail',async()=>{throw offline;},options),{bytes:bytes('earlier release'),stale:true});
  await assert.rejects(cache.get('detail',async()=>{throw Error('deleted');},options),/deleted/);
  assert.equal(await cache.peek('detail'),null);
  assert.deepEqual(await fs.readdir(folder),[]);
});

test('a late response cannot restore an invalidated community page and the disk budget is enforced',async t=>{
  const folder=await fixture(t),cache=new CommunityCache(folder,{...policy,diskBytes:16,entries:2});
  let release!:()=>void;
  let started!:()=>void;
  const hold=new Promise<void>(resolve=>{release=resolve;});
  const loading=new Promise<void>(resolve=>{started=resolve;});
  const old=cache.get('one',async()=>{started();await hold;return bytes('superseded');},options);
  await loading;
  await cache.invalidate();
  await cache.get('one',async()=>bytes('current'),options);
  release();
  await old;
  assert.equal((await new CommunityCache(folder,policy).peek('one'))?.toString(),'current');
  await cache.get('two',async()=>bytes('123456789012'),options);
  const files=await fs.readdir(folder);
  assert.equal(files.length,1);
  assert.equal((await fs.stat(path.join(folder,files[0]))).size,12);
});
