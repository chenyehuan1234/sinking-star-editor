import React,{useState} from 'react';
import {freezerConditions,freezerTargetTypes,isFreezerCondition,nativeValue,type AssociationTarget} from '../association';
import type {ObjectField} from '../catalog-types';
import type {EntityView,LevelView} from '../shared';
import {AssociationPicker} from './association-picker';

export interface ReferenceControls {
 targets:AssociationTarget[];
 levels:AssociationTarget[];
 locate:(target:AssociationTarget)=>void;
 hover:(target?:AssociationTarget)=>void;
 change:(field:string,ids:number[],key:string)=>void;
 pick:(field:string,ids:number[],advanced?:boolean)=>void;
}

export function ReferenceField({field,entities,level,controls,label,advanced=false,busy=false}:{
 field:ObjectField;entities:EntityView[];level?:LevelView|null;controls:ReferenceControls;
 label?:string;advanced?:boolean;busy?:boolean;
}){
 const ids=entities.map(e=>e.id);
 const keys=entities.map(e=>{
  const raw=Number(nativeValue(e,field.name)??0);
  if(!raw)return '';
  const managed=Object.entries(level?.managedEntryIds??{}).find(([,id])=>id===raw)?.[0];
  return managed?'entry:'+managed:'entity:'+raw;
 });
 const missingValues=entities.map(e=>level?.missingEntryTargets?.[e.id+':'+field.name]??'');
 const mixed=keys.some(key=>key!==keys[0])||missingValues.some(value=>value!==missingValues[0]),value=mixed?'mixed':keys[0]??'';
 const types=entities[0]?.type==='Freezer'&&isFreezerCondition(field.name)?advanced?freezerTargetTypes:['Level_Entry']:field.targets;
 const items=controls.targets.filter(target=>(!types||types.includes(target.type??''))&&!ids.some(id=>'entity:'+id===target.key));
 const existing=controls.targets.find(t=>t.key===value);
 if(existing&&!items.includes(existing))items.unshift(existing);
 return <AssociationPicker label={label??field.label} items={items} value={value} missing={mixed?undefined:missingValues[0]} disabled={busy}
  onChange={key=>controls.change(field.name,ids,key)} onLocate={controls.locate} onHover={controls.hover} onPick={()=>controls.pick(field.name,ids,advanced)}/>;
}

const freezerHelp:Record<string,string>={
 fast_unfreeze:'加快解冻过程。',
 disappear_to_nothing:'条件满足后移除屏障，可用来打开道路。',
 hide_requirements:'隐藏条件提示，仍按原规则解冻。',
 partial_solve_count:'原作的阶段完成记录。普通通关条件沿用默认值。',
 judge_unlock_level:'只有关联剧情判定器才用这个值。判定器至少推进到此阶段，条件才满足。'
};

export function FreezerReferences({entities,level,controls,fields,busy,onRule,renderField}:{
 entities:EntityView[];level?:LevelView|null;controls:ReferenceControls;fields:ObjectField[];busy:boolean;
 onRule:(value:boolean)=>void;renderField:(field:ObjectField)=>React.ReactNode;
}){
 const [advanced,setAdvanced]=useState(false);
 const modes=entities.map(e=>Boolean(nativeValue(e,'unlock_is_or_gate'))),mode=modes.every(v=>v===modes[0])?(modes[0]?'any':'all'):'mixed';
 const conditions=freezerConditions.flatMap((name,index)=>{
  const field=fields.find(f=>f.name===name);
  return field?[{field,index,filled:entities.some(e=>!!nativeValue(e,name)||level?.missingEntryTargets?.[e.id+':'+name])}]:[];
 });
 const next=conditions.find(item=>!item.filled);
 const showJudge=entities.some(e=>freezerConditions.some(field=>{
  const raw=Number(nativeValue(e,field));
  return controls.targets.some(target=>target.key==='entity:'+raw&&target.type==='Judge');
 }))||entities.some(e=>Number(nativeValue(e,'judge_unlock_level'))>0);
 const render=(names:string[])=>names.flatMap(name=>{
  const field=fields.find(f=>f.name===name);
  return field?[<div className="s-freezer-field" key={name}>{renderField(field)}<small className="s-association-note">{freezerHelp[name]}</small></div>]:[];
 });
 return <details className="s-inspector-section" open>
  <summary>解冻条件</summary>
  <label className="s-field">满足方式<select aria-label="解冻条件满足方式" value={mode} onChange={e=>onRule(e.target.value==='any')}>
   {mode==='mixed'&&<option value="mixed" disabled>不同值</option>}<option value="all">全部满足</option><option value="any">任一满足</option>
  </select></label>
  {conditions.filter(item=>item.filled||item===next).map(({field,index,filled})=><ReferenceField key={field.name} label={(filled?'':'添加')+'解冻条件 '+(index+1)} field={field} entities={entities} level={level} controls={controls} busy={busy} advanced={advanced}/>)}
  {!controls.targets.some(t=>t.type==='Level_Entry')&&<p className="s-muted">按关卡通关解冻时，请先在大地图放置该关入口。</p>}
  {render(['disappear_to_nothing','fast_unfreeze','hide_requirements'])}
  <details onToggle={e=>setAdvanced(e.currentTarget.open)}><summary>原版高级条件</summary>
   <p className="s-muted">展开后可选原生标记、牌子和剧情判定器。普通通关条件选择小关入口即可。</p>
   {render(['partial_solve_count',...(showJudge?['judge_unlock_level']:[])])}
  </details>
 </details>;
}
