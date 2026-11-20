import type {EditorProject,ViewGiverLinkRequest,ViewGiverLinkResult} from '../shared';
import {reservedEntityIds} from '../editor-organization';
import type {GamePackage} from './package';
import type {PropertyCodec} from './properties';
import {applyProject} from './project';
import type {EntityFile} from './entities';
import {cameraEditConfig,newCameraClone} from './camera-objects';
import {auxiliaryCameraOverride} from '../screen-camera';

/** Authoring remains native: named auxiliary views, and ID-linked overview views. */
export function linkViewGiver(pkg:GamePackage,c:PropertyCodec,p:EditorProject,r:ViewGiverLinkRequest,preview:(project:EditorProject)=>EntityFile=project=>applyProject(pkg,project,c)):ViewGiverLinkResult{
 if(!r||!Array.isArray(r.ids)||!r.ids.length||r.ids.length>2000||new Set(r.ids).size!==r.ids.length||!r.ids.every(id=>Number.isInteger(id)&&id>0&&id<=0xffffffff)||!['view','overview','overview2'].includes(r.slot)||!Number.isInteger(r.cameraId)||r.cameraId<0||r.cameraId>0xffffffff)throw Error('卷轴镜头关联请求无效');
 const file=preview(p);
 if(r.ids.some(id=>!file.records.some(e=>e.id===id&&e.type==='View_Giver')))throw Error('请选择有效的视角卷轴');
 const project=structuredClone(p),field=r.slot==='view'?'viewpoint_name':r.slot==='overview'?'map_overview_id':'map_overview_id_2';
 let cameraId=r.cameraId,copied=false,value:string|number=r.slot==='view'?'':0;
 if(cameraId){
  const camera=file.records.find(e=>e.id===cameraId&&e.type==='Camera_Control');
  if(!camera)throw Error('关联镜头不存在');
  const overview=Boolean(c.get(camera,'is_for_map_overview',false));
  if((r.slot==='view')===overview)throw Error(r.slot==='view'?'解锁视角请选择玩法镜头':'总览视角请选择地图总览镜头');
  if(r.slot==='view'){
   if(Number(c.get(camera,'minus_one_if_not_primary',0))!==-1){
    const edit=newCameraClone(c,file,file,camera.id,[0,0,0],undefined,reservedEntityIds(p.operations,file.records.map(e=>e.id),p.camera));
    if(edit.kind!=='clone')throw Error('辅助视角复制失败');
    project.camera=cameraEditConfig(project.camera,edit);cameraId=edit.ids[camera.id];copied=true;
    const override=auxiliaryCameraOverride(p.camera,camera.id,cameraId);
    if(override)project.camera.controls=[...(project.camera.controls??[]),override];
   }
   const old=String(c.get(camera,'entity_name','')),base=(old||'view').slice(0,120)+(copied?'_aux':''),occupied=new Set(file.records.filter(e=>e.type==='Camera_Control'&&e.id!==cameraId).map(e=>String(c.get(e,'entity_name',''))));
   // Also avoid adopting an existing unresolved name used by another scroll.
   if(copied||!old)for(const e of file.records)if(e.type==='View_Giver'&&!r.ids.includes(e.id))occupied.add(String(c.get(e,'viewpoint_name','')));
   let name=base,n=2;while(occupied.has(name))name=base+'_'+n++;
   if(copied||name!==old)project.camera=cameraEditConfig(project.camera,{kind:'patch',id:cameraId,values:{entity_name:name,minus_one_if_not_primary:-1}});
   value=name;
  }else value=cameraId;
 }
 project.operations.push(...r.ids.map(id=>({kind:'properties' as const,id,values:{[field]:value},...(r.slot==='view'?{viewCameraId:cameraId}:{})})));
 preview(project);
 return{project,cameraId,copied};
}
