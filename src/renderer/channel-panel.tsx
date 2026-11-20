import React,{useEffect,useMemo,useState} from 'react';
import {matchesAssociation,parseChannel,type AssociationTarget} from '../association';
import type {EditOp} from '../shared';
import {AssociationPicker} from './association-picker';
import {channelHue} from './scene-display';
import {IconButton} from './studio-ui';
import {VirtualList} from './virtual-list';

export type ChannelMember=AssociationTarget&{id:number;channel:string};
export interface ChannelProposal {ops:EditOp[];channel:string}

export function ChannelPanel({members,selection,busy,locate,highlight,focusGroup,apply,confirm}:{
 members:ChannelMember[];selection:number[];busy:boolean;
 locate:(target:AssociationTarget)=>void;highlight:(target?:AssociationTarget)=>void;focusGroup:(targets:ChannelMember[])=>void;
 apply:(ops:EditOp[])=>void;confirm:(proposal:ChannelProposal)=>void;
}){
 const [query,setQuery]=useState(''),[chosen,setChosen]=useState(''),[name,setName]=useState(''),[error,setError]=useState('');
 const groups=useMemo(()=>{
  const map=new Map<string,ChannelMember[]>();
  for(const member of members){let group=map.get(member.channel);if(!group)map.set(member.channel,group=[]);group.push(member);}
  return map;
 },[members]);
 const selected=members.filter(m=>selection.includes(m.id)),selectedChannel=selected[0]?.channel;
 useEffect(()=>{if(selectedChannel!==undefined){setChosen(selectedChannel);setName(selectedChannel);setQuery('');}},[selectedChannel]);
 const current=groups.get(chosen)??[],channelRows=[...groups].map(([key,m])=>({key,title:'频道 '+key,detail:m.filter(e=>e.type==='Switch').length+' 开关 · '+m.filter(e=>e.type==='Gate').length+' 门闸'}));
 const filtered=channelRows.filter(row=>matchesAssociation(row,query)||groups.get(row.key)?.some(member=>matchesAssociation(member,query)));
 function selectChannel(key:string){setChosen(key);setName(key);setError('');}
 function assign(items:ChannelMember[],raw:string){
  try{
   const channel=parseChannel(raw);
   const ops=items.filter(item=>item.channel!==channel).map(item=>({kind:'properties' as const,id:item.id,values:{flavor:channel}}));
   setError('');
   if(!ops.length)return;
   if(groups.has(channel))confirm({ops,channel});else apply(ops);
   selectChannel(channel);
  }catch(e){setError(String(e).replace(/^Error: /,''));}
 }
 function create(){
  let next=1;
  while(groups.has(String(next)))next++;
  assign(selected,String(next));
 }
 return <div className="s-channel-panel">
  <label className="s-field">搜索频道或机关<input aria-label="搜索频道或机关" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  {filtered.length?<VirtualList label="场景频道" items={filtered} height={172} revealIndex={filtered.findIndex(row=>row.key===chosen)} render={row=><button className={'s-relation-row '+(chosen===row.key?'active':'')} onClick={()=>selectChannel(row.key)}>
   <i style={{background:'hsl('+channelHue(row.key)+' 55% 65%)'}}/><span>{row.title}</span><small>{row.detail}</small>
  </button>}/>:<p className="s-muted">没有匹配的频道。</p>}
  {!!current.length&&<>
   <div className="s-channel-actions"><button onClick={()=>focusGroup(current)}>定位整个频道</button></div>
   <VirtualList label="频道成员" items={current} height={156} revealIndex={current.findIndex(m=>selection.includes(m.id))} render={member=><div className="s-channel-member">
    <button onClick={()=>highlight(member)} onDoubleClick={()=>locate(member)} title={member.detail}>{member.title} · #{member.id}</button>
    <IconButton icon="eye" label={'定位 '+member.title} onClick={()=>locate(member)}/>
   </div>}/>
   <div className="s-channel-actions"><input aria-label="频道新编号" value={name} inputMode="numeric" onChange={e=>setName(e.target.value)}/><button disabled={busy||!name.trim()||chosen===name.trim()} onClick={()=>assign(current,name)}>整组改号</button></div>
  </>}
  {!!selected.length&&selection.length===selected.length&&<>
   <AssociationPicker label="所选机关移入频道" items={channelRows} value="" empty="选择已有频道" allowClear={false} disabled={busy} onChange={key=>assign(selected,key)}/>
   <button className="s-text-button" disabled={busy} onClick={create}>为所选建立独立频道</button>
  </>}
  {error&&<p className="s-error" role="alert">{error}</p>}
 </div>;
}
