import{copiedControlValues}from'./character-control';
import {parseEntities,type EntityFile,type EntityRecord} from './entities';
import {GamePackage} from './package';import {PropertyCodec,type PropertyValue} from './properties';
import {objectFields,nativeFieldDefault} from './object-catalog';import {transform} from './mechanisms';
import type {DuplicateOp,ProfileOp} from '../shared';
import {profileField} from '../profile-metadata';
export {PROFILE_FIELDS,profileField} from '../profile-metadata';
export function applyProfile(pkg:GamePackage,c:PropertyCodec,target:EntityRecord,op:ProfileOp){
  const source=parseEntities(pkg.get(`data-common/${op.template}.entities`)).records.find(r=>r.id===op.sourceId);
  if(!source||source.type!==target.type||!c.parse(source).complete)throw new Error('只能切换同类对象的完整原版配置');
  const values:Record<string,PropertyValue>={};
  for(const f of objectFields(c,target.type))if(f.access==='design'&&profileField(target.type,f.name))values[f.name]=c.get(source,f.name,f.name==='materials'?[]:nativeFieldDefault(target.type,f.name,f.kind));
  return c.patch(target,values);
}
export function duplicateRecords(c:PropertyCodec,f:EntityFile,op:DuplicateOp){
  const ids=new Map(op.copies.map(p=>[p.id,p.newId]));const used=new Set(f.records.map(r=>r.id));
  if(ids.size!==op.copies.length||new Set(ids.values()).size!==ids.size||[...ids.values()].some(id=>used.has(id)))throw new Error('复制对象 ID 冲突');
  const snapshots=op.copies.map(p=>{const r=f.records.find(r=>r.id===p.id);if(!r||!c.parse(r).complete||!objectFields(c,r.type).length)throw new Error('复制源不存在或不能编辑');return r;});
  const occupied=new Set(f.records.filter(r=>['Switch','Gate'].includes(r.type)).map(r=>Number(c.get(r,'flavor')))),channels=new Map<number,number>();
  if(op.associations==='independent')for(const r of snapshots.filter(r=>['Switch','Gate'].includes(r.type))){const old=Number(c.get(r,'flavor'));if(!channels.has(old)){let n=1;while(occupied.has(n))n++;channels.set(old,n);occupied.add(n);}}
  const controls=copiedControlValues(c,snapshots,ids,op.associations==='independent');
  for(const r of snapshots){const refs:Record<string,PropertyValue>={entity_name:''};for(const p of c.parse(r).fields){if(op.associations==='independent'&&p.schema.pid&&!['turn_order_id','transmute_stashed_turn_order_id'].includes(p.schema.name)&&Number(p.value)&&!ids.has(Number(p.value)))(f.analysisWarnings??=[]).push({entityId:ids.get(r.id)!,field:p.schema.name,message:'复制时清除了外部关联 '+p.schema.name+'，请重新关联或确认无需使用'});if(p.schema.pid&&(ids.has(Number(p.value))||op.associations==='independent'))refs[p.schema.name]=ids.get(Number(p.value))??0;if(p.schema.pidArray)refs[p.schema.name]=(p.value as number[]).flatMap(id=>ids.has(id)?[ids.get(id)!]:op.associations==='independent'?[]:[id]);}
    Object.assign(refs,controls.get(r.id));
    if(channels.has(Number(c.get(r,'flavor')))&&['Switch','Gate'].includes(r.type))refs.flavor=channels.get(Number(c.get(r,'flavor')))!;
    const position=['x','y','z'].map((a,i)=>Number(c.get(r,'position.'+a))+op.offset[i])as[number,number,number];f.records.push({...c.patch(transform(c,r,position),refs),id:ids.get(r.id)!});
  }
}
