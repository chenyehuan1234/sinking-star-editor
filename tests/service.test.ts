import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {GamePackage,sha256} from '../src/core/package';
import {EditorService,atomicWrite} from '../src/main/service';
import type {EditorProject} from '../src/shared';

test('连接不可解析的新目录失败后保留原连接和工程预览',async()=>{
  const {dir,source,s,p}=await setup();try{const before=s.sourceHash,bad=path.join(dir,'bad');await fs.mkdir(path.join(bad,'data'),{recursive:true});await fs.writeFile(path.join(bad,'data/levels.package'),fixturePackage());await fs.writeFile(path.join(bad,'sinking_star.exe'),Buffer.alloc(128));await assert.rejects(()=>s.connect(bad));assert.equal(s.gamePath,await fs.realpath(source));assert.equal(s.sourceHash,before);await s.preview(p);}finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('准备试玩空间不足时不创建副本，原文件保留',async()=>{
  const {dir,source,s}=await setup();try{const before=await fs.readFile(path.join(source,'data/levels.package'));s.preparationEstimate=async()=>({workspace:s.workspace,prepared:false,sourceBytes:100,requiredBytes:200,availableBytes:0,canPrepare:false});await assert.rejects(()=>s.prepare(),/空间不足/);await assert.rejects(()=>fs.access(s.testRoot));assert.deepEqual(await fs.readFile(path.join(source,'data/levels.package')),before);}finally{await fs.rm(dir,{recursive:true,force:true});}
});

function fixturePackage():Buffer {
  const header=Buffer.alloc(64);header.write('simp');header.writeUInt32LE(1,4);
  const prefix=Buffer.alloc(22);prefix.write('enty');prefix.writeUInt16LE(7,4);prefix.writeBigUInt64LE(25n,6);prefix.writeBigUInt64LE(2n,14);
  const types=Buffer.concat(['Mirror','Settings'].map(s=>{const b=Buffer.alloc(16+Buffer.byteLength(s));b.writeBigUInt64LE(BigInt(s.length));b.write(s,8);return b;}));
  const count=Buffer.alloc(4);count.writeUInt32LE(2);
  const mirror=Buffer.alloc(11);mirror.writeUInt16LE(0);mirror.writeFloatLE(11,6);mirror[10]=0xfd;
  const setting=Buffer.alloc(20+8);setting.writeUInt16LE(0x1060);setting.writeBigUInt64LE(8n,10);setting.write('mirror_1',18);setting[26]=0xfd;
  const records=[mirror,Buffer.concat([mirror,setting.subarray(0,27)])].map((d,i)=>{const h=Buffer.alloc(10);h.writeUInt32LE(1048577+i);h.writeUInt16LE(i,4);h.writeUInt32LE(d.length,6);return Buffer.concat([h,d]);});
  const ent=Buffer.concat([prefix,types,count,...records]);
  const entries=[{name:'data-common/mirror_1.entities',data:ent},{name:'data-common/mirror_1.level_manifest',data:Buffer.from('[1]\n')},{name:'data-common/intro.entities',data:ent},{name:'data-common/intro.level_manifest',data:Buffer.from('[1]\n')}];
  let offset=64;const rows:Buffer[]=[],data:Buffer[]=[];
  for(const e of entries){const name=Buffer.from(e.name),r=Buffer.alloc(21+name.length);r.writeUInt32LE(name.length);name.copy(r,4);r.writeBigUInt64LE(BigInt(e.data.length),5+name.length);r.writeBigUInt64LE(BigInt(offset),13+name.length);rows.push(r);data.push(e.data);offset+=e.data.length;}
  const toc=Buffer.alloc(64);toc.write('toc!');toc.writeBigUInt64LE(BigInt(entries.length),8);header.writeBigUInt64LE(BigInt(offset),16);
  return Buffer.concat([header,...data,toc,...rows]);
}
async function setup(){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-test-')),source=path.join(dir,'source'),workspace=path.join(dir,'workspace');
  await fs.mkdir(path.join(source,'data'),{recursive:true});await fs.mkdir(path.join(source,'data-common'));await fs.mkdir(path.join(source,'data-pc'));
  await fs.writeFile(path.join(source,'sinking_star.exe'),'fixture; not executable');await fs.writeFile(path.join(source,'data/levels.package'),fixturePackage());
  await fs.writeFile(path.join(source,'data-common/intro.all_paint_data'),'original paint');await fs.writeFile(path.join(source,'data-common/mirror_1.all_paint_data'),'mirror paint');
  // These file-operation tests use a non-executable fixture in a fresh temp directory.
  // Model its process state locally; an unrelated real game must not affect the fixture.
  // The deployment-rejection test below explicitly supplies the running state.
  const s=new EditorService(workspace);s.assertStopped=async()=>{};const c=await s.connect(source);
  const p:EditorProject={format:'sinking-star-project',version:1,sourceHash:c.sourceHash,sourceBuild:c.build,template:'mirror_1',name:'mirror_1',operations:[{kind:'transform',id:1048577,position:[10,0,0]}]};
  return {dir,source,workspace,s,p};
}
test('部署、恢复只写测试副本，源文件哈希始终不变',async()=>{
  const {dir,source,s,p}=await setup();try{
    const initial=await fs.readFile(path.join(source,'data/levels.package'));
    await s.prepare();await s.deploy(p);
    assert.notEqual(sha256(await fs.readFile(path.join(s.testRoot,'data/levels.package'))),sha256(initial));
    assert.equal(await fs.readFile(path.join(s.testRoot,'data-common/intro.all_paint_data'),'utf8'),'mirror paint');
    const output=await s.buildProject(p);assert.equal(new GamePackage(await fs.readFile(output.path)).entries.length,4);
    await s.restore();assert.deepEqual(await fs.readFile(path.join(s.testRoot,'data/levels.package')),initial);
    assert.equal(await fs.readFile(path.join(s.testRoot,'data-common/intro.all_paint_data'),'utf8'),'original paint');
    assert.deepEqual(await fs.readFile(path.join(source,'data/levels.package')),initial);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('源版本变化、备份损坏、外部修改测试包均停止覆盖',async()=>{
  const {dir,source,s,p}=await setup();try{
    await s.prepare();const file=path.join(s.testRoot,'data/levels.package');
    await fs.appendFile(file,'external');await assert.rejects(()=>s.deploy(p),/外部改动/);
    await fs.writeFile(file,s.pkg.buffer);
    await fs.writeFile(path.join(s.workspace,'backups',s.sourceHash+'.package'),'bad backup');await assert.rejects(()=>s.restore(),/哈希不匹配/);
    await fs.appendFile(path.join(source,'data/levels.package'),'updated');await assert.rejects(()=>s.buildProject(p),/源包发生变化/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('未登记测试目录不被覆盖，文件操作互斥',async()=>{
  const {dir,s}=await setup();try{
    await fs.mkdir(s.testRoot,{recursive:true});await fs.writeFile(path.join(s.testRoot,'keep.txt'),'keep');
    await assert.rejects(()=>s.prepare(),/未登记/);assert.equal(await fs.readFile(path.join(s.testRoot,'keep.txt'),'utf8'),'keep');
    await s.exclusive(async()=>{await assert.rejects(()=>s.exclusive(async()=>0),/正在进行/);});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('中断发生在包替换后仍可按持久化意图恢复',async()=>{
  const {dir,s,p}=await setup();try{
    await s.prepare();await s.deploy(p);const marker=path.join(s.workspace,'playtest-state.json');
    const state=JSON.parse(await fs.readFile(marker,'utf8'));state.pendingHash=state.deployedHash;state.deployedHash=s.sourceHash;await atomicWrite(marker,JSON.stringify(state));
    await s.restore();assert.equal(sha256(await fs.readFile(path.join(s.testRoot,'data/levels.package'))),s.sourceHash);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('游戏运行状态拦截部署；错误工程哈希停止构建',async()=>{
  const {dir,s,p}=await setup();try{
    await s.prepare();const before=await fs.readFile(path.join(s.testRoot,'data/levels.package'));
    s.assertStopped=async()=>{throw new Error('请先退出沉星之序');};
    await assert.rejects(()=>s.deploy(p),/请先退出/);assert.deepEqual(await fs.readFile(path.join(s.testRoot,'data/levels.package')),before);
    await assert.rejects(()=>s.buildProject({...p,sourceHash:'a'.repeat(64)}),/版本不匹配/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
