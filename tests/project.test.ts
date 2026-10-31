import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GamePackage,sha256} from '../src/core/package';
import {applyProject,buildChanges,validateProject,renameSettings} from '../src/core/project';
import {parseEntities,writeEntities,position} from '../src/core/entities';
import type {EditorProject} from '../src/shared';
const source=process.env.SINKING_STAR_PACKAGE??(process.env.SINKING_STAR_GAME?process.env.SINKING_STAR_GAME+'/data/levels.package':'');
const available=fs.existsSync(source),pkg=available?new GamePackage(fs.readFileSync(source)):null;
const project=():EditorProject=>({format:'sinking-star-project',version:1,sourceHash:sha256(pkg!.buffer),sourceBuild:'26006400',template:'mirror_1',name:'my_mirror_trial',operations:[]});
test('工程拒绝路径注入与非有限坐标',()=>{
  assert.throws(()=>validateProject({format:'sinking-star-project',version:1,name:'../../bad'}));
  const p={format:'sinking-star-project',version:1,sourceHash:'a'.repeat(64),sourceBuild:'fixture',template:'mirror_1',name:'new_level',operations:[{kind:'transform',id:1,position:[NaN,0,0]}]};
  assert.throws(()=>validateProject(p));
  p.operations=[{kind:'clone',id:1,newId:2} as any];assert.throws(()=>validateProject(p));
});
test('复制使用独立 ID，删除复制物件后恢复原记录',{skip:!available},()=>{
  const p=project(),before=parseEntities(pkg!.get('data-common/mirror_1.entities')),m=before.records.find(r=>r.type==='Mirror')!;
  p.operations=[{kind:'clone',id:m.id,newId:1048577,position:[12,13,0]}];
  const after=applyProject(pkg!,p);assert.equal(after.records.length,before.records.length+1);assert.deepEqual(position(after.records.at(-1)!),[12,13,0]);
  p.operations.push({kind:'delete',id:1048577});assert.deepEqual(writeEntities(applyProject(pkg!,p)),writeEntities(before));
  p.operations=[{kind:'clone',id:m.id,newId:m.id,position:[0,0,0]}];assert.throws(()=>applyProject(pkg!,p));
  p.operations=[{kind:'clone',id:m.id,newId:99,position:[0,0,0]}];assert.throws(()=>applyProject(pkg!,p));
  p.operations=[{kind:'delete',id:before.records.find(r=>r.type==='Guy')!.id}];assert.throws(()=>applyProject(pkg!,p));
});
test('模板另存支持不同长度名称，其他记录与资源清单不变',{skip:!available},()=>{
  const p=project(),changes=buildChanges(pkg!,p);
  const original=parseEntities(pkg!.get('data-common/mirror_1.entities')),renamed=parseEntities(changes.get('data-common/my_mirror_trial.entities')!);
  for(let i=0;i<original.records.length;i++)if(original.records[i].type!=='Settings')assert.deepEqual(renamed.records[i],original.records[i]);
  assert.deepEqual(changes.get('data-common/my_mirror_trial.level_manifest'),pkg!.get('data-common/mirror_1.level_manifest'));
  renameSettings(renamed,'my_mirror_trial','mirror_1');assert.deepEqual(writeEntities(renamed),writeEntities(original));
  p.name='overworld';assert.throws(()=>buildChanges(pkg!,p));
});
