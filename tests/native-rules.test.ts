import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import type{EditorProject,EntityView,LevelView,TopologyConfig}from'../src/shared';
import{characterControlId,characterGroups}from'../src/character-control';
import{mergeTopologyChange,fitTopologyXY}from'../src/topology-changes';
import{validateTopology,topologyView}from'../src/core/topology';
import{GamePackage,sha256}from'../src/core/package';import{ExeReflection}from'../src/core/reflection';import{PropertyCodec}from'../src/core/properties';
import{applyProject,levelView,validateProject,buildChanges}from'../src/core/project';
import{parseEntities,writeEntities}from'../src/core/entities';import{createBlank}from'../src/core/blank';
import{captureRegion}from'../src/core/regions';import{validateReferences}from'../src/core/mechanisms';import{mechanismIssues}from'../src/core/mechanism-check';

const root=process.env.SINKING_STAR_GAME??'',available=fs.existsSync(root+'/sinking_star.exe'),pkg=available?new GamePackage(fs.readFileSync(root+'/data/levels.package')):null,c=available?new PropertyCodec(new ExeReflection(fs.readFileSync(root+'/sinking_star.exe'))):null;
const sourceHash=pkg?sha256(pkg.buffer):'a'.repeat(64);
const project=(template='clone_maze'):EditorProject=>({format:'sinking-star-project',version:3,sourceHash,sourceBuild:'native-test',template,name:'native_rules_test',operations:[]});
const file=(p:EditorProject)=>applyProject(pkg!,p,c!),raw=(name:string)=>parseEntities(pkg!.get(`data-common/${name}.entities`));
const key=(f:ReturnType<typeof raw>,id:number)=>Number(c!.get(f.records.find(r=>r.id===id)!,'turn_order_id',0))||id;
const view=(id:number,control=0,mesh='cleric')=>({id,type:'Guy',mesh,nativeProperties:[{field:{name:'turn_order_id'},value:control}]}as EntityView);
const topology:TopologyConfig={corner:[-4,-5,-2],size:[16,12,8],wrapping:true,wrappingOverride:0,forceWrappingOverride:false};

test('角色控制以原生标识分组，同外观可独立、不同外观可同组，缺失原锚点仍有效',()=>{
 const list=[view(1),view(2),view(3,1,'cleric_alt'),view(4,99),view(5,99)];
 assert.equal(characterControlId(list[0]),1);assert.equal(characterGroups(list).length,3);
 assert.deepEqual(characterGroups(list).map(g=>g.ids),[[1,3],[2],[4,5]]);assert.equal(characterGroups(list).at(-1)!.anchorId,undefined);
 assert.equal(characterGroups([...list,{id:6,type:'Rock'}as EntityView]).length,3);
});
test('循环边界和原生控制操作拒绝非法值，兼容缺省配置',()=>{
 validateTopology(undefined);validateTopology(topology);
 for(const patch of[{size:[0,1,1]},{size:[512,512,128]},{corner:[.5,0,0]},{corner:[0,0,Infinity]},{wrapping:'true'},{wrappingOverride:16}])assert.throws(()=>validateTopology({...topology,...patch}as TopologyConfig));
 const p:EditorProject={format:'sinking-star-project',version:3,sourceHash:'a'.repeat(64),sourceBuild:'test',template:'mirror_1',name:'test',operations:[]};
 for(const ids of[[],[1,1],[NaN],[0]])assert.throws(()=>validateProject({...p,operations:[{kind:'control',id:1,ids}]}));
 validateProject({...p,topology,operations:[{kind:'control',id:1,ids:[1,2],targetId:3}]});
});
test('排队修改边界保留不同轴和开关的连续输入，重置恢复继承且不修改输入',()=>{
 const before=JSON.stringify(topology),first=mergeTopologyChange(topology,{...topology,corner:[-8,-5,-2]},undefined)!;
 const second=mergeTopologyChange(topology,{...topology,corner:[-4,-9,-2],wrapping:false},first)!;
 assert.deepEqual(second.corner,[-8,-9,-2]);assert.equal(second.wrapping,false);assert.equal(JSON.stringify(topology),before);
 assert.equal(mergeTopologyChange(second,undefined,second),undefined);
 const copy=mergeTopologyChange(undefined,topology,undefined)!;copy.size[0]=1;assert.equal(topology.size[0],16);
});
test('按玩法范围框定循环周期包含水域及特殊机关，排除远景与相机且保留 Z',()=>{
 const level={name:'bounds',entities:[{id:1,type:'Stairs',editable:true,position:[20,21,4]},{id:2,type:'Inanimate',editable:true,position:[10000,10000,0]},{id:3,type:'Camera_Control',editable:true,position:[500,500,0]}],terrain:[{x:-4,y:-5,z:-1}],waters:[{x:-8,y:-12,width:4,height:5}]}as LevelView;
 const out=fitTopologyXY(level,topology);assert.deepEqual(out.corner,[-8,-12,-2]);assert.deepEqual(out.size,[29,34,8]);assert.equal(out.wrapping,true);assert.deepEqual(topology.corner,[-4,-5,-2]);
});

