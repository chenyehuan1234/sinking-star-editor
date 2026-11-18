import{freshTestState,inspectTestCopy,promoteTestCopy,recoverCopyReplacement,writeCopyMarker,type CopySource}from'../src/main/playtest-copy';
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

async function updatedCopy(){const v=await setup();await v.s.prepare();await v.s.deploy(v.p);const oldHash=v.s.sourceHash,oldState=await fs.readFile(path.join(v.s.workspace,'playtest-state.json')),oldCopy=await fs.readFile(path.join(v.s.testRoot,'data/levels.package'));const packageFile=path.join(v.source,'data/levels.package');await fs.writeFile(packageFile,new GamePackage(await fs.readFile(packageFile)).rebuild(new Map([['data-common/mirror_1.level_manifest',Buffer.from('[2]\n')]])));await v.s.connect(v.source);return{...v,oldHash,oldState,oldCopy};}
test('游戏更新后估算只读，重新准备替换旧副本并自动清理临时归档',async()=>{const{dir,source,s,oldHash,oldState,oldCopy}=await updatedCopy();try{const project=path.join(s.workspace,'my-project.json');await fs.writeFile(project,'keep project');const estimate=await s.preparationEstimate();assert.equal(estimate.prepared,false);assert.equal(estimate.requiresRefresh,true);assert.ok(estimate.requiredBytes>0);assert.deepEqual(await fs.readFile(path.join(s.workspace,'playtest-state.json')),oldState);assert.deepEqual(await fs.readFile(path.join(s.testRoot,'data/levels.package')),oldCopy);let saves=0;s.campaigns.deactivate=async()=>{saves++;};await s.prepare();assert.ok(!(await fs.readdir(path.join(s.workspace,'backups'))).some(n=>n.startsWith('test-copy-')));assert.equal(sha256(await fs.readFile(path.join(s.workspace,'backups',oldHash+'.package'))),oldHash);await assert.rejects(()=>fs.access(path.join(s.workspace,'playtest-replacement.json')));assert.equal(sha256(await fs.readFile(path.join(s.testRoot,'data/levels.package'))),s.sourceHash);assert.equal(sha256(await fs.readFile(path.join(source,'data/levels.package'))),s.sourceHash);assert.equal(await fs.readFile(project,'utf8'),'keep project');assert.equal(saves,0);assert.equal((await s.preparationEstimate()).prepared,true);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('只有程序更新、关卡包未变时也重新准备副本',async()=>{const{dir,source,s}=await setup();try{await s.prepare();const oldHash=s.sourceHash;await fs.writeFile(path.join(source,'sinking_star.exe'),'new fixture program');await s.connect(source);assert.equal(s.sourceHash,oldHash);assert.equal((await s.preparationEstimate()).requiresRefresh,true);await s.prepare();assert.equal(await fs.readFile(path.join(s.testRoot,'_editor-source.exe.disabled'),'utf8'),'new fixture program');assert.ok(!(await fs.readdir(path.join(s.workspace,'backups'))).some(n=>n.startsWith('test-copy-')));}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('旧版副本被外部改动时仍阻止替换，不猜测其归属',async()=>{const{dir,s}=await updatedCopy();try{const file=path.join(s.testRoot,'data/levels.package');await fs.appendFile(file,'external edit');const before=await fs.readFile(file);await assert.rejects(()=>s.preparationEstimate(),/外部改动/);await assert.rejects(()=>s.prepare(),/外部改动/);assert.deepEqual(await fs.readFile(file),before);assert.ok(!(await fs.readdir(path.join(s.workspace,'backups'))).some(n=>n.startsWith('test-copy-')));}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('更新副本空间不足时不移动旧目录或登记文件',async()=>{const{dir,s,oldCopy,oldState}=await updatedCopy();try{s.preparationEstimate=async()=>({workspace:s.workspace,prepared:false,requiresRefresh:true,sourceBytes:10,requiredBytes:20,availableBytes:0,canPrepare:false});await assert.rejects(()=>s.prepare(),/空间不足/);assert.deepEqual(await fs.readFile(path.join(s.testRoot,'data/levels.package')),oldCopy);assert.deepEqual(await fs.readFile(path.join(s.workspace,'playtest-state.json')),oldState);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('复制期间游戏启动时停止切换，保留旧副本',async()=>{const{dir,s,oldCopy,oldState}=await updatedCopy();try{let calls=0;s.assertStopped=async()=>{if(++calls>1)throw Error('请先退出沉星之序');};await assert.rejects(()=>s.prepare(),/请先退出/);assert.deepEqual(await fs.readFile(path.join(s.testRoot,'data/levels.package')),oldCopy);assert.deepEqual(await fs.readFile(path.join(s.workspace,'playtest-state.json')),oldState);}finally{await fs.rm(dir,{recursive:true,force:true});}});
async function copyContext(s:EditorService):Promise<CopySource>{return{workspace:s.workspace,gamePath:s.gamePath,testRoot:s.testRoot,sourceHash:s.sourceHash,sourceBuild:s.build,exeHash:sha256(await fs.readFile(path.join(s.gamePath,'sinking_star.exe')))};}
test('新副本已提升但登记写入中断时可从内部标记恢复',async()=>{const{dir,s,oldCopy}=await updatedCopy();try{const context=await copyContext(s),before=await inspectTestCopy(context),building=path.join(s.workspace,'preparing-interrupted');await fs.cp(s.gamePath,building,{recursive:true});await writeCopyMarker(building,freshTestState(context),before.state);const archive=await promoteTestCopy(context,building,before);assert.deepEqual(await fs.readFile(path.join(archive!,'game/data/levels.package')),oldCopy);assert.equal((await inspectTestCopy(context)).recoverState,true);await s.prepare();const state=JSON.parse(await fs.readFile(path.join(s.workspace,'playtest-state.json'),'utf8'));assert.equal(state.sourceHash,s.sourceHash);assert.equal((await inspectTestCopy(context)).recoverState,false);assert.equal((await s.preparationEstimate()).prepared,true);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('新目录提升失败会把已归档的旧副本移回，登记保持完整',async()=>{const{dir,s,oldCopy,oldState}=await updatedCopy();try{const context=await copyContext(s),before=await inspectTestCopy(context);await assert.rejects(()=>promoteTestCopy(context,path.join(s.workspace,'nonexistent-building'),before));assert.deepEqual(await fs.readFile(path.join(s.testRoot,'data/levels.package')),oldCopy);assert.deepEqual(await fs.readFile(path.join(s.workspace,'playtest-state.json')),oldState);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('测试目录指向原安装的链接不被采用或移动',async()=>{const{dir,source,s}=await setup();try{const before=await fs.readFile(path.join(source,'data/levels.package'));await fs.symlink(source,s.testRoot,'junction');await assert.rejects(()=>s.prepare(),/普通目录/);assert.deepEqual(await fs.readFile(path.join(source,'data/levels.package')),before);assert.equal((await fs.lstat(s.testRoot)).isSymbolicLink(),true);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('内部新副本标记不会绕过当前版本测试包被外部替换的拦截',async()=>{const{dir,s,p}=await setup();try{await s.prepare();await s.deploy(p);await fs.writeFile(path.join(s.testRoot,'data/levels.package'),s.pkg.buffer);await assert.rejects(()=>s.prepare(),/外部改动/);}finally{await fs.rm(dir,{recursive:true,force:true});}});

test('程序更新但源包不变的提升中断也能正确恢复登记',async()=>{const{dir,source,s,p}=await setup();try{await s.prepare();await s.deploy(p);await fs.writeFile(path.join(source,'sinking_star.exe'),'fixture second executable');await s.connect(source);const context=await copyContext(s),before=await inspectTestCopy(context),building=path.join(s.workspace,'preparing-exe-interrupted');assert.equal(before.requiresRefresh,true);await fs.cp(source,building,{recursive:true});await writeCopyMarker(building,freshTestState(context),before.state);await promoteTestCopy(context,building,before);assert.equal((await inspectTestCopy(context)).recoverState,true);await s.prepare();assert.equal((await s.preparationEstimate()).requiresRefresh,false);assert.equal(JSON.parse(await fs.readFile(path.join(s.workspace,'playtest-state.json'),'utf8')).exeHash,context.exeHash);}finally{await fs.rm(dir,{recursive:true,force:true});}});

async function pendingReplacement(){
 const v=await updatedCopy(),context=await copyContext(v.s),previous=await inspectTestCopy(context),building=path.join(v.s.workspace,'preparing-pending-update');
 await fs.cp(v.source,building,{recursive:true});await writeCopyMarker(building,freshTestState(context),previous.state);await fs.rename(path.join(building,'sinking_star.exe'),path.join(building,'_editor-source.exe.disabled'));
 const archive=(await promoteTestCopy(context,building,previous))!;return{...v,context,building,archive};
}
test('替换在目录切换中断时回退旧副本，并移除失败临时复制',async()=>{
 const v=await pendingReplacement();try{await fs.rename(v.s.testRoot,v.building);await recoverCopyReplacement(v.context);assert.deepEqual(await fs.readFile(path.join(v.s.testRoot,'data/levels.package')),v.oldCopy);assert.deepEqual(await fs.readFile(path.join(v.s.workspace,'playtest-state.json')),v.oldState);await assert.rejects(()=>fs.access(v.archive));await assert.rejects(()=>fs.access(v.building));await assert.rejects(()=>fs.access(path.join(v.s.workspace,'playtest-replacement.json')));}finally{await fs.rm(v.dir,{recursive:true,force:true});}
});
test('新版已提升但未登记时自动恢复登记并清理旧副本，同版本复用没有复制事件',async()=>{
 const v=await pendingReplacement();try{const events:{text:string;p?:import('../src/shared').PreparationProgress}[]=[];v.s.onPlaytestProgress=(text,p)=>events.push({text,p});await v.s.prepare();await assert.rejects(()=>fs.access(v.archive));await assert.rejects(()=>fs.access(path.join(v.s.workspace,'playtest-replacement.json')));assert.equal((await inspectTestCopy(v.context)).prepared,true);assert.ok(!events.some(e=>e.p?.phase==='copy'));assert.equal(events.at(-1)!.p,undefined);await fs.access(path.join(v.s.workspace,'backups',v.oldHash+'.package'));}finally{await fs.rm(v.dir,{recursive:true,force:true});}
});
test('清理旧副本时中断，重开可继续完成，不重新复制游戏',async()=>{
 const v=await pendingReplacement();try{const file=path.join(v.s.workspace,'playtest-replacement.json'),j=JSON.parse(await fs.readFile(file,'utf8'));await atomicWrite(path.join(v.s.workspace,'playtest-state.json'),JSON.stringify(j.next));j.cleanupStarted=true;await atomicWrite(file,JSON.stringify(j));await fs.rm(v.archive,{recursive:true});await v.s.prepare();await assert.rejects(()=>fs.access(file));assert.equal((await v.s.preparationEstimate()).prepared,true);}finally{await fs.rm(v.dir,{recursive:true,force:true});}
});
test('恢复登记失败不删除旧回退副本，重试成功后才清理',async()=>{
 const v=await pendingReplacement(),rename=fs.rename;try{
  fs.rename=async(from,to)=>{if(String(to)===path.join(v.s.workspace,'playtest-state.json'))throw Object.assign(Error('registration locked'),{code:'EACCES'});return rename(from,to);};
  await assert.rejects(()=>v.s.prepare(),/registration locked/);assert.deepEqual(await fs.readFile(path.join(v.archive,'game/data/levels.package')),v.oldCopy);
  fs.rename=rename;await v.s.prepare();await assert.rejects(()=>fs.access(v.archive));assert.equal((await v.s.preparationEstimate()).prepared,true);
 }finally{fs.rename=rename;await fs.rm(v.dir,{recursive:true,force:true});}
});
test('首次准备发布字节进度和校验阶段，失败清空进度且不残留新复制',async()=>{
 const v=await setup();try{const events:{text:string;p?:import('../src/shared').PreparationProgress}[]=[];v.s.onPlaytestProgress=(text,p)=>events.push({text,p});await v.s.prepare();assert.ok(events.some(e=>e.p?.phase==='copy'&&e.p.copiedBytes===e.p.totalBytes&&e.p.filesCopied===e.p.totalFiles));assert.ok(events.some(e=>e.p?.phase==='verify'));assert.ok(events.some(e=>e.p?.phase==='replace'));assert.equal(events.at(-1)!.p,undefined);events.length=0;await v.s.prepare();assert.ok(!events.some(e=>e.p?.phase==='copy'));}finally{await fs.rm(v.dir,{recursive:true,force:true});}
});
test('复制后游戏启动导致取消，不残留临时目录，也不清理历史归档',async()=>{
 const v=await updatedCopy();try{const historic=path.join(v.s.workspace,'backups','test-copy-historical');await fs.mkdir(historic);await fs.writeFile(path.join(historic,'keep.txt'),'keep');let calls=0;v.s.assertStopped=async()=>{if(++calls>1)throw Error('game started');};const events:unknown[]=[];v.s.onPlaytestProgress=(_text,p)=>events.push(p);await assert.rejects(()=>v.s.prepare(),/game started/);assert.equal(events.at(-1),undefined);assert.ok(!(await fs.readdir(v.s.workspace)).some(n=>n.startsWith('preparing-')));assert.deepEqual(await fs.readFile(path.join(v.s.testRoot,'data/levels.package')),v.oldCopy);assert.equal(await fs.readFile(path.join(historic,'keep.txt'),'utf8'),'keep');}finally{await fs.rm(v.dir,{recursive:true,force:true});}
});

test('复制中途退出留下的已登记半成品会清理，活跃或未登记目录保留',async()=>{
 const v=await setup();try{const state=freshTestState(await copyContext(v.s)),dead=path.join(v.s.workspace,'preparing-10-2147483647'),live=path.join(v.s.workspace,'preparing-11-'+process.pid),unknown=path.join(v.s.workspace,'preparing-12-2147483647');
  for(const dir of[dead,live,unknown]){await fs.mkdir(dir);await fs.writeFile(path.join(dir,'part.bin'),'partial');}
  for(const [dir,pid]of[[dead,2147483647],[live,process.pid]]as const)await fs.writeFile(path.join(dir,'_editor-preparing.json'),JSON.stringify({format:'sstar-preparing-copy',version:1,pid,state}));
  await v.s.prepare();await assert.rejects(()=>fs.access(dead));assert.equal(await fs.readFile(path.join(live,'part.bin'),'utf8'),'partial');assert.equal(await fs.readFile(path.join(unknown,'part.bin'),'utf8'),'partial');assert.equal((await v.s.preparationEstimate()).prepared,true);
 }finally{await fs.rm(v.dir,{recursive:true,force:true});}
});
test('已登记半成品中出现用户工程时停止清理，旧副本与工程都保留',async()=>{
 const v=await updatedCopy();try{const dir=path.join(v.s.workspace,'preparing-13-2147483647');await fs.mkdir(dir);await fs.writeFile(path.join(dir,'_editor-preparing.json'),JSON.stringify({format:'sstar-preparing-copy',version:1,pid:2147483647,state:freshTestState(await copyContext(v.s))}));const file=path.join(dir,'keep.sstar.json');await fs.writeFile(file,JSON.stringify(v.p));await assert.rejects(()=>v.s.prepare(),/工程或进度/);assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),v.p);assert.deepEqual(await fs.readFile(path.join(v.s.testRoot,'data/levels.package')),v.oldCopy);}finally{await fs.rm(v.dir,{recursive:true,force:true});}
});
