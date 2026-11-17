import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cameraHistoryIds,cameraReplayEdits} from '../src/camera-ids';
import {reservedEntityIds,nextEntityId} from '../src/editor-organization';
import type {CameraConfig,CameraObjectEdit,CameraObjectRequest,EditorProject} from '../src/shared';
import {GamePackage,sha256} from '../src/core/package';
import {parseEntities,writeEntities} from '../src/core/entities';
import {ExeReflection} from '../src/core/reflection';
import {PropertyCodec} from '../src/core/properties';
import {createBlank} from '../src/core/blank';
import {applyProject,levelView} from '../src/core/project';
import {validateReferences} from '../src/core/mechanisms';
import {EditorService} from '../src/main/service';

const first=900*0x100000+1;
const clone=(id:number,sourceId=42):CameraObjectEdit=>({kind:'clone',sourceId,sourceTemplate:'annoying_orange_v3',ids:{[sourceId]:id},offset:[0,0,0]});
const config=(edits:CameraObjectEdit[]):CameraConfig=>({mode:'template',edits});

test('物件与相机分配均保留删除历史、镜头覆盖和锚点引用的编号',()=>{
 const camera:CameraConfig={...config([clone(first),{kind:'delete',ids:[first]},{kind:'clone',sourceId:17,ids:{17:first+2,18:first+3},offset:[0,0,0]},{kind:'patch',id:first+2,values:{look_at_id:first+4,'position.x':first+10}}]),controls:[{id:first+5,fov:45}]};
 const used=cameraHistoryIds(camera);
 for(const id of [first,first+2,first+3,first+4,first+5,17,18])assert.ok(used.has(id));
 assert.ok(!used.has(first+10));
 const reserved=reservedEntityIds([{kind:'prefab',id:first+6,template:'mirror_1',sourceId:1,position:[0,0,0]},{kind:'delete',id:first+6}],[first+7],camera);
 assert.ok(reserved.has(first)&&reserved.has(first+6)&&reserved.has(first+7));
});

test('组合、区域和批量放置整段避开历史镜头编号，不能仅检查根物件',()=>{
 const used=reservedEntityIds([],[],config([clone(first+2),{kind:'delete',ids:[first+2]}]));
 assert.equal(nextEntityId(used),first);assert.equal(nextEntityId(used,3),first+3);
 const reserved=reservedEntityIds([{kind:'stamp',id:first,bundle:{records:[{}, {}, {}]}as never,position:[0,0,0],yaw:0}]);
 assert.ok(reserved.has(first+1)&&reserved.has(first+2));assert.equal(nextEntityId(reserved),first+3);
 assert.throws(()=>nextEntityId(used,0),/数量无效/);
});

test('已删除镜头与现有物件撞号时仅改回放临时编号，不修改存储配置',()=>{
 const edits:CameraObjectEdit[]=[clone(first),{kind:'patch',id:first,values:{'position.x':first,entity_name:'旧区域'}},{kind:'delete',ids:[first]}],before=JSON.stringify(edits),out=cameraReplayEdits(edits,[first]);
 assert.equal(JSON.stringify(edits),before);
 const created=out[0]as Extract<CameraObjectEdit,{kind:'clone'}>,patch=out[1]as Extract<CameraObjectEdit,{kind:'patch'}>,deleted=out[2]as Extract<CameraObjectEdit,{kind:'delete'}>;
 assert.notEqual(created.ids[42],first);assert.equal(patch.id,created.ids[42]);assert.deepEqual(deleted.ids,[patch.id]);assert.equal(patch.values['position.x'],first);
 assert.deepEqual(cameraReplayEdits(edits,[first]),out);
});

