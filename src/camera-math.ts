import {nativeVerticalFov} from './native-camera-rules';
import {offsetPose,nativeScreenParameters,transformPose,normalizedPose} from './camera-pose';
import * as T from'three';import type{CameraConfig,LevelView,NativeCameraView,Vec3}from'./shared';import{overviewRegion}from'./editor-math';import{cameraLayer,screenLayout}from'./camera-layout';
export function cameraOffset(up:number,south:number,yaw=0):Vec3{const a=yaw*Math.PI/180;return[Math.sin(a)*south,-Math.cos(a)*south,up];}
export function cameraFrame(level:LevelView,config:CameraConfig|undefined,id:number,room:[number,number]=[0,0],aspect=16/9){
 const c=effectiveCamera(level,config,id);if(!c)return null;const screens=c.primary&&!c.overview&&screenLayout(level,config).enabled,{size,origin}=screenLayout(level,config),override=config?.controls?.find(o=>o.id===id),fov=nativeVerticalFov(screens?override?.screenFov??c.fov:c.fov,aspect);
 const target:Vec3=screens?[origin[0]+(room[0]+.5)*size[0]-.5,origin[1]+(room[1]+.5)*size[1]-.5,c.target[2]]:[...c.target];
 if(!screens&&override?.nativePose)return{...offsetPose(override.nativePose,[0,0,0]),fov};
 if(override?.pose&&(screens||!screenLayout(level,config).enabled&&override.screenFov===undefined&&config?.screenCameraId!==id))return{...offsetPose(override.pose,screens?[target[0],target[1],0]:[0,0,0]),fov};
 if(c.overview){if(override?.target||override?.upDistance!==undefined||override?.southDistance!==undefined)return{position:cameraOffset(c.upDistance,c.southDistance,c.yaw).map((n,i)=>n+c.target[i])as Vec3,target:c.target,up:[0,1,0]as Vec3,fov};const r=overviewRegion(level,c);return{position:[r.center[0],r.center[1],r.center[2]+Math.max(c.upDistance,Math.max(...r.extents)*4)]as Vec3,target:r.center,up:[0,1,0]as Vec3,fov};}
 if(screens){const position=cameraOffset(c.upDistance,c.southDistance,0).map((n,i)=>target[i]+n)as Vec3;target[1]-=c.lookAtSouthDistance??0;return{position,target,up:(Math.abs(position[1]-target[1])<.000001?[0,1,0]:[0,0,1])as Vec3,fov};}
 if(override?.target||override?.upDistance!==undefined||override?.southDistance!==undefined)return{position:cameraOffset(c.upDistance,c.southDistance,screens?0:c.yaw).map((n,i)=>target[i]+n)as Vec3,target,up:(c.southDistance<.000001?[-Math.sin(c.yaw*Math.PI/180),Math.cos(c.yaw*Math.PI/180),0]:[0,0,1])as Vec3,fov};
 if(!override?.position&&(c.resolvedPosition||c.resolvedTarget))return{position:c.resolvedPosition??c.position,target:c.resolvedTarget??c.target,up:[0,0,1]as Vec3,fov};
 const q=new T.Quaternion(...c.rotation),forward=new T.Vector3(1,0,0).applyQuaternion(q);return{position:c.position,target:cameraLayer(level,id).known?c.target:new T.Vector3(...c.position).addScaledVector(forward,Math.max(c.upDistance,8)).toArray()as Vec3,up:new T.Vector3(0,0,1).applyQuaternion(q).toArray()as Vec3,fov};
}
export function orbitCamera(up:number,south:number,yaw:number,dx:number,dy:number,allowYaw=true){const distance=Math.max(.2,Math.hypot(up,south)),pitch=Math.max(5,Math.min(89,Math.atan2(up,south)*180/Math.PI+dy*.3)),angle=pitch*Math.PI/180;return{upDistance:Math.max(.1,Math.min(2000,distance*Math.sin(angle))),southDistance:Math.min(2000,distance*Math.cos(angle)),yaw:allowYaw?((yaw-dx*.35+180)%360+360)%360-180:0};}
export function panCamera(target:Vec3,yaw:number,scale:number,dx:number,dy:number,pitchFactor=1):Vec3{const a=yaw*Math.PI/180,y=dy/Math.max(.1,pitchFactor);return[target[0]+(-dx*Math.cos(a)-y*Math.sin(a))*scale,target[1]+(-dx*Math.sin(a)+y*Math.cos(a))*scale,target[2]];}
export function cameraTarget(level:LevelView,camera:NativeCameraView):Vec3{if(camera.resolvedTarget)return[...camera.resolvedTarget]as Vec3;if(camera.overview)return overviewRegion(level,camera).center;const floor=cameraLayer(level,camera.id).z,p=new T.Vector3(...(camera.resolvedPosition??camera.position)),forward=new T.Vector3(1,0,0).applyQuaternion(new T.Quaternion(...camera.rotation));return forward.z<-.001?p.addScaledVector(forward,(floor-p.z)/forward.z).toArray()as Vec3:[p.x,p.y,floor];}
export function effectiveCamera(level:LevelView,config:CameraConfig|undefined,id:number,targetOverride?:Vec3){
 const source=level.camera?.controls.find(c=>c.id===id);if(!source)return null;
 const stored=config?.mode==='template'?undefined:config?.controls?.find(o=>o.id===id),regularScreen=source.primary&&!source.overview&&screenLayout(level,config).enabled;
 const override=regularScreen&&stored?.nativePose&&!stored.pose?undefined:stored;
 const base={...source,...override},nativeTarget=cameraTarget(level,source),target=[...(targetOverride??override?.target??nativeTarget)]as Vec3;
 if(override?.pose&&(source.primary&&!source.overview&&screenLayout(level,config).enabled||!screenLayout(level,config).enabled&&override.screenFov===undefined&&config?.screenCameraId!==id)){const pose=offsetPose(override.pose,cameraPoseOffset(level,config,id)),v=new T.Vector3(...pose.position).sub(new T.Vector3(...pose.target)),native=source.primary&&!source.overview&&screenLayout(level,config).enabled?nativeScreenParameters(override.pose):undefined;return{...base,upDistance:v.z,southDistance:Math.hypot(v.x,v.y),...native,target:pose.target,position:pose.position,yaw:Math.atan2(v.x,-v.y)*180/Math.PI};}
 if(override?.position&&!override.target&&!targetOverride)for(let i=0;i<3;i++)target[i]+=override.position[i]-source.position[i];
 const rawPosition=override?.position??source.position,yaw=override?.yaw??(override?.target?0:Math.atan2(rawPosition[0]-target[0],target[1]-rawPosition[1])*180/Math.PI);
 return{...base,yaw,target,position:override?.position??(override?.target||targetOverride||override?.upDistance!==undefined||override?.southDistance!==undefined?cameraOffset(base.upDistance,base.southDistance,override?.yaw??0).map((n,i)=>n+target[i])as Vec3:source.position)};
}

