import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import type {Vec3} from '../shared';
import {useCommands} from './commands';
import {IconButton} from './studio-ui';
import './camera-workspace.css';

export type PointRequest={label:string;value:Vec3;integer?:boolean;xy?:boolean;commit:(point:Vec3)=>void|Promise<void>};
type PickState={request:PointRequest;serial:number};
const Context=createContext<{active:PickState|null;start:(r:PointRequest)=>void;cancel:()=>void}|null>(null);
export function PointPickerProvider({children}:{children:React.ReactNode}){
 const[active,setActive]=useState<PickState|null>(null),serial=useRef(0);
 const cancel=()=>setActive(null);
 useEffect(()=>{window.addEventListener('sstar:cancel-point',cancel);return()=>window.removeEventListener('sstar:cancel-point',cancel);},[]);
 return <Context.Provider value={{active,start:request=>{window.dispatchEvent(new Event('sstar:cancel-rectangle'));window.dispatchEvent(new Event('sstar:cancel-gesture'));setActive({request,serial:++serial.current});},cancel}}>{children}</Context.Provider>;
}
export const usePointPicker=()=>useContext(Context);
export function PointPickButton({label,value,onCommit,integer=false,xy=false,disabled=false,reason=''}:{label:string;value:Vec3;onCommit:PointRequest['commit'];integer?:boolean;xy?:boolean;disabled?:boolean;reason?:string}){
 const picker=usePointPicker();return <IconButton icon="target" label={reason||'在画布取点：'+label} disabled={disabled||!picker} onClick={()=>picker?.start({label,value:[...value],integer,xy,commit:onCommit})}/>;
}