test('临时编号重映射依赖复制、原生引用和删除，不改变外部对象身份',()=>{
 const edits:CameraObjectEdit[]=[clone(first),{kind:'patch',id:9,values:{look_at_id:first,'position.x':first}},
  {kind:'clone',sourceId:first,ids:{[first]:first+1},offset:[2,0,0]},
  {kind:'delete',ids:[first]}];
 const out=cameraReplayEdits(edits,[first,9]),created=out[0]as Extract<CameraObjectEdit,{kind:'clone'}>,copy=out[2]as Extract<CameraObjectEdit,{kind:'clone'}>,patch=out[1]as Extract<CameraObjectEdit,{kind:'patch'}>;
 assert.equal(copy.sourceId,created.ids[42]);assert.equal(copy.ids[copy.sourceId],first+1);
 assert.equal(patch.values.look_at_id,created.ids[42]);assert.equal(patch.values['position.x'],first);
 assert.equal(patch.id,9);
});

test('重复删除再创建的每段编号生命周期独立，临时编号不占未来记录',()=>{
 const edits:CameraObjectEdit[]=[clone(first),{kind:'delete',ids:[first]},clone(first),{kind:'delete',ids:[first]},clone(first+1)];
 const out=cameraReplayEdits(edits,[first]);
 const a=(out[0]as Extract<CameraObjectEdit,{kind:'clone'}>).ids[42],b=(out[2]as Extract<CameraObjectEdit,{kind:'clone'}>).ids[42];
 assert.ok(a!==b&&a!==first+1&&b!==first+1);
 assert.deepEqual((out[1]as Extract<CameraObjectEdit,{kind:'delete'}>).ids,[a]);assert.deepEqual((out[3]as Extract<CameraObjectEdit,{kind:'delete'}>).ids,[b]);
 assert.deepEqual(out[4],edits[4]);
});

test('存活编号冲突不自动改写，重复创建同一存活编号仍报错',()=>{
 const edits=[clone(first)];assert.deepEqual(cameraReplayEdits(edits,[first]),edits);
 assert.throws(()=>cameraReplayEdits([clone(first),clone(first),{kind:'delete',ids:[first]}],[]),/ID 冲突/);
 const valid=[clone(first),{kind:'delete' as const,ids:[first]},clone(first)];assert.deepEqual(cameraReplayEdits(valid,[]),valid);
 assert.deepEqual(cameraReplayEdits(undefined,[first]),[]);
});

const game=process.env.SINKING_STAR_GAME??'',available=fs.existsSync(game+'/sinking_star.exe');
const pkg=available?new GamePackage(fs.readFileSync(game+'/data/levels.package')):null;
const codec=available?new PropertyCodec(new ExeReflection(fs.readFileSync(game+'/sinking_star.exe'))):null;
function blank(){return createBlank(sha256(pkg!.buffer),'native-test');}
const cameraObject=(p:EditorProject,r:CameraObjectRequest)=>EditorService.prototype.cameraObject.call({pkg,codec,checkProject:async()=>{}}as unknown as EditorService,p,r);
function scroll(p:EditorProject,id:number){const source=parseEntities(pkg!.get('data-common/3d_intro_heroes.entities')).records.find(r=>r.type==='View_Giver');assert.ok(source);p.operations.push({kind:'prefab',id,template:'3d_intro_heroes',sourceId:source.id,position:[2,3,0]});}
function unique(p:EditorProject){const f=applyProject(pkg!,JSON.parse(JSON.stringify(p)),codec!);assert.equal(new Set(f.records.map(r=>r.id)).size,f.records.length);assert.deepEqual(validateReferences(codec!,f),[]);return f;}

