import {freezerConditions,isFreezerCondition} from '../association';
import type {EntityFile} from './entities';

export const entryReferenceKey=(entityId:number,field:string)=>entityId+':'+field;

export function resolveManagedEntry(file:EntityFile,entityId:number,field:string,target:string){
 if(!isFreezerCondition(field)||!file.managedEntryIds)throw Error('此场景不支持自制大地图入口引用');
 const id=file.managedEntryIds.get(target);
 if(id)return id;
 (file.missingEntryTargets??=new Map()).set(entryReferenceKey(entityId,field),target);
 return 0;
}

export function copyMissingEntryReferences(file:EntityFile,sourceId:number,newId:number){
 const missing=file.missingEntryTargets;
 if(!missing)return;
 for(const field of freezerConditions){
  const key=missing.get(entryReferenceKey(sourceId,field));
  if(key)missing.set(entryReferenceKey(newId,field),key);
 }
}

export function missingEntryMessages(file:EntityFile){
 return [...(file.missingEntryTargets??[])].map(([key,target])=>{
  const [id,field]=key.split(':');
  const number=field==='unlocked_by_id'?1:Number(field.at(-1));
  return '冰封屏障 #'+id+' 的解冻条件 '+number+' 引用的关卡入口已删除（'+target+'）';
 });
}
