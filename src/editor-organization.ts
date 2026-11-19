import type {CameraConfig,EditOp,EditorProject,WorldProject} from './shared';
import {cameraHistoryIds} from './camera-ids';
export type ObjectKey=`entity:${number}`|`entry:${string}`;
export interface EditorGroup {id:string;name:string;members:ObjectKey[]}
export interface CameraPlan {start:[number,number];columns:number;rows:number}
export interface EditorMetadata {groups:EditorGroup[];cameraPlan?:CameraPlan}
export const entityKey=(id:number):ObjectKey=>`entity:${id}`;
export const entryKey=(id:string):ObjectKey=>`entry:${id}`;
export function validateEditor(v:EditorMetadata|undefined){
 if(v===undefined)return;
 if(!v||!Array.isArray(v.groups)||v.groups.length>2000)throw Error('编辑分组数据无效');
 const p=v.cameraPlan;if(p&&(!Array.isArray(p.start)||p.start.length!==2||p.start.some(n=>!Number.isInteger(n)||Math.abs(n)>10000)||![p.columns,p.rows].every(n=>Number.isInteger(n)&&n>=1&&n<=512)))throw Error('分屏规划范围无效');
 const ids=new Set<string>(),members=new Set<string>();
 for(const g of v.groups){if(!g||typeof g.id!=='string'||!g.id||g.id.length>256||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>100||!Array.isArray(g.members)||g.members.length>10000)throw Error('编辑分组名称或标识无效');ids.add(g.id);for(const k of g.members){if(typeof k!=='string'||!/^entity:[1-9]\d*$|^entry:[a-zA-Z0-9_-]+$/.test(k)||members.has(k))throw Error('编辑分组成员重复或无效');if(k.startsWith('entity:')&&Number(k.slice(7))>0xffffffff)throw Error('物件标识越界');members.add(k);}}
}
export function removeMembers(meta:EditorMetadata|undefined,keys:Set<ObjectKey>):EditorMetadata|undefined{return meta?{...meta,groups:meta.groups.map(g=>({...g,members:g.members.filter(k=>!keys.has(k))}))}:undefined;}
export function copyGroups(meta:EditorMetadata|undefined,map:Map<ObjectKey,ObjectKey>,suffix:string):EditorGroup[]{return(meta?.groups??[]).flatMap((g,index)=>{const members=g.members.flatMap(k=>map.has(k)?[map.get(k)!]:[]);return members.length?[{id:'copy_'+suffix+'_'+index,name:g.name.slice(0,97)+' 副本',members}]:[];});}
export function organizeOperations(meta:EditorMetadata|undefined,ops:EditOp[]){
 let result=meta?structuredClone(meta):undefined;
 for(const [i,op]of ops.entries()){
  if(op.kind==='delete')result=removeMembers(result,new Set([entityKey(op.id)]));
  if(op.kind==='duplicate'&&result){const copies=copyGroups(result,new Map(op.copies.map(c=>[entityKey(c.id),entityKey(c.newId)])),String(op.copies[0].newId)+'_'+i);result.groups.push(...copies);}
 }
 return result;
}
/** Editor-only metadata must never change native revisions or test progress. */
export function gameplayProject(p:EditorProject):EditorProject{const{editor,sourceEvidence,...rest}=p;return rest;}
export function gameplayWorld(w:WorldProject):WorldProject{const{editor,...map}=w.map;const{sourceEvidence,levelGroups,...rest}=w;return{...rest,map,levels:w.levels.map(l=>({id:l.id,title:l.id,project:gameplayProject(l.project)})).sort((a,b)=>a.id.localeCompare(b.id))};}

export function operationTargets(op:EditOp):number[]{if(op.kind==='levelSettings'||op.kind==='terrainPaint')return [];return op.kind==='control'?op.ids:op.kind==='duplicate'?op.copies.map(c=>c.id):[op.id];}

export function removeWorldLevel(w:WorldProject,id:string){const removed=new Set(w.map.entries.filter(e=>e.levelId===id).map(e=>entryKey(e.id)));w.levels=w.levels.filter(l=>l.id!==id);w.map.entries=w.map.entries.filter(e=>e.levelId!==id);for(const e of w.map.entries)if(e.unlocks)e.unlocks=e.unlocks.map(key=>key&&removed.has(entryKey(key))?null:key) as typeof e.unlocks;w.map.editor=removeMembers(w.map.editor,removed);return removed.size;}
export function reservedEntityIds(ops:EditOp[],existing:number[]=[],camera?:CameraConfig){const used=cameraHistoryIds(camera);for(const id of existing)used.add(id);for(const op of ops){used.add(op.id);if(op.kind==='properties'&&op.viewCameraId)used.add(op.viewCameraId);if(op.kind==='clone')used.add(op.newId);if(op.kind==='duplicate')for(const c of op.copies)used.add(c.newId);const count=op.kind==='prefab'&&op.assembly?257:op.kind==='stamp'?op.bundle.records.length:1;for(let n=1;n<count;n++)used.add(op.id+n);}return used;}
/** Reserve a contiguous span for assemblies and batches, not just their root. */
export function nextEntityId(used:Set<number>,count=1){if(!Number.isSafeInteger(count)||count<1||count>0x100000-1)throw Error('新增对象数量无效');let free=0;for(let id=900*0x100000+1;id<901*0x100000;id++){free=used.has(id)?0:free+1;if(free===count)return id-count+1;}throw Error('新增对象编号空间已满');}
