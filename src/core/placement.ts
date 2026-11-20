import {parseEntities,type EntityFile,type EntityRecord} from './entities';
import {PropertyCodec,type PropertyValue} from './properties';
import {GamePackage} from './package';
import {OBJECT_BY_TYPE} from './object-definitions';
import {validateNativeProperties} from './object-catalog';
import {transform} from './mechanisms';
import type {PrefabOp} from '../shared';

export function editableType(type:string){const d=OBJECT_BY_TYPE.get(type);return Boolean(d&&!['internal','excluded'].includes(d.placement));}
export function independentFreezer(c:PropertyCodec,r:EntityRecord){
  if(r.type!=='Freezer'||Number(c.get(r,'group_id'))!==0)return r;
  const flags=BigInt(String(c.get(r,'entity_flags')));
  if(!flags)return r;
  const type=c.reflection.flatten('Undoable_Entity_Data').find(f=>f.name==='entity_flags')?.type;
  if(!type)return r;
  const groupState=c.reflection.enumValues(type).reduce((mask,flag)=>{
    return ['PLAYABLE_IN_PRELUDE','IN_EXISTENCE_GROUP','CURRENTLY_EXISTS','EXISTS_FOR_COSMETIC_TRANSITION_PURPOSES_ONLY','EXISTS_FOR_COSMETIC_GROUP_FADE_TRANSITION_ONLY'].includes(flag.name)
      ?mask|BigInt(flag.value):mask;
  },0n);
  const next=flags&~groupState;
  return next===flags?r:c.patch(r,{entity_flags:next.toString()});
}
export function placeNative(pkg:GamePackage,c:PropertyCodec,f:EntityFile,op:PrefabOp){
  const source=parseEntities(pkg.get(`data-common/${op.template}.entities`)),root=source.records.find(r=>r.id===op.sourceId);
  if(!root||!editableType(root.type)||!c.parse(root).complete)throw new Error('该对象尚不能独立解析，请使用它的原版关卡模板');
  const selected=new Map<number,EntityRecord>([[root.id,root]]);
  if(op.assembly){
    for(const r of selected.values()){
      for(const field of c.parse(r).fields){
        if((!field.schema.pid&&!field.schema.pidArray)||['group_id','riding_on_id'].includes(field.schema.name))continue;
        for(const target of field.schema.pidArray?field.value as number[]:[field.value]){const dep=source.records.find(r=>r.id===Number(target));if(dep&&editableType(dep.type)&&c.parse(dep).complete)selected.set(dep.id,dep);}
      }
      if(selected.size>256)throw new Error('关联组合超过 256 个对象，请直接添加原版模板并在其中编辑');
    }
  }
  const used=new Set(f.records.map(r=>r.id)),ids=new Map<number,number>();let next=op.id;
  for(const r of selected.values()){if(used.has(next))throw new Error('新增组合 ID 冲突');ids.set(r.id,next);used.add(next);do{next++;}while(used.has(next));if(next>0xffffffff)throw new Error('实体 ID 超出范围');}
  const origin=['x','y','z'].map(a=>Number(c.get(root,'position.'+a)));
  for(const r of selected.values()){
    const clear:Record<string,PropertyValue>={entity_name:''};
    for(const field of c.parse(r).fields)if(field.schema.pid)clear[field.schema.name]=ids.get(Number(field.value))??0;
    else if(field.schema.pidArray)clear[field.schema.name]=(field.value as number[]).flatMap(n=>ids.has(n)?[ids.get(n)!]:[]);
    if(op.standaloneFreezer&&r===root&&r.type==='Freezer')Object.assign(clear,{judge_unlock_level:0,partial_solve_count:-1,unfrozen:false,unlock_is_or_gate:false,hide_requirements:false,fast_unfreeze:false,disappear_to_nothing:false});
    let out=c.patch(r,clear);
    const p=['x','y','z'].map((a,i)=>Number(c.get(r,'position.'+a))-origin[i]+op.position[i])as[number,number,number];
    out={...transform(c,out,p),id:ids.get(r.id)!,typeIndex:f.types.indexOf(r.type)};
    if(out.typeIndex<0)throw new Error('当前实体类型表不支持此对象');
    if(r===root&&op.values){validateNativeProperties(c,r.type,op.values);out=c.patch(out,op.values);}
    if(op.standaloneFreezer&&r===root)out=independentFreezer(c,out);
    f.records.push(out);
  }
}
