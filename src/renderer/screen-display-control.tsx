import React,{useEffect,useRef} from 'react';
import {IconButton} from './studio-ui';
import {BufferInput} from './studio-inspector';

export function ScreenDisplayControl({visible,locked,onVisible,onLocked,height,layer,onHeight}:{visible:boolean;locked:boolean;onVisible:(value:boolean)=>void;onLocked:(value:boolean)=>void;height:number|null;layer:number;onHeight:(value:number|null)=>void}){
  const root=useRef<HTMLDivElement>(null),menu=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const close=()=>{if(menu.current)menu.current.open=false;};
    const outside=(event:PointerEvent)=>{
      if(!menu.current?.open||root.current?.contains(event.target as Node))return;
      close();
      if((event.target as HTMLElement)?.tagName==='CANVAS'){event.preventDefault();event.stopImmediatePropagation();}
    };
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.isComposing||!menu.current?.open)return;
      close();
      event.preventDefault();
      event.stopImmediatePropagation();
      root.current?.querySelector('summary')?.focus();
    };
    window.addEventListener('pointerdown',outside,true);
    window.addEventListener('keydown',key,true);
    window.addEventListener('sstar:cancel-gesture',close);
    return()=>{
      window.removeEventListener('pointerdown',outside,true);
      window.removeEventListener('keydown',key,true);
      window.removeEventListener('sstar:cancel-gesture',close);
    };
  },[]);
  return <div className="s-decorations s-screen-display" ref={root}>
    <IconButton icon="grid" label="分屏显示" active={visible} onClick={()=>onVisible(!visible)}/>
    <details ref={menu}>
      <summary aria-label="分屏显示选项" onClick={()=>{if(!menu.current?.open)window.dispatchEvent(new Event('sstar:cancel-gesture'));}}>⌄</summary>
      <div>
        <label><input type="checkbox" aria-label="显示分屏边界" checked={visible} onChange={e=>onVisible(e.target.checked)}/>显示分屏边界</label>
        <label><input type="checkbox" aria-label="锁定分屏" checked={locked} onChange={e=>onLocked(e.target.checked)}/>锁定分屏</label>
        <label>边界显示高度 <BufferInput label="分屏边界显示 Z" value={String(height??layer)} step="1" onCommit={text=>onHeight(Number(text))}/></label>
        <button type="button" disabled={height===null} onClick={()=>onHeight(null)}>跟随当前层</button>
        <small>锁定后保留虚线，主画布点击不选屏。可进入「布局分屏」调整。</small>
      </div>
    </details>
  </div>;
}
