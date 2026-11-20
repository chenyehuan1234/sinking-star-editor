import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';
import{newCampaign,readCampaign,writeCampaign}from'../src/core/campaign';import{CampaignManager}from'../src/main/campaigns';
test('战役 v33 保留进度与尾部，修改当前关卡可往返',()=>{const b=newCampaign(),c=readCampaign(b);assert.equal(c.current,'overworld');assert.deepEqual(writeCampaign(b,{}),b);const updated=writeCampaign(b,{current:'ed_123456789abc_level_a',time:123456789n});assert.equal(readCampaign(updated).current,'ed_123456789abc_level_a');assert.equal(readCampaign(updated).time,123456789n);assert.deepEqual(readCampaign(updated).tail,c.tail);assert.throws(()=>readCampaign(Buffer.alloc(100)));});
test('测试战役启动、归档历史、退出恢复选择、重置均不写正常战役',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-campaign-')),saves=path.join(root,'saves'),workspace=path.join(root,'workspace'),m=new CampaignManager(workspace,saves),id='0123456789ab',hash='a'.repeat(64);
  try{await fs.mkdir(path.join(saves,'normal'),{recursive:true});const normal=newCampaign();await fs.writeFile(path.join(saves,'normal','Status.sokoban_status'),normal);await fs.writeFile(path.join(saves,'normal','overworld.history'),'original');
    const dir=await m.ensure(id,hash);await fs.writeFile(path.join(dir,'overworld.history'),'owned history');await m.activate(id,hash);await assert.rejects(()=>fs.access(path.join(dir,'overworld.history')));assert.equal(readCampaign(await fs.readFile(path.join(dir,'Status.sokoban_status'))).current,'overworld');
    await m.deactivate();assert.ok(readCampaign(await fs.readFile(path.join(dir,'Status.sokoban_status'))).time<readCampaign(normal).time);
    await fs.writeFile(path.join(dir,'ed_level.history'),'owned small history');const archive=await m.reset(id,hash);assert.equal(await fs.readFile(path.join(archive,'ed_level.history'),'utf8'),'owned small history');
    assert.deepEqual(await fs.readFile(path.join(saves,'normal','Status.sokoban_status')),normal);assert.equal(await fs.readFile(path.join(saves,'normal','overworld.history'),'utf8'),'original');
    await assert.rejects(()=>m.ensure(id,'b'.repeat(64)),/不属于/);assert.throws(()=>m.directory('../normal'));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('同名而未登记的战役拒绝接管',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-owner-'));try{const m=new CampaignManager(path.join(root,'workspace'),path.join(root,'saves'));await fs.mkdir(m.directory('0123456789ab'),{recursive:true});await fs.writeFile(path.join(m.directory('0123456789ab'),'keep'),'keep');await assert.rejects(()=>m.ensure('0123456789ab','a'.repeat(64)),/未登记/);assert.equal(await fs.readFile(path.join(m.directory('0123456789ab'),'keep'),'utf8'),'keep');}finally{await fs.rm(root,{recursive:true,force:true});}});
test('共享试玩复用固定入口，保留现有历史与正式战役',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-shared-run-'));
  try{
    const saves=path.join(root,'saves'),normal=path.join(saves,'normal'),slot=path.join(saves,'Editor_Playtest');
    const manager=new CampaignManager(path.join(root,'workspace'),saves),original=newCampaign('original_level');
    await fs.mkdir(normal,{recursive:true});
    await fs.writeFile(path.join(normal,'Status.sokoban_status'),original);
    await fs.writeFile(path.join(saves,'settings.menu_state'),'game settings');
    await manager.startSharedPlaytest('ed_room');
    const status=path.join(slot,'Status.sokoban_status'),history=path.join(slot,'overworld.history');
    const first=readCampaign(await fs.readFile(status));
    assert.equal(first.current,'ed_room');
    assert.equal(first.menu,'menu_heroes_a');
    assert.ok(first.time>0n);
    await fs.writeFile(history,'test history');
    await manager.startSharedPlaytest('overworld');
    await manager.finishSharedPlaytest();
    const after=readCampaign(await fs.readFile(status));
    assert.equal(after.current,'overworld');
    assert.equal(after.time,0n);
    assert.equal(await fs.readFile(history,'utf8'),'test history');
    assert.deepEqual(await fs.readFile(path.join(normal,'Status.sokoban_status')),original);
    assert.equal(await fs.readFile(path.join(saves,'settings.menu_state'),'utf8'),'game settings');
    assert.deepEqual((await fs.readdir(saves)).sort(),['Editor_Playtest','normal','settings.menu_state']);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('共享试玩不接管同名的未知目录',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-shared-owner-'));
  try{
    const slot=path.join(root,'Editor_Playtest'),manager=new CampaignManager(root,root);
    await fs.mkdir(slot);
    await fs.writeFile(path.join(slot,'Status.sokoban_status'),'unowned');
    await assert.rejects(()=>manager.startSharedPlaytest('overworld'),/已被其他存档占用/);
    assert.equal(await fs.readFile(path.join(slot,'Status.sokoban_status'),'utf8'),'unowned');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('从头试玩清空自己的关卡历史并保留继续试玩和正式战役',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-fresh-run-'));
  try{
    const manager=new CampaignManager(root,root);
    await manager.startSharedPlaytest('ed_normal');
    await manager.startSharedPlaytest('overworld',true);
    const regular=path.join(root,'Editor_Playtest'),fresh=path.join(root,'Editor_Playtest_Fresh'),normal=path.join(root,'original');
    await fs.mkdir(normal);
    const status='Status.sokoban_status',history='overworld.history';
    await fs.writeFile(path.join(normal,status),'official');
    await fs.writeFile(path.join(regular,history),'continue');
    await fs.writeFile(path.join(fresh,history),'previous fresh run');
    await fs.writeFile(path.join(fresh,'ed_small.history'),'previous solved playtest');
    await fs.writeFile(path.join(fresh,status+'.backup'),'previous backup');
    await fs.writeFile(path.join(fresh,status),newCampaign('ed_old'));
    await manager.startSharedPlaytest('overworld',true);
    await manager.finishSharedPlaytest(true);
    const state=readCampaign(await fs.readFile(path.join(fresh,status)));
    assert.equal(state.current,'overworld');
    assert.equal(state.time,0n);
    assert.deepEqual(state.levels,[]);
    assert.deepEqual((await fs.readdir(fresh)).sort(),['Status.sokoban_status','_editor-shared-playtest.json']);
    assert.equal(await fs.readFile(path.join(regular,history),'utf8'),'continue');
    assert.equal(readCampaign(await fs.readFile(path.join(regular,status))).current,'ed_normal');
    assert.equal(await fs.readFile(path.join(normal,status),'utf8'),'official');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
