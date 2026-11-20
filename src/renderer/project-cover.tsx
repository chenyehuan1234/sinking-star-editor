import React,{useEffect,useRef,useState} from 'react';
import type {HomeCamera,SceneThumbnail,ThumbnailSource} from '../home-types';
import {readPref} from './local-preferences';
import {Cover} from './community-panel';
import {renderScenePreview,withDeadline} from './scene-preview';

export function ProjectCover({id,level,revision,alt,source='project'}:{id:string;level:string;revision:number;alt?:string;source?:ThumbnailSource}){
  const [thumb,setThumb]=useState<SceneThumbnail|null>(null),[state,setState]=useState('等待生成'),[reason,setReason]=useState(''),[retry,setRetry]=useState(0);
  const element=useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    const api=window.workbenchHome;if(!api||!element.current)return;
    let live=true,visible=false,running=false,done=false;
    setThumb(null);setState('等待生成');setReason('');
    function active(){return live&&visible&&Boolean(element.current?.getClientRects().length);}
    async function load(){
      if(!api||running||done||!active())return;
      running=true;setState('生成中');setReason('');
      try{
        const old=await api.thumbnail(id,level,source);
        if(!active())return;
        if(old){setThumb(old);done=true;return;}
        const data=await withDeadline(api.preview(id,level,source),22000,'读取场景超时');
        if(!active())return;
        if(!data){setState('需连接游戏');return;}
        const camera=data.cameraKey?readPref<HomeCamera|null>('camera:'+data.cameraKey,null):null;
        const image=await renderScenePreview(data.level,camera,active);
        if(!active())return;
        await api.thumbnailSave(id,level,image,data.signature,source);
        if(active()){setThumb(image);done=true;}
      }catch(error){
        if(active()){setState('预览失败');setReason(String(error).replace(/^Error: Error invoking remote method '[^']+': Error: /,''));}
      }finally{
        running=false;
        if(live&&!visible&&!done)setState('等待生成');
      }
    }
    const observer=new IntersectionObserver(entries=>{
      visible=entries.some(entry=>entry.isIntersecting);
      if(visible)void load();
    },{rootMargin:'80px'});
    observer.observe(element.current);
    return()=>{live=false;observer.disconnect();};
  },[id,level,revision,retry,source]);
  return <span className="hub-cover-holder hub-project-preview" ref={element} title={reason||undefined}>
    <Cover src={thumb?.image??''} alt={alt} zoomable/>
    {thumb?.fallback&&<small className="hub-thumb-state">地形示意</small>}
    {!thumb&&(state==='预览失败'||state==='需连接游戏'?<button type="button" className="hub-thumb-state" title={reason||'连接 Steam 游戏后重试'} onClick={()=>setRetry(n=>n+1)}>{state} · 重试</button>:<small className="hub-thumb-state">{state}</small>)}
  </span>;
}
