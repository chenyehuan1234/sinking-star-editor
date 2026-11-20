import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {levelAssociationTargets,matchesAssociation,parseChannel} from '../src/association';
import {parseEntities} from '../src/core/entities';
import {missingEntryMessages} from '../src/core/entry-references';
import {GamePackage,sha256} from '../src/core/package';
import {applyProject} from '../src/core/project';
import {PropertyCodec} from '../src/core/properties';
import {ExeReflection} from '../src/core/reflection';
import {newWorld,WorldCompiler} from '../src/core/world';
import {captureWorldRegion,pasteWorldRegion} from '../src/core/world-region';
import type {EditorProject,PrefabOp,WorldProject} from '../src/shared';
import {upgradeSpatialWorld} from '../src/world-space';

test('关联搜索覆盖关卡名、分组、原版区域和标识，频道保留 64 位精度',()=>{
 const world=newWorld('a'.repeat(64),'fixture');
 world.levelGroups=[{id:'quest',title:'解谜关'}];
 world.levels=[{id:'m1',title:'镜子练习',folderId:'quest',project:{format:'sinking-star-project',version:3,sourceHash:world.sourceHash,sourceBuild:world.sourceBuild,template:'mirror_1',name:'practice',operations:[]}}];
 const [level]=levelAssociationTargets(world,new Map([['mirror_1','地表']]));
 assert.equal(matchesAssociation(level,'解谜关 ＭＩＲＲＯＲ 地表'),true);
 assert.equal(matchesAssociation(level,'practice m1'),true);
 assert.equal(matchesAssociation(level,'解谜关 地下'),false);
 assert.equal(parseChannel('9223372036854775807'),'9223372036854775807');
 assert.equal(parseChannel('-9223372036854775808'),'-9223372036854775808');
 assert.throws(()=>parseChannel('9223372036854775808'),/范围/);
});

