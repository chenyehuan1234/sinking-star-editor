import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {appearancePurpose,rememberEntityPurpose} from '../src/render-purpose';
import {categoryOf,defaultDisplay,visibility} from '../src/renderer/scene-display';
import {GamePackage,sha256} from '../src/core/package';import {parseEntities,writeEntities} from '../src/core/entities';
import {PropertyCodec} from '../src/core/properties';import {ExeReflection} from '../src/core/reflection';
import {applyProject,levelView} from '../src/core/project';import {createBlank} from '../src/core/blank';
import {cameraEditConfig,newCameraClone,sourceCamera} from '../src/core/camera-objects';
import {linkViewGiver} from '../src/core/view-giver';import {cameraViewGivers} from '../src/camera-switching';
import {validateReferences} from '../src/core/mechanisms';
import type {EditorProject,EntityView,ViewGiverLinkRequest} from '../src/shared';

test('视角卷轴与相机辅助模型按类型区分，默认可见可选，不受装饰开关误隐藏',()=>{
 const e={id:1,type:'View_Giver',editable:true,mesh:'GAME_EX_CamControl_Scroll',position:[0,0,0],bytes:0,yaw:0,cloneable:true}as EntityView;
 assert.equal(appearancePurpose(e),'scenery');assert.equal(categoryOf(e),'mechanism');assert.equal(visibility(e,defaultDisplay(),0),'visible');
 rememberEntityPurpose(e,'helper');assert.equal(appearancePurpose({...e,renderPurpose:'helper'}),'scenery');assert.equal(appearancePurpose(e),'scenery');
 assert.equal(appearancePurpose({...e,type:'Inanimate',mesh:'GAME_EX_CamControl_Arrow'}),'helper');
});

const game=process.env.SINKING_STAR_GAME??'',available=fs.existsSync(game+'/sinking_star.exe');
const pkg=available?new GamePackage(fs.readFileSync(game+'/data/levels.package')):null,c=available?new PropertyCodec(new ExeReflection(fs.readFileSync(game+'/sinking_star.exe'))):null;
const hash=pkg?sha256(pkg.buffer):'',id=900*0x100000+1;
function fixture(){const p=createBlank(hash,'native-test'),scroll=parseEntities(pkg!.get('data-common/3d_intro_heroes.entities')).records.find(r=>r.type==='View_Giver')!;p.operations.push({kind:'prefab',id,template:'3d_intro_heroes',sourceId:scroll.id,position:[2,3,0]});return p;}
const view=(p:EditorProject)=>levelView(pkg!,p.template,applyProject(pkg!,p,c!),c!);
const link=(p:EditorProject,cameraId:number,slot:ViewGiverLinkRequest['slot']='view',ids=[id])=>linkViewGiver(pkg!,c!,p,{ids,cameraId,slot});

test('下拉关联主镜头时复制辅助视角，保留主镜头、原工程和完整构图；撤销可完整恢复',{skip:!available},()=>{
 const p=fixture(),main=view(p).camera!.controls[0],pose={position:[4,-8,14]as[number,number,number],target:[2,3,0]as[number,number,number],up:[0,0,1]as[number,number,number]};
 p.camera={mode:'single',controls:[{id:main.id,fov:39,nativePose:pose}]};
 const before=JSON.stringify(p),bytes=writeEntities(applyProject(pkg!,p,c!)),result=link(p,main.id),after=view(result.project),aux=after.camera!.controls.find(v=>v.id===result.cameraId)!;
 assert.equal(JSON.stringify(p),before);assert.ok(result.copied);assert.notEqual(aux.id,main.id);assert.equal(aux.primary,false);assert.equal(aux.overview,false);assert.ok(aux.name);
 assert.equal(after.camera!.controls.find(v=>v.id===main.id)!.primary,true);assert.equal(aux.fov,39);assert.deepEqual(result.project.camera!.controls!.find(v=>v.id===aux.id)!.nativePose,pose);
 assert.deepEqual(cameraViewGivers(after)[0].cameras.map(v=>v.id),[aux.id]);assert.deepEqual(validateReferences(c!,applyProject(pkg!,result.project,c!)),[]);
 assert.deepEqual(writeEntities(applyProject(pkg!,p,c!)),bytes);assert.deepEqual(writeEntities(applyProject(pkg!,JSON.parse(JSON.stringify(result.project)),c!)),writeEntities(applyProject(pkg!,result.project,c!)));
});

test('已有辅助镜头直接关联，重复选择不增加相机；批量卷轴使用同一镜头',{skip:!available},()=>{
 const p=fixture(),main=view(p).camera!.controls[0],first=link(p,main.id),count=view(first.project).camera!.controls.length;
 const again=link(first.project,first.cameraId);assert.equal(again.copied,false);assert.equal(view(again.project).camera!.controls.length,count);
 const other=structuredClone(p.operations[0]);other.id=id+500;again.project.operations.push(other);
 const both=link(again.project,first.cameraId,'view',[id,id+500]);assert.deepEqual(cameraViewGivers(view(both.project)).map(g=>g.cameras.map(v=>v.id)),[[first.cameraId],[first.cameraId]]);
});

