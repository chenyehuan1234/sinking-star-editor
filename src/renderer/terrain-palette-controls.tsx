import React,{useState} from 'react';
import type {TerrainPalette} from '../terrain-paint';
import {IconButton} from './studio-ui';

export function TerrainPaletteControls({defaults,brushColor,active,disabled,onTool,onColor,onDefaults}:
 {defaults:TerrainPalette;brushColor:string|null;active:boolean;disabled:boolean;onTool:()=>void;onColor:(color:string|null)=>void;onDefaults:(value:TerrainPalette)=>void}) {
 const [open,setOpen]=useState(false);
 return <div className="s-terrain-controls s-terrain-paint-toolbar">
   <IconButton icon="brush" label="地形配色" active={active||open} disabled={disabled} onClick={()=>setOpen(!open)}/>
   {active&&<><input type="color" aria-label="地形笔刷颜色" value={brushColor??'#b4875b'} onChange={e=>onColor(e.target.value)}/>
     <IconButton icon="refresh" label={brushColor===null?'改用自选刷色':'刷回默认色'} active={brushColor===null} onClick={()=>onColor(brushColor===null?'#b4875b':null)}/></>}
   {open&&<div className="s-terrain-popover s-terrain-palette">
     <strong>地形配色</strong>
     {(['floor','wall'] as const).map(key=><label key={key}>
       <span>{key==='floor'?'地板默认色':'墙面默认色'}</span>
       <input type="color" aria-label={key==='floor'?'地板默认色':'墙面默认色'} value={defaults[key]??'#84978b'}
         onChange={e=>onDefaults({...defaults,[key]:e.target.value})}/>
       <button type="button" disabled={!defaults[key]} aria-label={key==='floor'?'恢复地板默认色':'恢复墙面默认色'} onClick={()=>{
         const next={...defaults};
         delete next[key];
         onDefaults(next);
       }}>还原</button>
     </label>)}
     <button type="button" onClick={()=>{onTool();setOpen(false);}}>{active?'退出刷色':'局部刷色'}</button>
     <small>地板为顶面，墙面为侧面。局部刷色时，点一下或拖动框选同一平面。</small>
   </div>}
 </div>;
}