const root=process.env.SINKING_STAR_GAME??'';
test('新冰封屏障独立放置，入口引用随地图保存、重排及区域移植正确解析',{skip:!root},()=>{
 const pkg=new GamePackage(fs.readFileSync(path.join(root,'data','levels.package')));
 const codec=new PropertyCodec(new ExeReflection(fs.readFileSync(path.join(root,'sinking_star.exe'))));
 const compiler=new WorldCompiler(pkg,codec),hash=sha256(pkg.buffer);
 const freezerScene='best_beam_colors';
 const original=parseEntities(pkg.get('data-common/'+freezerScene+'.entities'));
 const template=original.records.find(r=>r.type==='Freezer'&&codec.parse(r).complete&&
  original.records.some(target=>target.type==='Judge'&&target.id===Number(codec.get(r,'unlocked_by_id'))));
 assert.ok(template);
 const project:EditorProject={format:'sinking-star-project',version:3,sourceHash:hash,sourceBuild:'fixture',template:'mirror_1',name:'test_level',operations:[]};
 const id=900*0x100000+1,position:[number,number,number]=[7,5,0];
 const place:PrefabOp={kind:'prefab',id,template:freezerScene,sourceId:template.id,position,standaloneFreezer:true};
 const standalone=applyProject(pkg,{...project,operations:[place]},codec,{prefix:original.prefix,types:original.types,records:[]});
 assert.deepEqual(standalone.records.filter(r=>r.type==='Judge'||r.type==='Freezer').map(r=>r.type),['Freezer']);
 assert.equal(codec.get(standalone.records[0],'partial_solve_count'),-1);
 const entityFlags=codec.reflection.flatten('Undoable_Entity_Data').find(field=>field.name==='entity_flags')!;
 const flags=new Map(codec.reflection.enumValues(entityFlags.type).map(flag=>[flag.name,BigInt(flag.value)]));
 const groupFlags=flags.get('IN_EXISTENCE_GROUP')!|flags.get('CURRENTLY_EXISTS')!|flags.get('PLAYABLE_IN_PRELUDE')!;
 const noGravity=flags.get('DOES_NOT_FALL')!;
 assert.notEqual(BigInt(String(codec.get(template,'entity_flags')))&groupFlags,0n);
 assert.equal(BigInt(String(codec.get(standalone.records[0],'entity_flags')))&(groupFlags|noGravity),noGravity);
 const legacy=applyProject(pkg,{...project,operations:[{...place,standaloneFreezer:undefined,assembly:true}]},codec,{prefix:original.prefix,types:original.types,records:[]});
 assert.equal(legacy.records.find(r=>r.id===Number(codec.get(legacy.records[0],'unlocked_by_id')))?.type,'Judge');
 const world=upgradeSpatialWorld(newWorld(hash,'fixture'));
 world.levels=[{id:'test_level',title:'测试关',project}];
 world.map.entries=[
  {id:'other',title:'其他入口',levelId:'test_level',x:3,y:3,z:0},
  {id:'target',title:'真实目标',levelId:'test_level',x:8,y:5,z:0},
 ];
 world.map.objects=[place,{kind:'properties',id,values:{unlocked_by_id:0},entryTargets:{unlocked_by_id:'target'}}];
 const before=compiler.previewMap(world);
 const cloned:WorldProject=JSON.parse(JSON.stringify(world));
 cloned.map.entries.reverse();
 const reordered=compiler.previewMap(cloned);
 const check=(file:typeof before,sourceId:number,targetKey:string)=>{
  const barrier=file.records.find(r=>r.id===sourceId)!;
  assert.equal(codec.get(barrier,'unlocked_by_id'),file.managedEntryIds?.get(targetKey));
 };
 assert.notEqual(before.managedEntryIds?.get('target'),reordered.managedEntryIds?.get('target'));
 check(before,id,'target');
 check(reordered,id,'target');
 const copied=captureWorldRegion(codec,reordered,cloned,'world',project,{ids:[],bounds:{min:[7,5,0],max:[8,5,0]}},['overworld'],p=>compiler.file(p.template));
 assert.deepEqual(copied.transfer?.conditionLinks?.map(link=>[link.sourceId,link.targetId]),[[id,reordered.managedEntryIds?.get('target')]]);
 const dest=upgradeSpatialWorld(newWorld(hash,'fixture'));
 const pasted=pasteWorldRegion(codec,compiler.previewMap(dest),{world:dest,scene:'world',bundle:copied,at:[5,5,0],yaw:0,id,
  options:{expand:false,skipConflicts:false,includeDependencies:false,unlocks:{}}});
 check(compiler.previewMap(pasted),id,pasted.map.entries[0].id);
 const runtime=parseEntities(compiler.build(pasted).changes.get('data-common/overworld.entities')!);
 const barrier=runtime.records.find(r=>r.type==='Freezer')!;
 assert.equal(codec.get(barrier,'unlocked_by_id'),runtime.records.find(r=>r.type==='Level_Entry')?.id);
 assert.equal(codec.get(barrier,'unfrozen'),false);
 assert.equal(codec.get(barrier,'group_id'),0);
 assert.equal(BigInt(String(codec.get(barrier,'entity_flags')))&(groupFlags|noGravity),noGravity);
 const outer=captureWorldRegion(codec,reordered,cloned,'world',project,{ids:[],bounds:{min:[7,5,0],max:[7,5,0]}},['overworld'],p=>compiler.file(p.template));
 const outside={world:pasted,scene:'world',bundle:outer,at:[2,2,0] as [number,number,number],yaw:0,id:id+1,
  options:{expand:false,skipConflicts:false,includeDependencies:false,unlocks:{}}};
 assert.throws(()=>pasteWorldRegion(codec,compiler.previewMap(pasted),outside),/解冻条件/);
 const redirected=pasteWorldRegion(codec,compiler.previewMap(pasted),{...outside,options:{...outside.options,unlocks:{['freezer:'+id+':unlocked_by_id']:pasted.map.entries[0].id}}});
 check(compiler.previewMap(redirected),id+1,pasted.map.entries[0].id);
 cloned.map.entries=cloned.map.entries.filter(e=>e.id!=='target');
 const draft=compiler.previewMap(cloned);
 assert.equal(codec.get(draft.records.find(r=>r.id===id)!,'unlocked_by_id'),0);
 assert.match(missingEntryMessages(draft)[0],/已删除/);
 assert.throws(()=>compiler.build(cloned),/入口已删除/);
});