test('真实新建接口：五种对象连续创建、删除、再创建不复用历史编号，撤销和保存重开一致',{skip:!available},async()=>{
 const p=blank(),allocated=new Set<number>();
 for(const kind of ['play','overview','height-lock','limiter','overview-region']as const){
  p.camera=await cameraObject(p,{action:'create',kind,position:[0,0,0]});
  const edit=p.camera.edits!.at(-1)as Extract<CameraObjectEdit,{kind:'clone'}>;
  for(const id of Object.values(edit.ids)){assert.ok(!allocated.has(id));allocated.add(id);}
  const before=structuredClone(p),bytes=writeEntities(unique(before));
  p.camera=await cameraObject(p,{action:'delete',id:edit.ids[edit.sourceId]});unique(p);
  assert.deepEqual(writeEntities(unique(before)),bytes);
 }
 p.camera=await cameraObject(p,{action:'create',kind:'height-lock',position:[3,4,0]});
 const last=p.camera.edits!.at(-1)as Extract<CameraObjectEdit,{kind:'clone'}>;
 for(const id of Object.values(last.ids))assert.ok(!allocated.has(id));unique(p);
});

test('历史回放：删除区域后旧版复用了卷轴编号，恢复预览、新建、保存重开均保留卷轴',{skip:!available},async()=>{
 const p=blank();p.camera=await cameraObject(p,{action:'create',kind:'height-lock',position:[0,0,0]});
 const edit=p.camera.edits!.at(-1)as Extract<CameraObjectEdit,{kind:'clone'}>,id=edit.ids[edit.sourceId];
 p.camera=await cameraObject(p,{action:'delete',id});scroll(p,id);
 const untouched=JSON.stringify(p),original=applyProject(pkg!,{...p,camera:undefined},codec!).records.find(r=>r.id===id)!;
 let f=unique(p);assert.equal(f.records.find(r=>r.id===id)?.type,'View_Giver');assert.deepEqual(f.records.find(r=>r.id===id)!.diff,original.diff);assert.equal(JSON.stringify(p),untouched);
 p.camera=await cameraObject(p,{action:'create',kind:'play',position:[8,8,0]});f=unique(p);
 assert.deepEqual(f.records.find(r=>r.id===id)!.diff,original.diff);
 const view=levelView(pkg!,p.template,f,codec!);assert.equal(view.camera!.controls.length,2);
 const reopened=parseEntities(writeEntities(f));assert.deepEqual(reopened.records.find(r=>r.id===id)!.diff,original.diff);
});

test('历史回放：已删镜头的自引用与依赖复制保持，卷轴记录不被删除',{skip:!available},async()=>{
 const p=blank();p.camera=await cameraObject(p,{action:'create',kind:'play',position:[2,3,4]});
 const edit=p.camera.edits!.at(-1)as Extract<CameraObjectEdit,{kind:'clone'}>,id=edit.ids[edit.sourceId];
 p.camera.edits!.push({kind:'patch',id,values:{look_at_id:id}});
 p.camera=await cameraObject(p,{action:'clone',id,offset:[2,0,0]});
 const copy=p.camera.edits!.at(-1)as Extract<CameraObjectEdit,{kind:'clone'}>,copyId=copy.ids[id];
 p.camera=await cameraObject(p,{action:'delete',id});scroll(p,id);
 const f=unique(p),record=f.records.find(r=>r.id===copyId)!;
 assert.ok(record);assert.equal(codec!.get(record,'look_at_id'),copyId);assert.equal(f.records.find(r=>r.id===id)?.type,'View_Giver');
});

test('新镜头不能占用已删除普通物件的历史编号，未删除冲突继续阻止构建',{skip:!available},async()=>{
 const p=blank();scroll(p,first);p.operations.push({kind:'delete',id:first});
 p.camera=await cameraObject(p,{action:'create',kind:'height-lock',position:[0,0,0]});
 const edit=p.camera.edits!.at(-1)as Extract<CameraObjectEdit,{kind:'clone'}>;assert.notEqual(edit.ids[edit.sourceId],first);unique(p);
 const invalid=blank();scroll(invalid,first);invalid.camera=config([{...edit,ids:Object.fromEntries(Object.keys(edit.ids).map(source=>[source,first]))}]);
 assert.throws(()=>applyProject(pkg!,invalid,codec!),/ID 冲突/);
});
