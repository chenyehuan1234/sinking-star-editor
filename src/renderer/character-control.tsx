import React,{useMemo}from'react';
import type{EditOp,EntityView}from'../shared';
import{characterControlId,characterGroups}from'../character-control';
import{CHARACTER_LABELS}from'../core/object-definitions';

const label=(e:EntityView)=>String(e.nativeProperties?.find(p=>p.field.name==='entity_name')?.value||`${CHARACTER_LABELS[e.mesh.replace(/_alt$/,'')]??'角色'}${e.mesh.endsWith('_alt')?' · 替换外观':''} #${String(e.id).slice(-4)}`);
export function CharacterControlInspector({entities,all,onApply,onSelect,onPick,onClone,busy}:{entities:EntityView[];all:EntityView[];onApply:(ops:EditOp[])=>void;onSelect?:(ids:number[])=>void;onPick:()=>void;onClone?:()=>void;busy:boolean}){
 const groups=useMemo(()=>characterGroups(all),[all]),byId=useMemo(()=>new Map(all.filter(e=>e.type==='Guy').map(e=>[e.id,e])),[all]);
 if(!entities.length||entities.some(e=>e.type!=='Guy'))return null;
 const ids=entities.map(e=>e.id),keys=new Set(entities.map(characterControlId)),related=groups.filter(g=>keys.has(g.key)),members=related.flatMap(g=>g.ids),singleGroup=keys.size===1;
 function change(targetId?:number){onApply([{kind:'control',id:ids[0],ids,targetId}]);}
 return <details className="s-inspector-section" open><summary>原生角色控制 <small>{singleGroup?`同组 ${members.length} 人`:'多个控制组'}</small></summary><p className="s-muted">原游戏按控制关联一起行动。外观相同不等于同组，切换外观不会自动改组。</p><label className="s-field">与现有角色同步<select aria-label="同步控制目标" value="" disabled={busy} onChange={e=>{if(e.target.value)change(Number(e.target.value));}}><option value="">选择控制组…</option>{groups.filter(g=>!singleGroup||g.key!==characterControlId(entities[0])).map(g=>{const actor=byId.get(g.anchorId??g.ids[0])!;return <option key={g.key} value={actor.id}>{label(actor)} · {g.ids.length} 人</option>;})}</select></label><div className="s-control-actions"><button disabled={busy} onClick={()=>change()}>各自独立</button><button disabled={busy||ids.length<2||singleGroup} onClick={()=>change(ids[0])}>所选同步为一组</button><button disabled={busy} onClick={onPick}>在场景中点选同步目标</button>{ids.length===1&&onClone&&<button disabled={busy} onClick={onClone}>复制为同步角色</button>}{onSelect&&<button disabled={busy} onClick={()=>onSelect(members)}>选中相关角色（{members.length}）</button>}</div><details><summary>组内成员与原生标识</summary>{related.map(g=><div key={g.key}><p className="s-muted">控制标识 #{g.key}{g.anchorId===undefined?' · 原主角色已不在本关，保留原生组标识':''}</p><ul className="s-control-members">{g.ids.slice(0,16).map(id=><li key={id}>{label(byId.get(id)!)}</li>)}{g.ids.length>16&&<li>另有 {g.ids.length-16} 人</li>}</ul></div>)}</details></details>;
}
