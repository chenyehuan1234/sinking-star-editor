import React,{useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {LevelView} from '../shared';
import {HubModal} from './hub-modal';
import {Icon} from './studio-ui';
import {ViewAssets} from './native-assets';
import {buildPreviewScene,configurePreviewRenderer,previewCamera,withDeadline} from './scene-preview';

export function LiveLevelPreview({load,close,title,fallback}:{load:()=>Promise<LevelView|null>;close:()=>void;title:string;fallback?:React.ReactNode}){
  const container=useRef<HTMLDivElement>(null),reset=useRef<()=>void>(()=>{});
  const loader=useRef(load);loader.current=load;
  const [status,setStatus]=useState('正在加载 3D…'),[ready,setReady]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const host=container.current!;
    let alive=true,release=()=>{};
    setStatus('正在加载 3D…');setReady(false);
    void (async()=>{
      const level=await withDeadline(loader.current(),22000,'读取场景超时');
      if(!alive)return;
      if(!level)throw Error('连接 Steam 游戏后可查看实时 3D');
      const assets=new ViewAssets(()=>{},()=>{});
      release=()=>assets.dispose();
      const view=await buildPreviewScene(level,assets,()=>alive);
      if(!alive){view.dispose();return;}
      release=()=>{view.dispose();assets.dispose();};
      const device=new T.WebGLRenderer({antialias:true,powerPreference:'low-power'});
      release=()=>{view.dispose();assets.dispose();device.dispose();device.forceContextLoss();};
      configurePreviewRenderer(device);
      device.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
      const {camera,target,span}=previewCamera(view.root,null,16/9);
      const controls=new OrbitControls(camera,device.domElement);
      controls.target.copy(target);
      controls.mouseButtons.MIDDLE=T.MOUSE.PAN;
      controls.minDistance=Math.max(.15,span*.04);controls.maxDistance=span*5;
      controls.update();controls.saveState();
      const render=()=>device.render(view.scene,camera);
      const observer=new ResizeObserver(()=>{
        const {clientWidth,clientHeight}=host;
        if(!clientWidth||!clientHeight)return;
        device.setSize(clientWidth,clientHeight,false);
        if(camera instanceof T.PerspectiveCamera){camera.aspect=clientWidth/clientHeight;camera.updateProjectionMatrix();}
        render();
      });
      const lost=(event:Event)=>{event.preventDefault();if(alive){setReady(false);setStatus('3D 暂不可用，可重试');}};
      const preventAutoscroll=(event:MouseEvent)=>{if(event.button===1)event.preventDefault();};
      device.domElement.addEventListener('webglcontextlost',lost);
      device.domElement.addEventListener('mousedown',preventAutoscroll);
      device.domElement.addEventListener('auxclick',preventAutoscroll);
      release=()=>{
        observer.disconnect();controls.dispose();view.dispose();assets.dispose();
        device.domElement.removeEventListener('webglcontextlost',lost);
        device.domElement.removeEventListener('mousedown',preventAutoscroll);
        device.domElement.removeEventListener('auxclick',preventAutoscroll);
        device.dispose();device.forceContextLoss();device.domElement.remove();
      };
      controls.addEventListener('change',render);
      reset.current=()=>controls.reset();
      host.append(device.domElement);observer.observe(host);setReady(true);setStatus('');
    })().catch(error=>{
      if(!alive)return;
      release();release=()=>{};
      setStatus(String(error).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/,''));
    });
    return()=>{alive=false;reset.current=()=>{};release();};
  },[retry]);
  return <HubModal title={title} wide onClose={close}>
    <section className="hub-live" aria-label={'实时 3D '+title}>
      <div className="hub-live-stage" ref={container} aria-label="左键旋转，中键平移，滚轮缩放" hidden={!ready}/>
      {!ready&&fallback}
      {status&&<p role="status" className="hub-message">{status}</p>}
      {ready?<div className="hub-actions">
        <button className="hub-icon" type="button" title="重置视角" aria-label="重置视角" onClick={()=>reset.current()}><Icon name="refresh"/></button>
        <small>左键旋转 · 中键平移 · 滚轮缩放</small>
      </div>:status!=='正在加载 3D…'&&<button className="hub-button" type="button" onClick={()=>setRetry(n=>n+1)}>重试 3D</button>}
    </section>
  </HubModal>;
}
