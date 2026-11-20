import React,{useMemo,useState} from 'react';
import {Euler,MathUtils,Quaternion} from 'three';
import {nativeValue,type AssociationTarget} from '../association';
import type {ObjectCatalog,ObjectPreset} from '../catalog-types';
import {entryKey} from '../editor-organization';
import type {EntityView,Vec3,WorldEntry,WorldProject} from '../shared';
import {AssociationPicker} from './association-picker';
import {PointPickButton} from './point-picker';
import {BufferInput,InspectorDirections,InspectorObject,InspectorProfileButton,InspectorProfilePicker,InspectorTransform} from './studio-inspector';
import {Icon} from './studio-ui';
import './world-entry-inspector.css';

const zero:Vec3=[0,0,0],unit:Vec3=[1,1,1],identity:[number,number,number,number]=[0,0,0,1];
const displayNumber=(n:number)=>String(Number(n.toFixed(4)));
function angles(rotation:typeof identity):Vec3{
 const euler=new Euler().setFromQuaternion(new Quaternion(...rotation));
 return [euler.x,euler.y,euler.z].map(MathUtils.radToDeg) as Vec3;
}
function shape(p:ObjectPreset){
 const points=p.mesh.includes('_Hero_')?'十六芒星':p.mesh.includes('GAME_OVER_Entry_')?'八芒星':p.label;
 const state=p.mesh.includes('_Locked_')?'封闭':p.mesh.includes('_Available_')?'展开':'';
 const size=Number(p.values.size??0);
 return [points,state,size>0?displayNumber(size)+' 倍':''].filter(Boolean).join(' · ');
}

