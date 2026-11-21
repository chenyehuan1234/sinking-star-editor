import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {patchSaveDirectory,bindIsolatedSaves,cleanupTemporarySaves,isolatedFolder,isolationSupported,preparePlaytestSaves,reportedSavePath} from '../src/main/save-isolation';
import {locateNativeSavePath} from '../src/main/native-save-path';
import {TestProfiles} from '../src/main/test-profiles';
import {sha256} from '../src/core/package';
import {readCampaign} from '../src/core/campaign';
const hash='a'.repeat(64),exeHash='978b302fd0952e4ea8d869553aec875d9c635278a7d0f8cdb752f5a797a370aa';
const context={projectId:'0123456789ab',sourceHash:hash,revision:'test-1',scope:{mode:'world' as const,levelIds:[]}};
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-isolation-')),workspace=path.join(root,'workspace'),saved=path.join(root,'SavedGames');await fs.mkdir(workspace);await fs.mkdir(saved);return{root,workspace,saved,close:async()=>{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}};}
test('未知程序和非法存档ID不进行存档目录补丁',()=>{const b=Buffer.from('Order of the Sinking Star\0SHGetKnownFolderPath\0'),before=Buffer.from(b);assert.equal(isolationSupported(b),false);assert.throws(()=>patchSaveDirectory(b,'0123456789ab'),/无法识别/);assert.deepEqual(b,before);assert.throws(()=>isolatedFolder('../normal'),/无效/);assert.equal(Buffer.byteLength(isolatedFolder('0123456789ab')),25);});
test('存档路径核对要求游戏帮助正常返回唯一的存档目录',()=>{
 const info='Game_Paths:\r\n  save_path:   C:\\Saved Games\\SStar_Editor_0123456789ab\r\n';
 const help='----- Here is the list of valid arguments: -----\n';
 assert.equal(reportedSavePath(info+help),'C:\\Saved Games\\SStar_Editor_0123456789ab');
 assert.equal(reportedSavePath(info),undefined);
 assert.equal(reportedSavePath(info+info.replace('SStar_Editor_0123456789ab','Order of the Sinking Star')+help),undefined);
});
test('独立存档只绑定已登记档，既有普通目录不覆盖，重置后可重新连接',async()=>{const f=await fixture();try{const profiles=new TestProfiles(f.workspace),p=await profiles.create(context,'test name x'),bound=await bindIsolatedSaves(f.workspace,p.id,f.saved);assert.equal(await fs.realpath(bound.alias),await fs.realpath(bound.saves));await fs.writeFile(path.join(bound.saves,'progress.txt'),'keep');await bindIsolatedSaves(f.workspace,p.id,f.saved);assert.equal(await fs.readFile(path.join(bound.saves,'progress.txt'),'utf8'),'keep');await profiles.change(p.id,'reset');await bindIsolatedSaves(f.workspace,p.id,f.saved);assert.equal(await fs.realpath(bound.alias),await fs.realpath(bound.saves));const p2=await profiles.create(context,'second'),conflict=path.join(f.saved,isolatedFolder(p2.id));await fs.mkdir(conflict);await fs.writeFile(path.join(conflict,'keep'),'original');await assert.rejects(()=>bindIsolatedSaves(f.workspace,p2.id,f.saved),/已被其他目录/);assert.equal(await fs.readFile(path.join(conflict,'keep'),'utf8'),'original');await assert.rejects(()=>profiles.create(context,'bad\u0000name'),/可见字符/);}finally{await f.close();}});
test('重复启动只更新所属隔离战役，不清除历史或其他档',async()=>{const f=await fixture();try{const profiles=new TestProfiles(f.workspace),p=await profiles.create(context,'continue'),campaign=await profiles.startCampaign(p.id,'overworld'),history=path.join(campaign,'overworld.history');await fs.writeFile(history,'existing history');const old=await fs.readFile(path.join(campaign,'Status.sokoban_status'));assert.equal(readCampaign(old).current,'overworld');await profiles.startCampaign(p.id,'ed_example_test');assert.equal(readCampaign(await fs.readFile(path.join(campaign,'Status.sokoban_status'))).current,'ed_example_test');assert.equal(await fs.readFile(history,'utf8'),'existing history');await profiles.used(p.id);assert.equal((await profiles.list()).length,1);}finally{await f.close();}});
test('独立显示声音跨档沿用，切回原设置或重置进度后仍可恢复',async()=>{const f=await fixture();try{const profiles=new TestProfiles(f.workspace),a=await profiles.create(context,'a'),b=await profiles.create(context,'b'),original=path.join(f.root,'original');await fs.mkdir(original);await fs.writeFile(path.join(original,'settings.menu_state'),'original');await profiles.setPreferences({settings:'independent',cacheLimitBytes:2**31});const dirA=await profiles.prepareSettings(a.id,original);await fs.writeFile(path.join(dirA,'settings.menu_state'),'my-fullscreen-audio');const dirB=await profiles.prepareSettings(b.id,original);assert.equal(await fs.readFile(path.join(dirB,'settings.menu_state'),'utf8'),'my-fullscreen-audio');await profiles.setPreferences({settings:'original',cacheLimitBytes:2**31});await profiles.prepareSettings(b.id,original);assert.equal(await fs.readFile(path.join(dirB,'settings.menu_state'),'utf8'),'original');await profiles.setPreferences({settings:'independent',cacheLimitBytes:2**31});await profiles.prepareSettings(b.id,original);assert.equal(await fs.readFile(path.join(dirB,'settings.menu_state'),'utf8'),'my-fullscreen-audio');await profiles.change(b.id,'reset');await profiles.prepareSettings(b.id,original);assert.equal(await fs.readFile(path.join(dirB,'settings.menu_state'),'utf8'),'my-fullscreen-audio');assert.equal(await fs.readFile(path.join(original,'settings.menu_state'),'utf8'),'original');}finally{await f.close();}});
const game=process.env.SINKING_STAR_GAME;
test('启动只在独立目录创建战役，复用测试进度且不改正式进度和设置',async()=>{
 const f=await fixture();
 try{
  const original=path.join(f.saved,'Order of the Sinking Star'),official=path.join(original,'ThiefOceanRiverEndpoint');
  const progress=path.join(official,'overworld.history'),settings=path.join(original,'settings.menu_state');
  await fs.mkdir(official,{recursive:true});
  await fs.writeFile(progress,'official progress');
  await fs.writeFile(settings,'original video and sound');
  const before=await fs.stat(progress);
  const run=await preparePlaytestSaves(f.workspace,hash,'ed_example_a',{},f.saved);
  const status=path.join(run.saves,'Editor_Playtest','Status.sokoban_status');
  const history=path.join(path.dirname(status),'overworld.history');
  assert.equal(await fs.realpath(run.alias),await fs.realpath(run.saves));
  assert.equal(await fs.readFile(path.join(run.saves,'settings.menu_state'),'utf8'),'original video and sound');
  assert.equal(readCampaign(await fs.readFile(status)).current,'ed_example_a');
  await fs.writeFile(history,'test progress');
  assert.equal((await preparePlaytestSaves(f.workspace,hash,'ed_example_b',{},f.saved)).id,run.id);
  assert.equal(await fs.readFile(history,'utf8'),'test progress');
  const previous=await fs.readFile(status);
  await assert.rejects(()=>preparePlaytestSaves(f.workspace,hash,'ed_bad',{verify:async()=>{throw Error('wrong save path');}},f.saved),/wrong save path/);
  assert.deepEqual(await fs.readFile(status),previous);
  await preparePlaytestSaves(f.workspace,hash,'ed_library_a',{mode:'library'},f.saved);
  const library=path.join(run.saves,'Editor_Playtest_Library','Status.sokoban_status');
  assert.equal(readCampaign(await fs.readFile(library)).current,'ed_library_a');
  const level='ed_example_b',single=path.join(run.saves,'Editor_Playtest_Single');
  await preparePlaytestSaves(f.workspace,hash,level,{mode:'single'},f.saved);
  await fs.writeFile(path.join(single,level+'.history'),'older level revision');
  await fs.writeFile(path.join(single,level+'.history.bak'),'old backup');
  await fs.writeFile(path.join(path.dirname(library),level+'.history'),'separate library progress');
  const repeated=await preparePlaytestSaves(f.workspace,hash,level,{mode:'single'},f.saved);
  assert.equal(repeated.id,run.id);
  assert.deepEqual((await fs.readdir(single)).sort(),['Status.sokoban_status','_editor-shared-playtest.json']);
  const singleStatus=readCampaign(await fs.readFile(path.join(single,'Status.sokoban_status')));
  assert.equal(singleStatus.current,level);
  assert.deepEqual(singleStatus.levels,[]);
  assert.equal(await fs.readFile(history,'utf8'),'test progress');
  assert.equal(await fs.readFile(path.join(path.dirname(library),level+'.history'),'utf8'),'separate library progress');
  await fs.writeFile(path.join(run.saves,'settings.menu_state'),'changed only by test');
  assert.deepEqual((await fs.readdir(original)).sort(),['ThiefOceanRiverEndpoint','settings.menu_state']);
  assert.equal(await fs.readFile(settings,'utf8'),'original video and sound');
  assert.equal(await fs.readFile(progress,'utf8'),'official progress');
  assert.equal((await fs.stat(progress)).mtimeMs,before.mtimeMs);
  assert.ok(!(await fs.readdir(run.saves)).includes('ThiefOceanRiverEndpoint'));
  await fs.link(progress,path.join(run.saves,'unsafe.history'));
  await assert.rejects(()=>preparePlaytestSaves(f.workspace,hash,'overworld',{},f.saved),/存在链接/);
  assert.equal(await fs.readFile(progress,'utf8'),'official progress');
 }finally{await f.close();}
});
test('临时试玩每次使用新进度，退出清除已登记的会话和链接',async()=>{
 const fixtureRun=await fixture();
 try{
  const {workspace,saved}=fixtureRun,original=path.join(saved,'Order of the Sinking Star');
  await fs.mkdir(original);await fs.writeFile(path.join(original,'official.history'),'official');
  const regular=await preparePlaytestSaves(workspace,hash,'overworld',{},saved);
  const temporary=await preparePlaytestSaves(workspace,hash,'ed_temporary',{temporary:true},saved);
  assert.notEqual(regular.id,temporary.id);
  assert.equal((await new TestProfiles(workspace).list()).length,1);
  assert.equal((await new TestProfiles(workspace,true).list()).length,1);
  assert.equal(await fs.realpath(temporary.alias),await fs.realpath(temporary.saves));
  const file=path.join(temporary.saves,'Editor_Playtest','Status.sokoban_status');
  assert.equal(readCampaign(await fs.readFile(file)).current,'ed_temporary');
  await fs.writeFile(path.join(path.dirname(file),'overworld.history'),'discarded');
  assert.equal(await cleanupTemporarySaves(workspace,saved),1);
  await assert.rejects(()=>fs.lstat(temporary.alias),{code:'ENOENT'});
  assert.equal((await new TestProfiles(workspace,true).list()).length,0);
  assert.equal(await fs.readFile(path.join(original,'official.history'),'utf8'),'official');
  assert.equal(await fs.realpath(regular.alias),await fs.realpath(regular.saves));
  const next=await preparePlaytestSaves(workspace,hash,'ed_temporary',{temporary:true},saved);
  assert.notEqual(next.id,temporary.id);
  assert.deepEqual(readCampaign(await fs.readFile(path.join(next.saves,'Editor_Playtest','Status.sokoban_status'))).levels,[]);
  await cleanupTemporarySaves(workspace,saved);
 }finally{await fixtureRun.close();}
});
test('真实游戏程序按隔离检验结果处理，源程序字节保持不变',{skip:!game},async()=>{
 const source=await fs.readFile(path.join(game!,'sinking_star.exe')),original=Buffer.from(source);
 if(!isolationSupported(source)){
  assert.throws(()=>patchSaveDirectory(source,'0123456789ab'),/无法识别/);
  assert.deepEqual(source,original);
  return;
 }
 const r=patchSaveDirectory(source,'0123456789ab');
 assert.deepEqual(source,original);
 assert.equal(r.buffer.length,source.length);
 const playtest=patchSaveDirectory(source,'0123456789ab',true);
 const hasConfirmedGate=r.sourceHash==='69ddb71fb6768a097f9bff204201f3a9ce960f1a325f5ed3a5c9160dc64a6ae8';
 assert.equal(playtest.fastTime,hasConfirmedGate);
 const expected=Buffer.from(r.buffer);
 if(hasConfirmedGate){
  expected.fill(0x90,0xa974e,0xa9750);
  expected.fill(0x90,0x265d1e,0x265d24);
 }
 assert.ok(playtest.buffer.equals(expected));
 let end=0;
 for(const edit of [...r.changes].sort((a,b)=>a.offset-b.offset)){
  assert.ok(edit.offset>=end);
  assert.ok(r.buffer.subarray(end,edit.offset).equals(source.subarray(end,edit.offset)));
  end=edit.offset+edit.length;
 }
 assert.ok(r.buffer.subarray(end).equals(source.subarray(end)));
 assert.equal(r.buffer.toString('ascii',r.offset,r.offset+25),isolatedFolder('0123456789ab'));
 if(r.changes.length>1){
  assert.equal(r.buffer.indexOf('Order of the Sinking Star'),source.indexOf('Order of the Sinking Star'));
  const rebuilt=Buffer.from(source);
  rebuilt[2]^=1; // DOS header, outside the game initializer and PE section table.
  assert.notEqual(sha256(rebuilt),r.sourceHash);
  assert.equal(isolationSupported(rebuilt),true);
  assert.equal(patchSaveDirectory(rebuilt,'0123456789ab',true).fastTime,false);
  const layout=locateNativeSavePath(source)!;
  const shiftedFrame=Buffer.from(source),start=layout.displacement-0x0f;
  const relocatedSlots=[0x04,0x17,0xed,0x3e,0x4a,0x69,0x97,0xcd,0xdd,0xe5,0xf5,0x78,0x8f,0xd5];
  for(const slot of relocatedSlots)shiftedFrame.writeUInt32LE(shiftedFrame.readUInt32LE(start+slot)+0x20,start+slot);
  assert.deepEqual(locateNativeSavePath(shiftedFrame),layout);
  shiftedFrame.writeUInt32LE(shiftedFrame.readUInt32LE(start+0x69)+8,start+0x69);
  assert.equal(locateNativeSavePath(shiftedFrame),undefined);
  const differentFunction=Buffer.from(source),importName=differentFunction.indexOf('SHGetKnownFolderPath\0');
  assert.ok(importName>=0);
  differentFunction[importName]=0x58;
  assert.equal(isolationSupported(differentFunction),false);
 }
});