test('所有原版循环关和显式同步关未修改时逐字节保留，不改写遮罩或控制标识',{skip:!available},()=>{
 let wrapped=0,linked=0;
 for(const e of pkg!.entries.filter(e=>e.name.endsWith('.entities'))){const f=parseEntities(e.data),v=topologyView(c!,f),sync=f.records.some(r=>r.type==='Guy'&&Number(c!.get(r,'turn_order_id',0))!==0&&Number(c!.get(r,'turn_order_id'))!==r.id);if(!v?.wrapping&&!sync)continue;
  if(v?.wrapping)wrapped++;if(sync)linked++;const name=e.name.split('/').at(-1)!.slice(0,-9);const out=/^[a-zA-Z0-9_-]{1,100}$/.test(name)?file(project(name)):applyProject(pkg!,project(),c!,f);assert.deepEqual(writeEntities(out),e.data,name);
 }assert.ok(wrapped>=50);assert.ok(linked>=10);
});
test('原版克隆迷宫同步、end1 同外观独立、on_command 不同外观独立，符合直接组标识',{skip:!available},()=>{
 for(const[name,expected]of[['clone_maze',1],['end1',3],['on_command',2]]as const){const f=raw(name),v=levelView(pkg!,name,f,c!),groups=characterGroups(name==='end1'?v.entities.filter(e=>e.mesh==='cleric'):name==='on_command'?v.entities.filter(e=>e.mesh.startsWith('cleric')):v.entities);assert.equal(groups.length,expected,name);}
 const f=raw('clone_maze'),guys=f.records.filter(r=>r.type==='Guy');assert.equal(key(f,guys[0].id),key(f,guys[1].id));
});
test('同外观新角色默认独立，显式控制操作加入目标原生组，切换外观能力不改控制关系',{skip:!available},()=>{
 const p=createBlank(sha256(pkg!.buffer),'native-test'),hero=file(p).records.find(r=>r.type==='Guy')!,source=raw('clone_maze').records.find(r=>r.type==='Guy'&&Number(c!.get(r,'turn_order_id')))!;
 const a=900*0x100000+1,b=a+1;
 p.operations.push({kind:'prefab',id:a,template:'clone_maze',sourceId:source.id,position:[3,3,0]},{kind:'prefab',id:b,template:'clone_maze',sourceId:source.id,position:[5,3,0]});
 let f=file(p);assert.notEqual(key(f,a),key(f,b));assert.equal(c!.get(f.records.find(r=>r.id===a)!,'turn_order_id'),0);
 p.operations.push({kind:'control',id:a,ids:[a,b],targetId:a});f=file(p);assert.equal(key(f,a),key(f,b));
 const alt=raw('on_command').records.find(r=>r.type==='Guy'&&c!.get(r,'mesh')==='cleric_alt')!;
 p.operations.push({kind:'profile',id:b,template:'on_command',sourceId:alt.id});f=file(p);assert.equal(c!.get(f.records.find(r=>r.id===b)!,'mesh'),'cleric_alt');assert.equal(key(f,a),key(f,b));assert.equal(key(f,hero.id),hero.id);
});
test('复制为同步角色使用目标所属组而非目标 PID，复制与关联整体可撤销',{skip:!available},()=>{
 const p=project(),original=file(p),root=original.records.find(r=>r.type==='Guy'&&!Number(c!.get(r,'turn_order_id')))!,clone=original.records.find(r=>r.type==='Guy'&&r.id!==root.id)!,id=900*0x100000+1;
 const before=writeEntities(original);p.operations.push({kind:'duplicate',id:clone.id,copies:[{id:clone.id,newId:id}],offset:[1,0,0],associations:'shared'},{kind:'control',id,ids:[id],targetId:clone.id});
 assert.equal(key(file(p),id),root.id);p.operations.splice(-2);assert.deepEqual(writeEntities(file(p)),before);
});
test('独立多选复制组内关系重映射，原组及仅复制部分成员均保持正确',{skip:!available},()=>{
 const p=project(),f=file(p),guys=f.records.filter(r=>r.type==='Guy'),ids=guys.map((r,i)=>({id:r.id,newId:900*0x100000+1+i}));
 p.operations.push({kind:'duplicate',id:ids[0].id,copies:ids,offset:[1,0,0],associations:'independent'});let out=file(p);assert.equal(key(out,ids[0].newId),key(out,ids[1].newId));assert.notEqual(key(out,ids[0].id),key(out,ids[0].newId));
 const anchor=key(f,guys[0].id),followers=guys.filter(r=>r.id!==anchor),a=followers[0].id,b=900*0x100000+20;
 p.operations=[{kind:'duplicate',id:a,copies:[{id:a,newId:b}],offset:[1,0,0],associations:'shared'},{kind:'control',id:b,ids:[b],targetId:a}];out=file(p);
 p.operations.push({kind:'duplicate',id:a,copies:[{id:a,newId:b+1},{id:b,newId:b+2}],offset:[2,0,0],associations:'independent'});out=file(p);assert.equal(key(out,b+1),key(out,b+2));assert.notEqual(key(out,b+1),anchor);
});
test('区域快照复制部分同步成员时保留组内关系，清理外部控制身份且粘贴独立',{skip:!available},()=>{
 const p=project(),f=file(p),root=f.records.find(r=>r.type==='Guy'&&!Number(c!.get(r,'turn_order_id')))!,a=f.records.find(r=>r.type==='Guy'&&r.id!==root.id)!.id,b=900*0x100000+1;
 p.operations.push({kind:'duplicate',id:a,copies:[{id:a,newId:b}],offset:[1,0,0],associations:'shared'},{kind:'control',id:b,ids:[b],targetId:a});
 const source=file(p),bundle=captureRegion(c!,source,p,{ids:[a,b]},[p.template]);assert.equal(bundle.warnings.filter(w=>w.includes('turn_order_id')).length,0);
 p.operations.push({kind:'stamp',id:b+10,bundle,position:[2,2,0],yaw:0});const out=file(p);assert.equal(key(out,b+10),key(out,b+11));assert.notEqual(key(out,b+10),key(out,a));
});
test('锚角色独立时其余成员及变形石块改用新锚；删除锚仍保留原生控制身份且可完整撤销',{skip:!available},()=>{
 const p=project(),f=file(p),root=f.records.find(r=>r.type==='Guy'&&!Number(c!.get(r,'turn_order_id')))!,other=f.records.find(r=>r.type==='Guy'&&r.id!==root.id)!,rock=raw('3d_intro_vanilla').records.find(r=>r.type==='Rock')!,id=900*0x100000+1;
 p.operations.push({kind:'prefab',id,template:'3d_intro_vanilla',sourceId:rock.id,position:[3,3,0]});
 const native=file(p),index=native.records.findIndex(r=>r.id===id);native.records[index]=c!.patch(native.records[index],{transmute_stashed_turn_order_id:root.id});
 let out=applyProject(pkg!,{...p,operations:[{kind:'control',id:root.id,ids:[root.id]}]},c!,native);assert.notEqual(key(out,root.id),key(out,other.id));assert.equal(c!.get(out.records.find(r=>r.id===id)!,'transmute_stashed_turn_order_id'),key(out,other.id));
 const before=writeEntities(file(p));p.operations.push({kind:'delete',id:root.id});out=file(p);assert.equal(key(out,other.id),root.id);assert.ok(!validateReferences(c!,out).some(m=>m.includes('控制')));assert.ok(!mechanismIssues(c!,out).some(m=>m.severity==='error'&&m.message.includes('控制')));
 p.operations.pop();assert.deepEqual(writeEntities(file(p)),before);
});
test('控制操作拒绝缺失目标或非角色，来源及未提交操作不变',{skip:!available},()=>{
 const p=project(),f=file(p),guys=f.records.filter(r=>r.type==='Guy'),notGuy=f.records.find(r=>r.type!=='Guy')!,before=writeEntities(f);
 for(const op of[{kind:'control',id:guys[0].id,ids:[guys[0].id],targetId:123},{kind:'control',id:guys[0].id,ids:[guys[0].id],targetId:notGuy.id},{kind:'control',id:notGuy.id,ids:[notGuy.id]}]as const){p.operations=[{...op,ids:[...op.ids]}];assert.throws(()=>file(p),/本关角色/);}
 assert.deepEqual(writeEntities(raw(p.template)),before);
});
test('固定循环边界使用原生整数中心，新增或移动物件不改变周期，保存重开及构建正确',{skip:!available},()=>{
 const p=createBlank(sha256(pkg!.buffer),'native-test');p.topology=structuredClone(topology);const hero=file(p).records.find(r=>r.type==='Guy')!;
 p.operations.push({kind:'transform',id:hero.id,position:[50,-30,0]});const out=file(JSON.parse(JSON.stringify(p))),settings=out.records.find(r=>r.type==='Settings')!,v=topologyView(c!,out)!;
 assert.deepEqual(v.corner,topology.corner);assert.deepEqual(v.size,topology.size);assert.equal(v.wrapping,true);assert.equal(c!.get(settings,'lock_grid'),true);assert.equal(c!.get(settings,'grid.num_squares'),192);
 assert.deepEqual(levelView(pkg!,p.template,out,c!).topology,v);const built=buildChanges(pkg!,p,c!);assert.equal(topologyView(c!,parseEntities(built.get('data-common/blank_level.entities')!))!.wrapping,true);
 delete p.topology;assert.ok(topologyView(c!,file(p))!.size[0]>16);assert.equal(topologyView(c!,file(p))!.wrapping,false);
});
test('循环自定义只写白名单，保留原生遮罩／相机，重置无损恢复模板',{skip:!available},()=>{
 const p=project('boot_cycle_warrior'),original=file(p),base=topologyView(c!,original)!;p.topology={...base,corner:[-10,-8,base.corner[2]],size:[12,9,base.size[2]],wrappingOverride:5};
 const out=file(p);for(const r of original.records)if(r.type!=='Settings')assert.deepEqual(out.records.find(v=>v.id===r.id),r);
 const old=original.records.find(r=>r.type==='Settings')!,changed=out.records.find(r=>r.type==='Settings')!;for(const f of c!.parse(old).fields)if(!['grid.squares_x','grid.squares_y','grid.num_squares','grid.corner.x','grid.corner.y','grid.corner.z','grid.wrapping','squares_z','lock_grid','wrapping_override','force_wrapping_override_despite_per_screen'].includes(f.schema.name))assert.deepEqual(c!.get(changed,f.schema.name),f.value,f.schema.name);
 delete p.topology;assert.deepEqual(writeEntities(file(p)),writeEntities(original));
});
