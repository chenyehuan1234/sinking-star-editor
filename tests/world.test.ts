import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{GamePackage,sha256}from'../src/core/package';import{ExeReflection}from'../src/core/reflection';import{PropertyCodec}from'../src/core/properties';
import{WorldCompiler,newWorld,worldIssues,validateWorld}from'../src/core/world';import{parseEntities,writeEntities}from'../src/core/entities';import{applyProject}from'../src/core/project';import{prefabs,validateReferences}from'../src/core/mechanisms';
import type{WorldProject}from'../src/shared';
const root=process.env.SINKING_STAR_GAME??'',available=fs.existsSync(root+'/sinking_star.exe');
const pkg=available?new GamePackage(fs.readFileSync(root+'/data/levels.package')):null,c=available?new PropertyCodec(new ExeReflection(fs.readFileSync(root+'/sinking_star.exe'))):null;
function fixture(){const w=newWorld(pkg?sha256(pkg.buffer):'a'.repeat(64),'fixture');w.id='0123456789ab';for(let i=1;i<=3;i++){w.levels.push({id:`level_${i}`,title:`关卡 ${i}`,project:{format:'sinking-star-project',version:1,sourceHash:w.sourceHash,sourceBuild:w.sourceBuild,template:'mirror_1',name:'mirror_1',operations:[]}});w.map.entries.push({id:`entry_${i}`,title:`入口 ${i}`,levelId:`level_${i}`,x:5+i*2,y:7});}return w;}
test('大地图检查出生点、地形、重复入口、缺失目标与可达性',()=>{
  const w=fixture();assert.equal(worldIssues(w).length,0);
  w.map.entries[0].levelId='missing';assert.ok(worldIssues(w).some(i=>i.severity==='error'&&i.entryId==='entry_1'));
  w.map.entries[0].levelId='level_1';w.map.tiles[w.map.spawn[1]*w.map.width+w.map.spawn[0]]=2;assert.ok(worldIssues(w).some(i=>i.message.includes('出生点')));
  w.map.spawn=[31,31];w.map.tiles[31*32+31]=1;assert.ok(worldIssues(w).some(i=>i.severity==='warning'&&i.entryId));
  w.map.width=200;assert.throws(()=>validateWorld(w));
});
test('真实机关与地形属性无损往返，材质名称数组正确读取',{skip:!available},()=>{
  for(const n of['mirror_1','intro','overworld','make_thief_goblin_maze_v2']){const f=parseEntities(pkg!.get(`data-common/${n}.entities`));for(const r of f.records.filter(r=>['Guy','Settings','Wall_Set','Level_Entry','Switch','Gate','Teleporter','Gem','Gem_Slot'].includes(r.type))){const p=c!.parse(r);assert.ok(p.complete,`${n} ${r.type} #${r.id}`);assert.deepEqual(c!.patch(r,{}).diff,r.diff);}}
  const f=parseEntities(pkg!.get('data-common/mirror_1.entities')),r=f.records.find(r=>r.id===23068690)!;assert.equal(c!.parse(r).complete,true);assert.deepEqual(c!.get(r,'materials'),['Island_Mirror_1~mirror_1']);
});
test('整包包含独立小关卡、全开入口与正确地形位图，原小关卡 PID 保持不变',{skip:!available},()=>{
  const w=fixture(),compiler=new WorldCompiler(pkg!,c!),b=compiler.build(w),hub=parseEntities(b.changes.get('data-common/overworld.entities')!);
  const entries=hub.records.filter(r=>r.type==='Level_Entry');assert.equal(entries.length,3);
  for(const r of entries){assert.equal(c!.get(r,'unlocked_by_id'),0);assert.equal(c!.get(r,'unlocked_by_id2'),0);assert.equal(c!.get(r,'enabled_t_target'),1);assert.ok(b.changes.has(`data-common/${c!.get(r,'level_name')}.entities`));}
  const f=parseEntities(b.changes.get('data-common/ed_0123456789ab_level_1.entities')!),original=parseEntities(pkg!.get('data-common/mirror_1.entities'));
  assert.deepEqual(f.records.filter(r=>r.type!=='Settings'),original.records.filter(r=>r.type!=='Settings'));
  const floor=hub.records.find(r=>r.type==='Wall_Set'&&c!.get(r,'position.z')===-1)!,bits=c!.get(floor,'wall_data.bits.slots')as string[];
  for(let i=0;i<w.map.tiles.length;i++)assert.equal(Boolean(BigInt(bits[i>>6])&(1n<<BigInt(i%64))),w.map.tiles[i]!==0);
  assert.deepEqual(writeEntities(hub),b.changes.get('data-common/overworld.entities'));
  assert.deepEqual(compiler.build(w).changes.get('data-common/overworld.entities'),b.changes.get('data-common/overworld.entities'));
});
test('快速选关更改地图出生点；不改变小关卡历史版本',{skip:!available},()=>{
  const w=fixture(),compiler=new WorldCompiler(pkg!,c!),normal=compiler.build(w),quick=compiler.build(w,'entry_3');
  const hero=parseEntities(quick.changes.get('data-common/overworld.entities')!).records.find(r=>r.type==='Guy')!;
  assert.equal(c!.get(hero,'position.x'),11);assert.equal(c!.get(hero,'position.y'),7);
  assert.deepEqual(quick.changes.get('data-common/ed_0123456789ab_level_1.entities'),normal.changes.get('data-common/ed_0123456789ab_level_1.entities'));
  assert.throws(()=>compiler.build(w,'nonexistent'));
});
test('新增双向传送器与频道机关，拦截失效引用和未开放属性',{skip:!available},()=>{
  const w=fixture(),p=w.levels[0].project,library=prefabs(pkg!,c!),tp=library.find(p=>p.key==='teleporter')!,sw=library.find(p=>p.key==='switch')!,gate=library.find(p=>p.key==='gate')!;
  p.operations=[{kind:'prefab',id:943718401,template:tp.template,sourceId:tp.sourceId,position:[8,9,0],values:{target_id:943718402,discovered:true,enabled_t_target:1}},{kind:'prefab',id:943718402,template:tp.template,sourceId:tp.sourceId,position:[10,9,0],values:{target_id:943718401,discovered:true,enabled_t_target:1}},{kind:'prefab',id:943718403,template:sw.template,sourceId:sw.sourceId,position:[9,9,0],values:{flavor:100}},{kind:'prefab',id:943718404,template:gate.template,sourceId:gate.sourceId,position:[11,9,0],values:{flavor:100,notted:false}}];
  const f=applyProject(pkg!,p,c!);assert.deepEqual(validateReferences(c!,f),[]);for(const r of f.records.slice(-4))assert.equal(c!.get(r,'group_id'),0);
  p.operations.push({kind:'delete',id:943718402});assert.ok(validateReferences(c!,applyProject(pkg!,p,c!)).some(e=>e.includes('943718401')));
  p.operations.push({kind:'properties',id:943718403,values:{unverified:1}});assert.throws(()=>applyProject(pkg!,p,c!));
});

