import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import type {CameraPose,Vec3} from './shared';

const vector=(v:Vec3)=>new Vector3(...v),tuple=(v:Vector3)=>v.toArray()as Vec3;
export function validatePose(p:CameraPose){
 if(!p||![p.position,p.target,p.up].every(v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<100000)))throw Error('镜头位置或朝向无效');
 const direction=vector(p.target).sub(vector(p.position));
 if(direction.length()<.01||vector(p.up).length()<.001||direction.clone().normalize().cross(vector(p.up).normalize()).length()<.001)throw Error('镜头观察点与朝向不能重合');
}
export function normalizedPose(p:CameraPose):CameraPose{validatePose(p);const direction=vector(p.target).sub(vector(p.position)).normalize(),right=direction.clone().cross(vector(p.up)).normalize(),up=right.cross(direction).normalize();return{position:[...p.position],target:[...p.target],up:tuple(up)};}
export function offsetPose(p:CameraPose,offset:Vec3):CameraPose{return{position:tuple(vector(p.position).add(vector(offset))),target:tuple(vector(p.target).add(vector(offset))),up:[...p.up]};}
export function transformPose(p:CameraPose,action:'translate'|'rotate',axis:number,amount:number):CameraPose{
 if(!Number.isInteger(axis)||axis<0||axis>2||!Number.isFinite(amount))throw Error('镜头变换无效');
 if(action==='translate')return normalizedPose(offsetPose(p,tuple(new Vector3().setComponent(axis,amount))));
 const target=vector(p.target),q=new Quaternion().setFromAxisAngle(new Vector3().setComponent(axis,1),amount);
 return normalizedPose({position:tuple(vector(p.position).sub(target).applyQuaternion(q).add(target)),target:[...p.target],up:tuple(vector(p.up).applyQuaternion(q))});
}
export function alignPose(p:CameraPose,direction:Vec3):CameraPose{const v=vector(direction);if(v.lengthSq()<.001)throw Error('镜头方向无效');v.normalize();return normalizedPose({position:tuple(vector(p.target).addScaledVector(v,vector(p.position).distanceTo(vector(p.target)))),target:[...p.target],up:Math.abs(v.z)>.999?[0,v.z>0?1:-1,0]:[0,0,1]});}
export function orbitPose(p:CameraPose,dx:number,dy:number):CameraPose{const yawed=transformPose(p,'rotate',2,-dx*.35*Math.PI/180),direction=vector(yawed.target).sub(vector(yawed.position)).normalize(),right=direction.cross(vector(yawed.up)).normalize(),q=new Quaternion().setFromAxisAngle(right,-dy*.3*Math.PI/180);return normalizedPose({position:tuple(vector(yawed.position).sub(vector(yawed.target)).applyQuaternion(q).add(vector(yawed.target))),target:[...yawed.target],up:tuple(vector(yawed.up).applyQuaternion(q))});}
export function panPose(p:CameraPose,scale:number,dx:number,dy:number):CameraPose{const normal=normalizedPose(p),right=vector(normal.target).sub(vector(normal.position)).normalize().cross(vector(normal.up)).normalize();return offsetPose(normal,tuple(right.multiplyScalar(-dx*scale).addScaledVector(vector(normal.up),dy*scale)));}
export function zoomPose(p:CameraPose,factor:number):CameraPose{const offset=vector(p.position).sub(vector(p.target)),distance=Math.max(.05,Math.min(20000,offset.length()*factor));return normalizedPose({...p,position:tuple(vector(p.target).add(offset.setLength(distance)))});}
export function fitPose(p:CameraPose,bounds:Box3,fov:number,aspect:number,keepTarget=false):CameraPose{const n=normalizedPose(p),target=keepTarget?vector(n.target):bounds.getCenter(new Vector3()),direction=vector(n.position).sub(vector(n.target)).normalize(),up=vector(n.up),right=up.clone().cross(direction).normalize(),tan=Math.tan(fov*Math.PI/360);let distance=.05;for(const x of[bounds.min.x,bounds.max.x])for(const y of[bounds.min.y,bounds.max.y])for(const z of[bounds.min.z,bounds.max.z]){const v=new Vector3(x,y,z).sub(target);distance=Math.max(distance,Math.abs(v.dot(right))*1.1/(tan*aspect)+v.dot(direction),Math.abs(v.dot(up))*1.1/tan+v.dot(direction));}return{position:tuple(target.clone().addScaledVector(direction,distance)),target:tuple(target),up:n.up};}
/** Native camera local +X looks forward, local +Z is the image up direction. */
export function nativePoseRotation(p:CameraPose):[number,number,number,number]{const n=normalizedPose(p),x=vector(n.target).sub(vector(n.position)).normalize(),y=vector(n.up).cross(x).normalize(),z=x.clone().cross(y);return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z)).normalize().toArray()as[number,number,number,number];}
export function nativeScreenPose(p:CameraPose){const n=normalizedPose(p),direction=vector(n.target).sub(vector(n.position)).normalize(),right=direction.clone().cross(vector(n.up)).normalize(),up=n.position[2]-n.target[2],south=-n.position[1]||0,look=-n.target[1]||0;if(Math.abs(n.position[0])>1e-5||Math.abs(n.target[0])>1e-5||right.distanceTo(new Vector3(1,0,0))>1e-5||up<.1||up>2000||south<0||south>2000||Math.abs(look)>2000)return null;return{upDistance:up,southDistance:south,lookAtSouthDistance:look};}
/** Write the supported components even if native runtime cannot express X/roll.
 * Rejecting the whole pose used to leave unrelated, stale distance parameters.
 */
export function nativeScreenParameters(p:CameraPose){
 validatePose(p);const up=p.position[2]-p.target[2],south=-p.position[1]||0,look=-p.target[1]||0;
 return{...(up>=.1&&up<=2000?{upDistance:up}:{}),...(south>=0&&south<=2000?{southDistance:south}:{}),...(Math.abs(look)<=2000?{lookAtSouthDistance:look}:{})};
}
