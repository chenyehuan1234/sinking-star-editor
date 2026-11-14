import React,{useState} from 'react';
import {Icon} from './studio-ui';
import {readPref,writePref} from './local-preferences';
export function PlayButton({disabled,onRun}:{disabled?:boolean;onRun:(temporary:boolean)=>void}){
 const[mode,setMode]=useState(()=>readPref('temporaryPlayAlpha3',false)),[open,setOpen]=useState(false);
 return <div className="s-play-split"><button className="s-play" disabled={disabled} title={mode?'临时试玩 · 退出后清理进度':'存档试玩 · 继续或新建测试档'} onClick={()=>onRun(mode)}><Icon name="play" size={14}/>{mode?'临时试玩':'试玩'}</button><button aria-label="选择试玩方式" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(v=>!v)}><Icon name="down" size={12}/></button>{open&&<div className="s-play-menu" onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>{[true,false].map(temp=><button key={String(temp)} aria-pressed={mode===temp} onClick={()=>{setMode(temp);writePref('temporaryPlayAlpha3',temp);setOpen(false);onRun(temp);}}><strong>{temp?'临时试玩':'存档试玩'}</strong><small>{temp?'从初始状态测试，退出后清理':'选择兼容测试档，保留进度'}</small></button>)}</div>}</div>;
}