test('七种机关预设可跨模板加入，宝石与插槽复制保留类型与坐标',{skip:!available},()=>{
 const w=fixture(),p=w.levels[0].project,library=prefabs(pkg!,c!);assert.equal(library.length,7);
 p.operations=library.map((v,i)=>({kind:'prefab' as const,id:900*0x100000+i+1,template:v.template,sourceId:v.sourceId,position:[8+i,9,0],values:v.type==='Teleporter'?{...v.values,target_id:900*0x100000+i+1}:v.values}));
 const f=applyProject(pkg!,p,c!);for(const [i,v] of library.entries()){const r=f.records.find(r=>r.id===900*0x100000+i+1)!;assert.equal(r.type,v.type);assert.equal(c!.parse(r).complete,true);assert.equal(c!.get(r,'position.x'),8+i);assert.equal(c!.get(r,'group_id'),0);}
 const g=w.levels[1].project;g.template='3d_intro_promesst_v5';g.operations=[{kind:'clone',id:95420538,newId:95421000,position:[4,-1,1]},{kind:'clone',id:95420539,newId:95421001,position:[5,-1,1]}];const gem=applyProject(pkg!,g,c!);assert.equal(gem.records.find(r=>r.id===95421000)?.type,'Gem');assert.equal(gem.records.find(r=>r.id===95421001)?.type,'Gem_Slot');assert.equal(c!.get(gem.records.find(r=>r.id===95421001)!,'position.x'),5);
});
