import {newScreenSize} from '../level-settings';
import type {CameraPlan} from '../editor-organization';
import {RectanglePickButton} from './rectangle-picker';
import {plannedScreens,screenLayout} from '../camera-layout';
import {effectiveCamera,cameraFrame,cameraObjectFrame,patchPoseParameters} from '../camera-math';
import {cameraLayer} from '../camera-layout';
import {screenWrappingWarnings} from '../screen-wrapping';
import {selectedScreenCamera} from '../screen-camera';
import React,{useState} from 'react';
import type {CameraConfig,CameraOverride,LevelView,Vec3} from '../shared';
import {BufferInput} from './studio-inspector';
import {PointPickButton} from './point-picker';
import {CameraPanelSection} from './camera-panel-section';
import {cameraNumber} from '../camera-panel-state';
export function CameraInspector({screenSettings,section,open=true,onOpen=()=>{},screenOpen=false,onScreenOpen=()=>{},children,objectEditing=false,room=[0,0],level,config,onChange,onPreview,selectedId,plan,onPlanChange}:{screenSettings?:React.ReactNode;section:'rules'|'parameters'|'links';open?:boolean;onOpen?:(v:boolean)=>void;screenOpen?:boolean;onScreenOpen?:(v:boolean)=>void;children?:React.ReactNode;objectEditing?:boolean;room?:[number,number];plan?:CameraPlan;onPlanChange?:(p:CameraPlan|undefined)=>void;level:LevelView|null;selectedId?:number;config?:CameraConfig;onChange:(config:CameraConfig)=>void;onPreview?:(config:CameraConfig|null)=>void}){
 const[planError,setPlanError]=useState(''),view=level?.camera,camera=view?.controls.find(c=>c.id===selectedId)??view?.controls.find(c=>c.primary&&!c.overview)??view?.controls[0],raw=camera&&level?effectiveCamera(level,config,camera.id):null,frame=camera&&level?(objectEditing?cameraObjectFrame(level,config,camera.id):cameraFrame(level,config,camera.id,room)):null,offset=frame?frame.position.map((n,i)=>n-frame.target[i]):null,effective=raw&&frame?{...raw,...objectEditing&&offset?{upDistance:offset[2],southDistance:Math.hypot(offset[0],offset[1]),yaw:Math.atan2(offset[0],-offset[1])*180/Math.PI}:{},fov:objectEditing?(config?.controls?.find(c=>c.id===camera?.id)?.fov??raw.fov):raw.screenFov??raw.fov,panRate:objectEditing?raw.panRate:raw.screenPanRate??raw.panRate,position:frame.position,target:frame.target}:raw;
 const screens=config?.mode==='screens'||config?.mode!=='single'&&!!view?.perScreen,size=config?.screenSize??(view?.perScreen?view.screenSize:[newScreenSize,newScreenSize]),origin=level?screenLayout(level,config).origin:config?.origin??view?.origin??[0,0];
 const screenCamera=selectedScreenCamera(view,config),primaryCameras=view?.controls.filter(c=>c.primary&&!c.overview)??[];
 const wrapIssues=screens?screenWrappingWarnings(origin,size as [number,number],level?.topology):[];
 function change(patch:Partial<CameraConfig>,preview=false){(preview&&onPreview?onPreview:onChange)({...config,mode:config?.mode??'template',...patch});}
 function control(patch:Partial<CameraOverride>,preview=false){if(!camera||!level)return;const posed=patchPoseParameters(level,config,camera.id,patch,room,objectEditing);if(posed){(preview&&onPreview?onPreview:onChange)(posed);return;}const controls=[...(config?.controls??[])],old=controls.findIndex(c=>c.id===camera.id),item={...(old>=0?controls[old]:{id:camera.id}),...patch};if(patch.position){delete item.target;delete item.yaw;}if(patch.target)delete item.position;if(old>=0)controls[old]=item;else controls.push(item);change({mode:screens?'screens':'single',controls},preview);}
 const bindingReason=camera?[camera.positionId,camera.lookAtId].some(id=>{if(!id||id===camera.id)return false;const e=level?.entities.find(e=>e.id===id),script=String(e?.nativeProperties?.find(p=>p.field.name==='script_name')?.value??'');return !e||!['Camera_Control','Camera_Marker'].includes(e.type)&&!(e.type==='Marker'&&['','camera_z_lock','editor_camera_z'].includes(script));})?'镜头跟随玩法对象，请先在相机引用中处理关联':'':'';
 const layerInfo=camera&&level?cameraLayer(level,camera.id):null,planning=level&&section==='rules'?plannedScreens(level,config,plan):null;
 function pointFields(label:string,value:Vec3,kind:'position'|'target'){
  const reason=bindingReason;
  const write=(point:Vec3,preview=false)=>control(kind==='target'?{target:point}:{position:point},preview);
  return <div className="s-vector-field"><span>{label}</span><div>{([0,1,2]as const).map(a=><label key={a}>{'XYZ'[a]}<BufferInput label={(kind==='target'?'镜头观察中心':'相机位置')+' '+'XYZ'[a]} disabled={!!reason} value={cameraNumber(value[a])} onPreview={v=>{const point=[...value]as Vec3;point[a]=Number(v);write(point,true);}} onCommit={v=>{const point=[...value]as Vec3;point[a]=Number(v);write(point);}}/></label>)}</div><PointPickButton label={kind==='target'?'镜头观察中心':'相机位置'} value={value} disabled={!!reason} reason={reason} onCommit={write}/></div>;
 }
 return <>{(section==='rules')&&<CameraPanelSection id="rules" title="本关画面规则" open={open} onOpen={onOpen}>
  <label className="s-field">运行方式<select aria-label="原生相机模式" value={config?.mode??'template'} onChange={e=>{const mode=e.target.value as CameraConfig['mode'];if(mode==='template'){onChange({...config,mode,controls:undefined,screenCameraId:undefined,screenSize:undefined,origin:undefined,margins:undefined});return;}const controls=config?.controls?.map(c=>{
   if(!screens&&mode==='screens'&&level&&c.screenFov===undefined&&config?.screenCameraId!==c.id&&(c.pose||c.target||c.position)){
    const {pose,target,position,yaw,...ordinary}=c;
    const frame=cameraFrame(level,config,c.id);
    return {...ordinary,nativePose:c.nativePose??(frame?{position:frame.position,target:frame.target,up:frame.up}:undefined)};
   }
   if(screens&&mode==='single'&&c.pose)return {...c,screenFov:c.screenFov??c.fov??view?.controls.find(v=>v.id===c.id)?.fov};
   return c;
  });
  onChange({...config,mode,controls,...mode==='screens'?{screenSize:size,origin,margins:config?.margins??view?.margins??[0,0]}:{}});}}><option value="template">沿用原版 · {view?.perScreen?'规则分屏':'单场景'}</option><option value="single">单场景</option><option value="screens">规则分屏</option></select></label>
  {screens&&<><div className="s-camera-layout-summary"><div className="s-camera-layout-stats"><span>每屏 <strong>{size[0]} × {size[1]}</strong> 格</span>{planning&&<span><strong>{planning.columns}</strong> 列 × <strong>{planning.rows}</strong> 行</span>}</div><button className="s-text-button" onClick={()=>window.dispatchEvent(new Event('sstar:camera-layout'))}>布局分屏</button></div><CameraPanelSection id="screen" title="分屏参数" open={screenOpen} onOpen={onScreenOpen}>
  {!view?.layered&&primaryCameras.length>1&&<label className="s-field">分屏取景来源<select aria-label="分屏取景来源" value={screenCamera?.id??''} onChange={e=>change({mode:'screens',screenCameraId:Number(e.target.value)})}>{primaryCameras.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  <div className="s-camera-layout-tools"><RectanglePickButton label="画一屏大小" z={effective?.target[2]??0} description="只修改分屏起点与每屏宽高；不生成地面，也不修改循环边界。" commit={r=>change({mode:'screens',origin:r.origin,screenSize:r.size})}/><PointPickButton label="分屏起点" value={[...origin,effective?.target[2]??0]} integer xy onCommit={p=>change({mode:'screens',origin:[p[0],p[1]]})}/></div>
  {(['screenSize','origin']as const).map((key,i)=><div className="s-camera-pair" key={key}><span>{i?'网格起点':'每屏格数'}</span>{([0,1]as const).map(a=><label key={a}>{'XY'[a]}<BufferInput label={(i?'分区起点':'每屏格数')+' '+'XY'[a]} value={String((i?origin:size)[a])} step="1" onCommit={value=>{const pair=[...(i?origin:size)]as[number,number];pair[a]=Number(value);change({mode:'screens',[key]:pair});}}/></label>)}</div>)}
  {planning&&onPlanChange&&<div className="s-screen-plan"><label className="s-switch-row"><span>按设计范围自动铺满</span><input aria-label="按设计范围自动铺满" type="checkbox" checked={!plan} onChange={e=>onPlanChange(e.target.checked?undefined:{start:planning.start,columns:planning.columns,rows:planning.rows})}/></label><div className="s-camera-pair"><span>规划屏数</span>{(['columns','rows']as const).map((key,i)=><label key={key}>{i?'纵向':'横向'}<BufferInput label={i?'纵向分屏数量':'横向分屏数量'} value={String(planning[key])} step="1" onCommit={v=>{const n=Number(v);if(!Number.isInteger(n)||n<1||n>512){setPlanError('横纵屏数须为 1～512 的正整数');return;}setPlanError('');onPlanChange({start:planning.start,columns:planning.columns,rows:planning.rows,[key]:n});}}/></label>)}</div>{planError&&<p className="s-error" role="alert">{planError}</p>}<p className="s-muted">规划外框：{planning.columns*size[0]} × {planning.rows*size[1]} 格。数量只管理镜头规划范围，不限制游戏镜头；游戏限制仍保留原版区域规则。</p></div>}
  <details><summary>切屏高级参数</summary><div className="s-camera-pair"><span>房间边距</span>{([0,1]as const).map(a=><label key={a}>{'XY'[a]}<BufferInput label={'房间边距 '+'XY'[a]} value={String((config?.margins??view?.margins??[0,0])[a])} onCommit={v=>{const margins=[...(config?.margins??view?.margins??[0,0])]as[number,number];margins[a]=Number(v);change({mode:'screens',margins});}}/></label>)}</div></details></CameraPanelSection></>}
  {screens&&wrapIssues.length>0&&<div className="s-warning" role="status">{wrapIssues.map(message=><p key={message}>{message}</p>)}<p>在「循环与关卡范围」中可将循环范围向外对齐整屏。</p></div>}
  {screenSettings}
 </CameraPanelSection>}
  {(section==='parameters')&&camera&&effective&&<CameraPanelSection id="parameters" title="精确参数" open={open} onOpen={onOpen}>
<p className="s-muted">{camera.overview?'地图总览取景':objectEditing?'普通相机对象':screens?'整套分屏共同取景':'单场景取景'}{!camera.overview&&layerInfo?.known?' · 观察高度 Z '+cameraNumber(layerInfo.z):''}</p>
  {!camera.overview&&!layerInfo?.known&&!config?.controls?.find(c=>c.id===camera.id)?.target&&<p className="s-warning">无法可靠确定观察高度，请先为观察中心取点；原版配置保持原样。</p>}
  {pointFields('看向',effective.target,'target')}{screens&&!objectEditing&&<label className="s-field">观察点南向偏移<BufferInput label="观察点南向偏移" value={String(effective.lookAtSouthDistance??0)} onCommit={v=>control({lookAtSouthDistance:Number(v)})}/></label>}{screens&&!objectEditing&&<p className="s-muted">取景位置可自由调整；修改作用于同套分屏。移动整套网格请使用“布局分屏”。</p>}
  {(['upDistance','southDistance','fov','panRate']as const).map((key,i)=><label className="s-field" key={key}>{['镜头离观察中心的高度','南向距离','垂直视角（度）','切屏平移速度'][i]}<BufferInput label={['镜头高度','南向距离','垂直视角','镜头平移速度'][i]} value={cameraNumber(effective[key])} onPreview={v=>{if(v!==''&&Number.isFinite(Number(v)))control({[key]:Number(v)},true);}} onCommit={v=>control({[key]:Number(v)})}/></label>)}
  <label className="s-field">水平朝向（度）<BufferInput label="镜头水平朝向" value={cameraNumber(effective.yaw)} disabled={!!bindingReason} onCommit={v=>control({target:effective.target,yaw:Number(v)})}/></label>
 </CameraPanelSection>}
  {(section==='links')&&camera&&effective&&<CameraPanelSection id="links" title="关联与原生设置" open={open} onOpen={onOpen}>{children}{pointFields('位置',effective.position,'position')}{bindingReason&&<p className="s-warning">{bindingReason}</p>}<p className="s-muted">位置引用 #{camera.positionId??0} · 目标引用 #{camera.lookAtId??0}。取点不会自动解除原生关联。</p></CameraPanelSection>}
 </>;
}
