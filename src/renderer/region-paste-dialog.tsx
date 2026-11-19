import React,{useState} from 'react';
import type {RegionBundle,RegionPasteOptions,Vec3} from '../shared';
import {Modal} from './studio-ui';
import {regionPoint} from '../region-placement';
import {cellKey} from '../world-space';

interface PasteDialogProps {
  bundle:RegionBundle;
  initial:Vec3;
  yaw:number;
  world:boolean;
  expanding:(at:Vec3,yaw:number)=>string;
  targets:{id:string;title:string;position:Vec3}[];
  targetChannels:string[];
  busy:boolean;
  error:string;
  onClose:()=>void;
  onPaste:(at:Vec3,yaw:number,options:RegionPasteOptions)=>void;
}

export function RegionPasteDialog({bundle,initial,yaw,world,expanding,targets,targetChannels,busy,error,onClose,onPaste}:PasteDialogProps){
  const [coordinates,setCoordinates]=useState(initial.map(String));
  const [angle,setAngle]=useState((yaw%360+360)%360);
  const [options,setOptions]=useState<RegionPasteOptions>({expand:false,skipConflicts:false,includeDependencies:false,unlocks:{}});
  const transfer=bundle.transfer!;
  const sharedChannels=transfer.channels?.filter(channel=>targetChannels.includes(channel))??[];
  const at=coordinates.map(Number) as Vec3;
  const valid=coordinates.every((value,i)=>value.trim()&&Number.isInteger(at[i]));
  const occupied=new Set(targets.map(target=>cellKey(target.position.map(Math.round) as Vec3)));
  const collisions=(world&&valid?transfer.entries:[]).filter(e=>{
    const key=cellKey(regionPoint(e.position,at,angle).map(Math.round) as Vec3);
    if(occupied.has(key))return true;
    occupied.add(key);
    return false;
  });
  const conflicts=new Set(collisions.map(e=>e.id));
  const entries=world?transfer.entries.filter(e=>!options.skipConflicts||!conflicts.has(e.id)):[];
  const ids=new Set(entries.map(e=>e.id)),enteredLevels=new Set(entries.map(e=>e.levelId));
  const dependencies=transfer.levels.filter(level=>!enteredLevels.has(level.id));
  const outside=entries.flatMap(e=>e.unlocks.flatMap((id,slot)=>id&&!ids.has(id)?[{id,key:e.id+':'+slot,title:e.title}]:[]));
  const expansion=valid?expanding(at,angle):'';
  const ready=valid&&!busy&&(!expansion||options.expand)&&(!collisions.length||options.skipConflicts)&&outside.every(r=>options.unlocks[r.key]!==undefined);
  return <Modal title="粘贴区域" onClose={onClose}>
    <div className="s-workshop s-inspector-scroll">
      <p>{transfer.size.join(' × ')} 格 · {bundle.terrain.length} 地形格 · {bundle.records.length} 个物件 · {entries.length} 个入口</p>
      {!world&&transfer.entries.length>0&&<p>小关将跳过 {transfer.entries.length} 个大世界入口。</p>}
      <div className="s-map-size">
        {['X','Y','Z'].map((axis,i)=><label key={axis} className="s-field">{axis}<input type="number" aria-label={'粘贴坐标 '+axis} value={coordinates[i]} onChange={e=>setCoordinates(c=>c.map((v,j)=>j===i?e.target.value:v))}/></label>)}
      </div>
      <label className="s-field">旋转<select value={angle} onChange={e=>setAngle(Number(e.target.value))}>{[0,90,180,270].map(n=><option key={n} value={n}>{n}°</option>)}</select></label>
      {expansion&&<label><input type="checkbox" checked={options.expand} onChange={e=>setOptions({...options,expand:e.target.checked})}/> {expansion}</label>}
      {sharedChannels.length>0&&<p>当前视野已有同频道机关 · {sharedChannels.slice(0,12).join('、')}{sharedChannels.length>12?'…':''}</p>}
      {collisions.length>0&&<p className="s-error">入口重合 · {collisions.map(e=>e.title).join('、')}</p>}
      {entries.length>0&&<div>
        <p>将复制 {enteredLevels.size} 个入口小关。</p>
        {dependencies.length>0&&<details><summary>另外 {dependencies.length} 个依赖关卡</summary>
          <ul>{dependencies.map(l=><li key={l.id}>{l.title}</li>)}</ul>
          <label><input type="checkbox" checked={options.includeDependencies} onChange={e=>setOptions({...options,includeDependencies:e.target.checked})}/> 一起复制依赖关卡</label>
        </details>}
        {transfer.links.filter(link=>!link.targetId).map(link=><p key={link.levelId+':'+link.doorId+':'+link.field}>待核对的出口／序列目标 · {link.target}</p>)}
      </div>}
      {outside.map(r=><label className="s-field" key={r.key}>{r.title} · 框外解锁入口 #{r.id}
        <select value={options.unlocks[r.key]??'pending'} onChange={e=>{
          const next={...options.unlocks};
          if(e.target.value==='pending')delete next[r.key];else next[r.key]=e.target.value;
          setOptions({...options,unlocks:next});
        }}><option value="pending">请选择处理方式</option><option value="">解除此条件</option>{targets.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select>
      </label>)}
      <label><input type="checkbox" checked={options.skipConflicts} onChange={e=>setOptions({...options,skipConflicts:e.target.checked})}/> 跳过重合入口及冲突水格</label>
      {error&&<p role="alert" className="s-error">{error}</p>}
      <div className="s-perf-actions"><button type="button" disabled={!ready} onClick={()=>onPaste(at,angle,options)}>确认粘贴</button><button type="button" onClick={onClose}>返回画布</button></div>
    </div>
  </Modal>;
}
