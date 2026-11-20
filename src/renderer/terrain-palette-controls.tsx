import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {TerrainPalette,TerrainPlacementKind} from '../terrain-paint';
import {Icon,IconButton} from './studio-ui';

export const terrainPlacementNames={floor:'地板',wall:'墙体'} as const;
const neutralColor='#84978b';

export interface TerrainCardColors {
  placement:TerrainPalette;
  defaults:TerrainPalette;
  unavailable?:string;
  onPlacement:(kind:TerrainPlacementKind,color?:string)=>void;
  onBrush:(kind:TerrainPlacementKind)=>void;
}

export function TerrainPlacementPopover({kind,colors,anchor,onClose}:{kind:TerrainPlacementKind;colors:TerrainCardColors;anchor:HTMLButtonElement;onClose:()=>void}) {
  const name=terrainPlacementNames[kind],custom=colors.placement[kind],value=custom??colors.defaults[kind]??neutralColor;
  const rect=anchor.getBoundingClientRect();
  function close(){onClose();if(anchor.isConnected)anchor.focus();}
  return createPortal(<div className="s-gate-shade" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}>
    <div className="s-gate-popover s-terrain-placement-popover" role="dialog" aria-modal="true" aria-label={name+'放置参数'}
      style={{left:Math.max(8,Math.min(innerWidth-306,rect.left)),top:Math.max(8,Math.min(innerHeight-246,rect.top-232))}}
      onKeyDown={e=>{if(e.nativeEvent.isComposing)return;e.stopPropagation();if(e.key==='Escape')close();}}>
      <header><strong>{name}放置参数</strong><IconButton icon="close" label={'关闭'+name+'参数'} autoFocus onClick={close}/></header>
      <label>铺设颜色<select aria-label={name+'铺设颜色'} value={custom?'custom':'scene'} disabled={!!colors.unavailable} onChange={e=>colors.onPlacement(kind,e.target.value==='custom'?value:undefined)}><option value="scene">随关卡默认色</option><option value="custom">自选颜色</option></select></label>
      <label>{kind==='floor'?'顶面颜色':'侧面颜色'}<span className="s-terrain-placement-swatch"><code>{value.toUpperCase()}</code><input type="color" aria-label={name+'自选颜色'} value={value} disabled={!!colors.unavailable} onChange={e=>colors.onPlacement(kind,e.target.value)}/></span></label>
      <small>{colors.unavailable||'颜色会记住，应用于后续铺设。已有地形可用局部刷色修改。'}</small>
      <footer><button type="button" disabled={!!colors.unavailable} onClick={()=>{colors.onBrush(kind);close();}}><Icon name="brush" size={13}/> 局部刷色</button><button type="button" onClick={close}>完成</button></footer>
    </div>
  </div>,document.body);
}

export function TerrainPaletteControls({defaults,brushColor,active,disabled,disabledReason,onTool,onColor,onDefaults}:
 {defaults:TerrainPalette;brushColor:string|null;active:boolean;disabled:boolean;disabledReason?:string;onTool:()=>void;onColor:(color:string|null)=>void;onDefaults:(value:TerrainPalette)=>void}) {
 const [open,setOpen]=useState(false);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 return <div className="s-terrain-controls s-terrain-paint-toolbar">
   <button type="button" className="s-terrain-palette-toggle" title={disabledReason||'设置整关默认色或给已有地形局部刷色'} aria-expanded={open} aria-pressed={active} disabled={disabled} onClick={()=>setOpen(!open)}><Icon name="brush" size={14}/>地形配色</button>
   {active&&<><input type="color" aria-label="地形笔刷颜色" value={brushColor??'#b4875b'} onChange={e=>onColor(e.target.value)}/>
     <IconButton icon="refresh" label={brushColor===null?'改用自选刷色':'刷回默认色'} active={brushColor===null} onClick={()=>onColor(brushColor===null?'#b4875b':null)}/></>}
   {open&&!disabled&&<div className="s-terrain-popover s-terrain-palette">
     <strong>地形配色</strong>
     {(['floor','wall'] as const).map(key=><label key={key}>
       <span>{key==='floor'?'地板默认色':'墙面默认色'}</span>
       <input type="color" aria-label={key==='floor'?'地板默认色':'墙面默认色'} value={defaults[key]??neutralColor}
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