export function cameraPoseOffset(level:LevelView,config:CameraConfig|undefined,id:number,room:[number,number]=[0,0]):Vec3{const c=level.camera?.controls.find(c=>c.id===id),screens=!!c?.primary&&!c.overview&&screenLayout(level,config).enabled,{size,origin}=screenLayout(level,config);return screens?[origin[0]+(room[0]+.5)*size[0]-.5,origin[1]+(room[1]+.5)*size[1]-.5,0]:[0,0,0];}
export function poseCameraChange(level:LevelView,config:CameraConfig|undefined,id:number,room:[number,number],frame:import('./shared').CameraPose):CameraConfig{
 const source=level.camera?.controls.find(camera=>camera.id===id);
 const screen=source?.primary&&!source.overview&&screenLayout(level,config).enabled;
 const origin=cameraPoseOffset(level,config,id,room),pose=offsetPose(frame,origin.map(n=>-n)as Vec3);
 const controls=[...(config?.controls??[])],index=controls.findIndex(c=>c.id===id);
 const previous=controls[index];
 const next:import('./shared').CameraOverride={...(previous??{id}),pose};
 if(screen){
  const legacyLens=previous?.pose||!previous?.nativePose?previous:undefined;
  next.screenFov??=legacyLens?.fov??source.fov;
  next.screenPanRate??=legacyLens?.panRate??source.panRate;
  next.fov??=source.fov;
  next.panRate??=source.panRate;
 }else if(next.screenFov!==undefined||config?.screenCameraId===id){
  next.nativePose=normalizedPose(frame);
  next.pose=controls[index]?.pose;
 }
 delete next.position;delete next.target;delete next.yaw;
 if(index<0)controls.push(next);else controls[index]=next;
 return{...config,mode:screen?'screens':config?.mode??'single',...(screen?{screenCameraId:id}:{}),controls};
}
/** Editing a Camera_Control never implicitly enters a room or changes runtime mode. */
export function cameraObjectFrame(level:LevelView,config:CameraConfig|undefined,id:number,aspect=16/9){const source=level.camera?.controls.find(c=>c.id===id);if(!source)return null;const control=config?.controls?.find(c=>c.id===id),fov=nativeVerticalFov(control?.fov??source.fov,aspect);if(control?.nativePose)return{...offsetPose(control.nativePose,[0,0,0]),fov};const screen=config?.mode==='screens'||config?.mode!=='single'&&level.camera?.perScreen;if(!screen&&control?.pose&&control.screenFov===undefined&&config?.screenCameraId!==id)return{...offsetPose(control.pose,[0,0,0]),fov};const q=new T.Quaternion(...source.rotation),position=source.resolvedPosition??source.position,target=source.resolvedTarget&&new T.Vector3(...source.resolvedTarget).distanceToSquared(new T.Vector3(...position))>1e-8?source.resolvedTarget:new T.Vector3(...position).addScaledVector(new T.Vector3(1,0,0).applyQuaternion(q),Math.max(1,Math.hypot(source.upDistance,source.southDistance))).toArray()as Vec3;return{position:[...position]as Vec3,target:[...target]as Vec3,up:new T.Vector3(0,0,1).applyQuaternion(q).toArray()as Vec3,fov};}
export function cameraObjectChange(config:CameraConfig|undefined,id:number,frame:import('./shared').CameraPose):CameraConfig{
 const controls=[...(config?.controls??[])],index=controls.findIndex(c=>c.id===id);
 const next={...(controls[index]??{id}),nativePose:normalizedPose(frame)};
 if(config?.mode==='screens'&&next.pose){
  next.screenFov??=next.fov;
  next.screenPanRate??=next.panRate;
 }
 if(index<0)controls.push(next);else controls[index]=next;
 return{...config,mode:config?.mode??'template',controls};
}
/** Numeric fields edit the same full pose as the canvas instead of shadowing it. */
export function patchPoseParameters(level:LevelView,config:CameraConfig|undefined,id:number,patch:Partial<import('./shared').CameraOverride>,room:[number,number]=[0,0],object=false):CameraConfig|null{
 const old=config?.controls?.find(c=>c.id===id),source=level.camera?.controls.find(c=>c.id===id),screens=!object&&!!source?.primary&&!source.overview&&screenLayout(level,config).enabled;
 if(!object&&!old?.pose&&!screens)return null;
 const frame=object?cameraObjectFrame(level,config,id):cameraFrame(level,config,id,room),base=effectiveCamera(level,config,id);if(!frame||!base)return null;const offset=new T.Vector3(...frame.position).sub(new T.Vector3(...frame.target)),effective=object?{...base,yaw:Math.atan2(offset.x,-offset.y)*180/Math.PI}:base;let pose:import('./shared').CameraPose={position:[...frame.position],target:[...frame.target],up:[...frame.up]};
 for(const key of['position','target']as const)if(patch[key])pose=offsetPose(pose,patch[key]!.map((n,i)=>n-frame[key][i])as Vec3);
 if(patch.upDistance!==undefined)pose.position[2]=pose.target[2]+patch.upDistance;
 if(patch.southDistance!==undefined){
  if(screens)pose.position[1]=cameraPoseOffset(level,config,id,room)[1]-patch.southDistance;
  else{const a=effective.yaw*Math.PI/180;pose.position[0]=pose.target[0]+Math.sin(a)*patch.southDistance;pose.position[1]=pose.target[1]-Math.cos(a)*patch.southDistance;}
 }
 if(patch.lookAtSouthDistance!==undefined)pose.target[1]=screens?cameraPoseOffset(level,config,id,room)[1]-patch.lookAtSouthDistance:pose.target[1]-patch.lookAtSouthDistance+(effective.lookAtSouthDistance??0);
 if(patch.yaw!==undefined)pose=transformPose(pose,'rotate',2,(patch.yaw-effective.yaw)*Math.PI/180);
 const next=object?cameraObjectChange(config,id,pose):poseCameraChange(level,config,id,room,normalizedPose(pose)),control=next.controls!.find(c=>c.id===id)!;
 if(patch.fov!==undefined)control[screens?'screenFov':'fov']=patch.fov;if(patch.panRate!==undefined)control[screens?'screenPanRate':'panRate']=patch.panRate;return next;
}