/** Owns pointer input while picking, independently of placement, sampling and game-camera editing. */
export function PointPickerSurface({getScene,viewKey,blocked}:{getScene:()=>any;viewKey:string;blocked?:boolean}){
 const picker=usePointPicker(),active=picker?.active,live=useRef(picker);live.current=picker;
 const[value,setValue]=useState<Vec3>([0,0,0]),[error,setError]=useState(''),[saving,setSaving]=useState(false),engine=useRef<{value:()=>Vec3;confirm:()=>void}|null>(null);
 const initialKey=useRef(viewKey);
 useEffect(()=>{if(initialKey.current!==viewKey){initialKey.current=viewKey;picker?.cancel();}},[viewKey]);
 useEffect(()=>{if(blocked)picker?.cancel();},[blocked,active?.serial]);
 useCommands(id=>{if(!live.current?.active)return false;if(id==='cancel'){live.current.cancel();return true;}return !['help','helpSearch','palette','panels'].includes(id);},80);
 useEffect(()=>{
  if(!active)return;const s=getScene();if(!s)return;const request=active.request,key=viewKey;
  setError('');setSaving(false);s.cancel();s.restoreFree();s.setLensView(null);
  const marker=new T.Group();marker.name='coordinate-point';marker.position.fromArray(request.value);
  const dot=new T.Mesh(new T.SphereGeometry(.12,12,8),new T.MeshBasicMaterial({color:0xf2c77d,depthTest:false}));dot.renderOrder=100;marker.add(dot);s.scene.add(marker);
  const gizmo=new TransformControls(s.camera,s.renderer.domElement);gizmo.setMode('translate');gizmo.setSpace('world');gizmo.setSize(.8);gizmo.setTranslationSnap(request.integer?1:null);gizmo.showZ=!request.xy;gizmo.attach(marker);s.scene.add(gizmo.getHelper());
  const priorObject=s.transform.object;s.transform.detach();s.transform.enabled=false;
  const freeMemory=s.editingMemory();let committing=false,placed=false,valid=true;let alive=true,down:null|{id:number;x:number;y:number}=null,last:Vec3=[...request.value],gestureStart:Vec3|null=null;
  const update=()=>{if(request.xy)marker.position.z=request.value[2];if(request.integer)marker.position.round();last=marker.position.toArray();setValue([...last]);s.draw();};update();
  const moveStart=()=>{placed=true;gestureStart=marker.position.toArray();},moveEnd=()=>{gestureStart=null;};
  const dragging=(e:any)=>{s.controls.enabled=!e.value;};gizmo.addEventListener('dragging-changed',dragging);gizmo.addEventListener('objectChange',update);gizmo.addEventListener('mouseDown',moveStart);gizmo.addEventListener('mouseUp',moveEnd);
  function point(e:PointerEvent){const p=s.coordinatePoint(e,request.integer,request.xy?request.value[2]:undefined);if(!p){valid=false;setError('没有可用落点，请调整观察方向或锁定高度');return;}valid=true;marker.position.fromArray(p);setError('');update();}
  function pointerDown(e:PointerEvent){if(e.target!==s.renderer.domElement||e.button!==0||gizmo.axis)return;if(!s.inside(e))return;e.preventDefault();e.stopImmediatePropagation();down={id:e.pointerId,x:e.clientX,y:e.clientY};}
  function pointerUp(e:PointerEvent){if(!down||down.id!==e.pointerId||e.button!==0)return;const d=down;down=null;e.preventDefault();e.stopImmediatePropagation();if(s.inside(e)&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<4){point(e);placed=true;}}
  const cancelGesture=()=>{down=null;if(gestureStart){marker.position.fromArray(gestureStart);gestureStart=null;gizmo.reset();update();}gizmo.dragging=false;s.controls.enabled=true;};
  const cancel=()=>{cancelGesture();live.current?.cancel();};
  const hover=(e:PointerEvent)=>{if(!placed&&!e.buttons&&e.target===s.renderer.domElement&&s.inside(e))point(e);};
  async function confirm(){if(!alive||committing||gizmo.dragging||!valid)return;try{committing=true;setSaving(true);if(last.some((n,i)=>Math.abs(n-request.value[i])>1e-8))await request.commit([...last]);if(alive&&key===viewKey)live.current?.cancel();}catch(e){if(alive){committing=false;setSaving(false);setError(String(e));}}}
  engine.current={value:()=>last,confirm};s.coordinateSession={marker,gizmo};
  const keyDown=(e:KeyboardEvent)=>{if(e.isComposing||e.defaultPrevented||e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select')||e.target.isContentEditable))return;if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();void confirm();}};
  window.addEventListener('pointermove',hover);window.addEventListener('pointerdown',pointerDown,true);window.addEventListener('pointerup',pointerUp,true);window.addEventListener('keydown',keyDown,true);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('sstar:cancel-gesture',cancel);
  return()=>{alive=false;cancelGesture();engine.current=null;delete s.coordinateSession;window.removeEventListener('pointermove',hover);window.removeEventListener('pointerdown',pointerDown,true);window.removeEventListener('pointerup',pointerUp,true);window.removeEventListener('keydown',keyDown,true);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('sstar:cancel-gesture',cancel);gizmo.detach();s.scene.remove(marker,gizmo.getHelper());gizmo.dispose();dot.geometry.dispose();dot.material.dispose();s.transform.enabled=true;if(priorObject&&priorObject.parent)s.transform.attach(priorObject);s.controls.enabled=true;if(s.cameraOwner()===key)s.loadMemory(freeMemory);s.draw();};
 },[active?.serial]);
 if(!active)return null;
 return <div className="s-coordinate-bar" role="region" aria-label="画布坐标取点"><strong>取点 · {active.request.label}</strong><output>{value.map((n,i)=><span key={i}>{'XYZ'[i]} <b>{Number(n.toFixed(3))}</b></span>)}</output><span>单击取点 · 三轴微调 · 中键平移／右键旋转</span><button disabled={saving||!!error} onClick={()=>engine.current?.confirm()}>确认 · Enter</button><button onClick={()=>picker?.cancel()}>取消 · Esc</button>{error&&<p role="alert">{error}</p>}</div>;
}