test('辅助镜头改名同步原生名称关联，保存重开与撤销均保持正确目标',{skip:!available},()=>{
 const p=fixture(),result=link(p,view(p).camera!.controls[0].id),before=structuredClone(result.project);
 result.project.camera=cameraEditConfig(result.project.camera,{kind:'patch',id:result.cameraId,values:{entity_name:'我自己的俯视图'}});
 const after=view(JSON.parse(JSON.stringify(result.project))),giver=cameraViewGivers(after)[0];assert.equal(giver.name,'我自己的俯视图');assert.deepEqual(giver.cameras.map(v=>v.id),[result.cameraId]);
 assert.notEqual(cameraViewGivers(view(before))[0].name,giver.name);
});

test('两个总览槽按 ID 独立关联，清除辅助关联不改总览和存在组',{skip:!available},()=>{
 const p=fixture(),source=sourceCamera(c!,pkg!,'overview');p.camera=cameraEditConfig(undefined,newCameraClone(c!,applyProject(pkg!,p,c!),source.file,source.root.id,[0,0,0],source.template));
 const map=view(p).camera!.controls.find(v=>v.overview)!,a=link(p,map.id,'overview'),b=link(a.project,map.id,'overview2'),linked=link(b.project,view(p).camera!.controls.find(v=>!v.overview)!.id),cleared=link(linked.project,0);
 const r=applyProject(pkg!,cleared.project,c!).records.find(r=>r.id===id)!;assert.equal(c!.get(r,'viewpoint_name',''),'');assert.equal(c!.get(r,'map_overview_id'),map.id);assert.equal(c!.get(r,'map_overview_id_2'),map.id);assert.equal(c!.get(r,'group_id',0),0);
 assert.throws(()=>link(p,map.id),/请选择玩法镜头/);assert.throws(()=>link(p,view(p).camera!.controls.find(v=>!v.overview)!.id,'overview'),/请选择地图总览/);
});

test('同名辅助镜头选择后获得唯一原生名称，不篡改其他相机与未知目标',{skip:!available},()=>{
 const p=fixture(),main=view(p).camera!.controls[0],a=link(p,main.id),f=applyProject(pkg!,a.project,c!),edit=newCameraClone(c!,f,f,a.cameraId,[2,0,0]);assert.equal(edit.kind,'clone');if(edit.kind!=='clone')return;
 const other=edit.ids[a.cameraId];a.project.camera=cameraEditConfig(a.project.camera,edit);a.project.camera=cameraEditConfig(a.project.camera,{kind:'patch',id:other,values:{entity_name:view(a.project).camera!.controls.find(v=>v.id===a.cameraId)!.name}});
 const before=JSON.stringify(a.project),result=link(a.project,other),after=view(result.project);assert.equal(JSON.stringify(a.project),before);assert.notEqual(after.camera!.controls.find(v=>v.id===other)!.name,after.camera!.controls.find(v=>v.id===a.cameraId)!.name);assert.deepEqual(cameraViewGivers(after)[0].cameras.map(v=>v.id),[other]);
 assert.throws(()=>link(a.project,0x7fffffff),/不存在/);assert.throws(()=>linkViewGiver(pkg!,c!,p,{ids:[main.id],slot:'view',cameraId:0}),/有效的视角卷轴/);
});

test('先改名再把旧名称给另一镜头，新的下拉关联按稳定 ID 写入，不被旧改名历史覆盖',{skip:!available},()=>{
 const p=fixture(),a=link(p,view(p).camera!.controls[0].id),old=view(a.project).camera!.controls.find(v=>v.id===a.cameraId)!.name;
 a.project.camera=cameraEditConfig(a.project.camera,{kind:'patch',id:a.cameraId,values:{entity_name:'renamed'}});
 const b=link(a.project,view(a.project).camera!.controls.find(v=>v.primary)!.id),other=b.cameraId;
 b.project.camera=cameraEditConfig(b.project.camera,{kind:'patch',id:other,values:{entity_name:old}});
 const final=link(b.project,other);assert.deepEqual(cameraViewGivers(view(final.project))[0].cameras.map(v=>v.id),[other]);
 const raw=structuredClone(final.project);raw.operations.push({kind:'properties',id,values:{viewpoint_name:'manual'}});assert.equal(cameraViewGivers(view(raw))[0].name,'manual');
 const cleared=link(final.project,0);cleared.project.camera=cameraEditConfig(cleared.project.camera,{kind:'delete',ids:[other]});assert.doesNotThrow(()=>applyProject(pkg!,cleared.project,c!));
 const deleted=structuredClone(final.project);deleted.operations.push({kind:'delete',id});assert.doesNotThrow(()=>applyProject(pkg!,deleted,c!));
});
