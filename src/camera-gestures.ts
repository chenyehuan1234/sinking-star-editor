import {Quaternion,Vector3} from 'three';
import type {LensAction} from './view-navigation';
export interface CameraConstraint {action:LensAction;axis:number|null}
export function axisPixels(q:Quaternion,axis:number,dx:number,dy:number){const v=new Vector3().setComponent(axis,1).applyQuaternion(q.clone().invert()),n=Math.hypot(v.x,v.y);return n<.12?-dy:(dx*v.x-dy*v.y)/n;}
export function constrainedRotation(axis:number,dx:number,dy:number){return(axis===2?-dx:-dy)*.006;}
export function toggleConstraint(current:CameraConstraint,axis:number):CameraConstraint{return{...current,axis:current.axis===axis?null:axis};}
