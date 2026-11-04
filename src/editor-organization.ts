import type {EditOp,EditorProject,WorldProject} from './shared';
export type ObjectKey=`entity:${number}`|`entry:${string}`;
export interface EditorGroup {id:string;name:string;members:ObjectKey[]}
export interface EditorMetadata {groups:EditorGroup[]}
export const entityKey=(id:number):ObjectKey=>`entity:${id}`;
export const entryKey=(id:string):ObjectKey=>`entry:${id}`;
export function validateEditor(v:EditorMetadata|undefined){
 if(v===undefined)return;
 if(!v||!Array.isArray(v.groups)||v.groups.length>2000)throw Error('编辑分组数据无效');
 const ids=new Set<string>(),members=new Set<string>();
 for(const g of v.groups){if(!g||typeof g.id!=='string'||!g.id||g.id.length>256||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>100||!Array.isArray(g.members)||g.members.length>10000)throw Error('编辑分组名称或标识无效');ids.add(g.id);for(const k of g.members){if(typeof k!=='string'||!/^entity:[1-9]\d*$|^entry:[a-zA-Z0-9_-]+$/.test(k)||members.has(k))throw Error('编辑分组成员重复或无效');if(k.startsWith('entity:')&&Number(k.slice(7))>0xffffffff)throw Error('物件标识越界');members.add(k);}}
}
export function removeMembers(meta:EditorMetadata|undefined,keys:Set<ObjectKey>):EditorMetadata|undefined{return meta?{groups:meta.groups.map(g=>({...g,members:g.members.filter(k=>!keys.has(k))}))}:undefined;}
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
export function gameplayProject(p:EditorProject):EditorProject{const{editor,...rest}=p;return rest;}
export function gameplayWorld(w:WorldProject):WorldProject{const{editor,...map}=w.map;return{...w,map,levels:w.levels.map(l=>({...l,project:gameplayProject(l.project)}))};}

export function operationTargets(op:EditOp):number[]{return op.kind==='control'?op.ids:op.kind==='duplicate'?op.copies.map(c=>c.id):[op.id];}

export function removeWorldLevel(w:WorldProject,id:string){const removed=new Set(w.map.entries.filter(e=>e.levelId===id).map(e=>entryKey(e.id)));w.levels=w.levels.filter(l=>l.id!==id);w.map.entries=w.map.entries.filter(e=>e.levelId!==id);w.map.editor=removeMembers(w.map.editor,removed);return removed.size;}
export function reservedEntityIds(ops:EditOp[],existing:number[]=[]){const used=new Set(existing);for(const op of ops){used.add(op.id);if(op.kind==='clone')used.add(op.newId);if(op.kind==='duplicate')for(const c of op.copies)used.add(c.newId);if(op.kind==='prefab'&&op.assembly)for(let n=1;n<257;n++)used.add(op.id+n);}return used;}
