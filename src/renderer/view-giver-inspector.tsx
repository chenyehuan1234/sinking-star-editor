import React from 'react';
import type {EntityView,LevelView,ViewGiverLinkRequest} from '../shared';
import {IconButton} from './studio-ui';

export function ViewGiverInspector({entities,level,busy,onLink,onEdit}:{entities:EntityView[];level:LevelView;busy:boolean;onLink:(r:ViewGiverLinkRequest)=>void;onEdit?:(id:number)=>void}){
 const cameras=level.camera?.controls??[];
 function selector(slot:ViewGiverLinkRequest['slot'],label:string){
  const field=slot==='view'?'viewpoint_name':slot==='overview'?'map_overview_id':'map_overview_id_2';
  const values=entities.map(e=>e.nativeProperties?.find(p=>p.field.name===field)?.value??(slot==='view'?'':0));
  const mixed=values.some(v=>v!==values[0]),raw=values[0];
  const matches=slot==='view'?cameras.filter(c=>!c.primary&&!c.overview&&c.name===raw):cameras.filter(c=>c.overview&&c.id===Number(raw));
  const empty=slot==='view'?!raw:!Number(raw),target=matches.length===1?matches[0]:null,value=mixed?'mixed':empty?'0':target?String(target.id):'unresolved';
  const groups=slot==='view'?[['aux','辅助视角'],['main','从正常游玩镜头复制辅助视角']]:[['overview','地图总览']];
  return <div className="s-field" key={slot}><label htmlFor={'scroll-camera-'+slot}>{label}</label><div className="s-reference"><select id={'scroll-camera-'+slot} aria-label={'卷轴'+label} disabled={busy} value={value} onChange={e=>onLink({ids:entities.map(e=>e.id),slot,cameraId:Number(e.target.value)})}>
   {mixed&&<option value="mixed" disabled>不同值</option>}{!mixed&&!empty&&!target&&<option value="unresolved" disabled>{matches.length>1?'同名镜头不唯一':'未找到镜头'} · {String(raw)}</option>}<option value="0">不关联</option>
   {groups.map(([kind,name])=>{const items=cameras.filter(c=>kind==='overview'?c.overview:!c.overview&&c.primary===(kind==='main'));return items.length?<optgroup key={kind} label={name}>{items.map(c=><option key={c.id} value={c.id}>{c.name} · #{c.id}</option>)}</optgroup>:null;})}
  </select>{target&&onEdit&&<IconButton icon="eye" label={'编辑卷轴'+label+'镜头'} disabled={busy} onClick={()=>onEdit(target.id)}/>}</div></div>;
 }
 return <details className="s-inspector-section" open><summary>卷轴镜头关联</summary>{selector('view','额外视角')}<p className="s-muted">选择正常游玩镜头时会复制为辅助视角，保留原主镜头。玩家取得卷轴后，用游戏的切换视角操作查看。</p>{selector('overview','地图总览')}{selector('overview2','第二地图总览')}<p className="s-muted">总览两项按需选择；普通俯视／侧视只需设置“额外视角”。</p></details>;
}
