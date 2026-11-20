import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {matchesAssociation,type AssociationTarget} from '../association';
import {IconButton} from './studio-ui';
import {VirtualList} from './virtual-list';
import './associations.css';

export function AssociationPicker({label,items,value,onChange,onLocate,onHover,onPick,allowClear=true,disabled=false,defaultOpen=false,missing,empty='无关联'}:{
 label:string;items:AssociationTarget[];value:string;onChange:(key:string)=>void;
 onLocate?:(target:AssociationTarget)=>void;onHover?:(target?:AssociationTarget)=>void;
 onPick?:()=>void;allowClear?:boolean;disabled?:boolean;defaultOpen?:boolean;missing?:string;empty?:string;
}){
 const [open,setOpen]=useState(defaultOpen),[query,setQuery]=useState(''),[cursor,setCursor]=useState(0);
 const root=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null),id=useId();
 const current=items.find(item=>item.key===value),invalid=!!missing||!!value&&value!=='mixed'&&!current;
 const filtered=useMemo(()=>open?items.filter(item=>matchesAssociation(item,query)):[],[open,items,query]);
 function close(restore=false){setOpen(false);onHover?.();if(restore)button.current?.focus();}
 function choose(key:string){onChange(key);close(true);}
 useEffect(()=>{
  if(!open)return;
  search.current?.focus();
  const down=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};
  window.addEventListener('pointerdown',down,true);
  return()=>{window.removeEventListener('pointerdown',down,true);onHover?.();};
 },[open]);
 return <div className="s-field s-association-field" ref={root}>
  <span>{label}</span>
  <div className="s-association-row">
   <button ref={button} type="button" aria-label={label} aria-expanded={open} aria-controls={open?id:undefined} title={current?.detail} className={invalid?'danger':''} disabled={disabled} onClick={()=>{if(open)close();else{setQuery('');setCursor(0);setOpen(true);}}}>
    {current?.title??(missing?'入口已删除 · '+missing:value==='mixed'?'不同值':value?'目标缺失 · '+value:empty)}
   </button>
   {onPick&&<IconButton icon="target" label={'在画布点选'+label} disabled={disabled} onClick={()=>{close();onPick();}}/>}
   {current&&onLocate&&<IconButton icon="eye" label={'定位'+label} onClick={()=>{close();onLocate(current);}}/>}
   {allowClear&&(value||missing)&&<IconButton icon="close" label={'解除'+label} disabled={disabled} onClick={()=>choose('')}/>}
  </div>
  {open&&!disabled&&<div id={id} className="s-association-list" onMouseLeave={()=>onHover?.()}>
   <input ref={search} aria-label={'搜索'+label} placeholder={'搜索'+label} value={query} onChange={e=>{setQuery(e.target.value);setCursor(0);}} onKeyDown={e=>{
    if(e.nativeEvent.isComposing)return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setCursor(n=>Math.max(0,Math.min(filtered.length-1,n+(e.key==='ArrowDown'?1:-1))));}
    if(e.key==='Enter'&&filtered[cursor]){e.preventDefault();choose(filtered[cursor].key);}
   }}/>
   {filtered.length?<VirtualList label={label+'候选'} items={filtered} rowHeight={42} height={220} revealIndex={cursor} render={(target,index)=><button className={'s-association-option '+(index===cursor?'active':'')} type="button" title={target.detail} onMouseEnter={()=>onHover?.(target)} onFocus={()=>onHover?.(target)} onClick={()=>choose(target.key)}>
    <strong>{target.title}</strong>{target.detail&&<small>{target.detail}</small>}
   </button>}/>:<small>没有匹配目标。</small>}
  </div>}
 </div>;
}
