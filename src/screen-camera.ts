import type {CameraConfig,CameraOverride,CameraView,NativeCameraView} from './shared';

/** A selected ordinary/scroll camera is not the regular screen camera binding. */
export function selectedScreenCamera(view:Pick<CameraView,'controls'|'layered'>|undefined,config?:CameraConfig,selectedId?:number):NativeCameraView|undefined {
 const cameras=view?.controls.filter(c=>c.primary&&!c.overview)??[];
 if(view?.layered){const layerCamera=cameras.find(c=>c.id===selectedId);if(layerCamera)return layerCamera;}
 const bound=cameras.find(c=>c.id===config?.screenCameraId);
 if(bound)return bound;
 const edited=[...(config?.controls??[])].reverse().find(o=>o.pose&&cameras.some(c=>c.id===o.id));
 return cameras.find(c=>c.id===edited?.id)??cameras[0];
}

/** A scroll unlocks the ordinary pose of its source camera. */
export function auxiliaryCameraOverride(config:CameraConfig|undefined,sourceId:number,id:number):CameraOverride|undefined {
 const source=config?.controls?.find(c=>c.id===sourceId);
 if(!source)return;
 const {screenFov,screenPanRate,...ordinary}=structuredClone(source);
 if(config?.mode==='screens'||screenFov!==undefined||config?.screenCameraId===sourceId){
  delete ordinary.pose;
  if(source.pose||ordinary.nativePose){
   delete ordinary.upDistance;
   delete ordinary.southDistance;
   delete ordinary.lookAtSouthDistance;
  }
 }
 return {...ordinary,id};
}
