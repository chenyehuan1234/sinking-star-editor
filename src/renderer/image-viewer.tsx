import React,{useEffect,useRef,useState} from 'react';
import {communityDeadline,communityTimeout} from '../community-network';
import {HubModal} from './hub-modal';

const fit={scale:1,x:0,y:0};
export function ImageViewer({src,loadFull,title,close}:{src:string;loadFull?:()=>Promise<string|null>;title:string;close:()=>void}){
  const [image,setImage]=useState(src),[view,setView]=useState(fit),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const stage=useRef<HTMLDivElement>(null),drag=useRef<{pointer:number;x:number;y:number}|null>(null),full=useRef(loadFull);
  const fullRequest=useRef<Promise<string|null>|undefined>(undefined);
  full.current=loadFull;
  useEffect(()=>{
    let alive=true;
    setImage(src);setView(fit);
    const pending=full.current?.().catch(()=>null);
    fullRequest.current=pending;
    void pending?.then(value=>{if(alive&&value)setImage(value);});
    return()=>{alive=false;};
  },[src]);
  useEffect(()=>{
    const element=stage.current!;
    const wheel=(event:WheelEvent)=>{
      event.preventDefault();
      const rect=element.getBoundingClientRect(),x=event.clientX-rect.left-rect.width/2,y=event.clientY-rect.top-rect.height/2;
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1);
      setView(previous=>{
        const scale=Math.max(1,Math.min(8,previous.scale*Math.exp(-delta*.0015)));
        if(scale===1)return fit;
        const relative=scale/previous.scale;
        return {scale,x:x+(previous.x-x)*relative,y:y+(previous.y-y)*relative};
      });
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return()=>element.removeEventListener('wheel',wheel);
  },[]);
  async function save(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const selected=await fullRequest.current??image;
      if(window.workbenchHome){await window.workbenchHome.saveImage(selected,title);return;}
      let url=selected;
      if(!selected.startsWith('data:image/webp;base64,')){
        const file=await communityDeadline(communityTimeout,async signal=>{
          const response=await fetch(selected,{signal});if(!response.ok)throw Error('图片下载失败');return response.blob();
        });
        url=URL.createObjectURL(file);
      }
      const anchor=document.createElement('a');
      anchor.href=url;anchor.download=(title||'关卡预览')+'.webp';anchor.click();
      if(url.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(error){setError(String(error).replace(/^Error: /,''));}
    finally{setBusy(false);}
  }
  return <HubModal title={title} wide onClose={close}>
    <div className="hub-image-stage" ref={stage}
      onPointerDown={event=>{if(event.button!==0||view.scale===1)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointer:event.pointerId,x:event.clientX,y:event.clientY};}}
      onPointerMove={event=>{const from=drag.current;if(!from||from.pointer!==event.pointerId)return;const x=event.clientX-from.x,y=event.clientY-from.y;from.x=event.clientX;from.y=event.clientY;setView(old=>({...old,x:old.x+x,y:old.y+y}));}}
      onPointerUp={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
      <img className="hub-large-preview" src={image} alt={title} draggable={false} onError={()=>{if(image!==src)setImage(src);}} style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`}}/>
    </div>
    <div className="hub-actions"><button type="button" className="hub-button" onClick={()=>setView(fit)}>适应窗口</button>
      <button type="button" className="hub-primary" disabled={busy} onClick={()=>void save()}>下载图片</button></div>
    {error&&<p className="hub-message hub-error" role="alert">{error}</p>}
  </HubModal>;
}