export function WorldEntryInspector({world,entry,entity,catalog,levels,targets,locked,onEdit,onTransform,onOpen,onDelete,onFolder,onEditorGroup,onGroups,locate,hover}:{
 world:WorldProject;entry:WorldEntry;entity?:EntityView;catalog:ObjectCatalog|null;
 levels:AssociationTarget[];targets:AssociationTarget[];locked:boolean;
 onEdit:(change:(entry:WorldEntry)=>void)=>void;onTransform:(changes:Pick<Partial<WorldEntry>,'rotation'|'scale'>&{position?:Vec3})=>void;
 onOpen:()=>void;onDelete:()=>void;onFolder:(id:string)=>void;
 onEditorGroup:(id:string)=>void;onGroups:()=>void;
 locate:(target:AssociationTarget)=>void;hover:(target?:AssociationTarget)=>void;
}){
 const [stylesOpen,setStylesOpen]=useState(false);
 const presets=useMemo(()=>catalog?.presets.filter(p=>p.type==='Level_Entry'&&p.parsed&&p.mesh)??[],[catalog]);
 const standard=presets.find(p=>p.mesh==='GAME_OVER_Entry_Locked_A'&&!Number(p.values.size??0))??presets.find(p=>p.mesh==='GAME_OVER_Entry_Locked_A');
 const current=entry.appearance?presets.find(p=>p.mesh===entity?.mesh):entry.prototype?presets.find(p=>p.template===entry.prototype?.template&&p.sourceId===entry.prototype?.sourceId)??presets.find(p=>p.mesh===entity?.mesh):standard;
 const position:Vec3=[entry.x,entry.y,entry.z??0],baseRotation=entity?.rotation??identity,baseScale=entity?.scale??unit;
 const rotation=angles(entry.rotation??baseRotation),scale=entry.scale??baseScale;
 const level=world.levels.find(l=>l.id===entry.levelId);
 const groups=world.map.editor?.groups??[],key=entryKey(entry.id),editorGroup=groups.find(group=>group.members.includes(key));
 const links=targets.filter(t=>t.key.startsWith('entry:')&&t.key!==key);
 const nativeGroups=targets.filter(t=>t.type==='Group');
 function applyStyle(p?:ObjectPreset){
  onEdit(e=>{delete e.appearance;e.prototype=p?{template:p.template,sourceId:p.sourceId}:undefined;});
  setStylesOpen(false);
 }
 return <InspectorObject disabled={locked} icon="entry" title="关卡入口" detail={level?.title??'未关联关卡'}>
  <label className="s-field">名称<BufferInput type="text" label="入口名称" value={entry.title} onCommit={title=>onEdit(e=>{e.title=title;})}/></label>
  <AssociationPicker label="入口目标关卡" items={levels} value={entry.levelId} allowClear={false} onChange={id=>onEdit(e=>{e.levelId=id;})}/>
  <div className="s-managed-entry-actions"><button className="s-text-button" disabled={!level} onClick={onOpen}><Icon name="cube"/>编辑目标关卡</button></div>
  <InspectorTransform value={(kind,i)=>displayNumber({position,rotation,scale}[kind][i])} integerPosition onCommit={(kind,i,text)=>{
   const value=Number(text);
   if(!Number.isFinite(value))return;
   if(kind==='position'){const next=[...position] as Vec3;next[i]=Math.round(value);onTransform({position:next});}
   else if(kind==='rotation'&&Math.abs(value)<=36000){const next=[...rotation] as Vec3;next[i]=value;onTransform({rotation:new Quaternion().setFromEuler(new Euler(...next.map(MathUtils.degToRad) as Vec3)).toArray()});}
   else if(kind==='scale'&&Math.abs(value)>=.0001&&Math.abs(value)<=10000){const next=[...scale] as Vec3;next[i]=value;onTransform({scale:next});}
  }} point={<PointPickButton label="入口位置" value={position} integer disabled={locked} onCommit={position=>onTransform({position})}/>}
   direction={<InspectorDirections disabled={locked} active={angle=>Math.abs((((rotation[2]-angle)%360)+540)%360-180)<.1}
    onChange={angle=>onTransform({rotation:new Quaternion().setFromEuler(new Euler(0,0,MathUtils.degToRad(angle))).toArray()})}/>}/>
  <details open className="s-inspector-section"><summary>原版配置</summary>
   <InspectorProfileButton preset={current} icon="entry" ariaLabel="选择入口原生样式" expanded={stylesOpen}
    title={entry.appearance?'复制的原生样式':current?shape(current):'默认原生入口'} caption="点击更换入口外观" onClick={()=>setStylesOpen(v=>!v)}/>
   <label className="s-field">入口大小<BufferInput label="入口大小" step="0.05" value={displayNumber(entry.size??Number(nativeValue(entity,'size')??current?.values.size??0))} onCommit={text=>{const size=Number(text);if(size>=0&&size<=10000)onEdit(e=>{e.size=size;});}}/></label>
   {entry.size!==undefined&&<button className="s-text-button" onClick={()=>onEdit(e=>{delete e.size;})}>沿用样式大小</button>}
  </details>
  <details open className="s-inspector-section"><summary>分组</summary>
   <label className="s-field">目标关卡分组<select aria-label="目标关卡分组" value={level?.folderId??''} disabled={!level} onChange={e=>onFolder(e.target.value)}><option value="">未分组</option>{world.levelGroups?.map(group=><option key={group.id} value={group.id}>{group.title}</option>)}</select></label>
   <div className="s-field"><span>编辑分组</span><div className="s-association-row"><select aria-label="入口编辑分组" value={editorGroup?.id??''} onChange={e=>onEditorGroup(e.target.value)}><option value="">未分组</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select><button type="button" onClick={onGroups}>管理</button></div></div>
   <details><summary>原生分组</summary><p className="s-muted">关联后由这个原生分组控制入口的存在状态或变换。</p><AssociationPicker label="入口原生分组" items={nativeGroups} value={entry.nativeGroupId?'entity:'+entry.nativeGroupId:''} onLocate={locate} onHover={hover} onChange={id=>onEdit(e=>{e.nativeGroupId=id?Number(id.slice(7)):undefined;})}/></details>
  </details>
  <details className="s-inspector-section"><summary>解锁条件</summary>
   <label className="s-switch-row">任一条件满足<input type="checkbox" checked={entry.unlockAny??false} onChange={event=>{const value=event.target.checked;onEdit(e=>{e.unlockAny=value;});}}/></label>
   {[0,1,2].map(i=><AssociationPicker key={i} label={'入口解锁条件 '+(i+1)} items={links} value={entry.unlocks?.[i]?entryKey(entry.unlocks[i]!):''}
    onChange={id=>onEdit(e=>{const values:NonNullable<WorldEntry['unlocks']>=[...(e.unlocks??[])];values[i]=id?id.slice(6):null;e.unlocks=values;})} onLocate={locate} onHover={hover}/>)}
  </details>
  <button className="s-text-button danger" onClick={onDelete}><Icon name="trash"/>删除入口</button>
  {stylesOpen&&!locked&&<InspectorProfilePicker type="Level_Entry" catalog={catalog} onClose={()=>setStylesOpen(false)} onChoose={applyStyle}>
   <button className="s-text-button" type="button" onClick={()=>applyStyle()}>采用默认原生样式</button>
  </InspectorProfilePicker>}
 </InspectorObject>;
}