export function fitCameraToBounds(bounds:T.Box3,target:Vec3,up:number,south:number,fov:number,aspect:number,yaw=0){if(bounds.isEmpty())return{upDistance:up,southDistance:south};const direction=new T.Vector3(...cameraOffset(up,south,yaw)).normalize(),right=new T.Vector3(Math.cos(yaw*Math.PI/180),Math.sin(yaw*Math.PI/180),0),vertical=new T.Vector3().crossVectors(direction,right).normalize(),center=new T.Vector3(...target),tan=Math.tan(fov*Math.PI/360);let distance=1;for(const x of[bounds.min.x,bounds.max.x])for(const y of[bounds.min.y,bounds.max.y])for(const z of[bounds.min.z,bounds.max.z]){const v=new T.Vector3(x,y,z).sub(center);distance=Math.max(distance,Math.abs(v.dot(right))*1.1/(tan*aspect)+v.dot(direction),Math.abs(v.dot(vertical))*1.1/tan+v.dot(direction));}return{upDistance:Math.max(.1,Math.min(2000,distance*direction.z)),southDistance:Math.max(0,Math.min(2000,distance*Math.hypot(direction.x,direction.y)))};}

export type CameraViewTarget={kind:'camera';id:number}|{kind:'screen';id:number;room:[number,number]};
/** Camera objects keep their world pose; a screen applies the shared pose at its room center. */
export function cameraViewFrame(level:LevelView,config:CameraConfig|undefined,target:CameraViewTarget,aspect=16/9){return target.kind==='screen'?cameraFrame(level,config,target.id,target.room,aspect):cameraObjectFrame(level,config,target.id,aspect);}
