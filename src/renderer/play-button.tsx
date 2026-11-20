import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './studio-ui';
import './alpha3.css';

export function PlayButton({disabled,onRun,onFresh}:{disabled?:boolean;onRun:()=>void;onFresh?:()=>void}){
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    window.addEventListener('pointerdown',dismiss,true);
    return()=>window.removeEventListener('pointerdown',dismiss,true);
  },[open]);
  return <div ref={root} className="s-play-split" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}
    onKeyDown={event=>{if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false);toggle.current?.focus();}}}>
    <button type="button" className="s-play" disabled={disabled} title="继续试玩所选范围" onClick={()=>{setOpen(false);onRun();}}><Icon name="play" size={14}/>试玩</button>
    {onFresh&&<button type="button" ref={toggle} aria-label="选择试玩方式" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(v=>!v)}><Icon name="down" size={12}/></button>}
    {open&&!disabled&&onFresh&&<div className="s-play-menu"><button type="button" onClick={()=>{setOpen(false);onFresh();}}><strong>从头试玩整个工程</strong><small>清空本次试玩的通关和地图进度</small></button></div>}
  </div>;
}
