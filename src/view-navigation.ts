import {Vector3,Quaternion} from 'three';
import type {Vec3} from './shared';
import {alignPose,transformPose,nativeScreenPose} from './camera-pose';

export interface CubeFace {key:string;direction:Vec3;vertices:Vec3[];label:string}
/** Intersect the 26 clipping planes of a cube with chamfered edges and corners. */
export function bevelCube():CubeFace[]{
 const planes:{n:Vector3;d:number;direction:Vec3}[]=[];
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
  const count=Number(x!==0)+Number(y!==0)+Number(z!==0);if(!count)continue;
  const direction:Vec3=[x,y,z];planes.push({n:new Vector3(x,y,z),d:count===1?1:count===2?1.68:2.42,direction});
 }
 const vertices:Vector3[]=[];
 for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++)for(let k=j+1;k<planes.length;k++){
  const a=planes[i],b=planes[j],c=planes[k],bc=b.n.clone().cross(c.n),det=a.n.dot(bc);if(Math.abs(det)<1e-8)continue;
  const v=bc.multiplyScalar(a.d).add(c.n.clone().cross(a.n).multiplyScalar(b.d)).add(a.n.clone().cross(b.n).multiplyScalar(c.d)).divideScalar(det);
  if(planes.every(p=>p.n.dot(v)<=p.d+1e-6)&&!vertices.some(p=>p.distanceToSquared(v)<1e-10))vertices.push(v);
 }
 return planes.map(({n,d,direction})=>{
  const points=vertices.filter(v=>Math.abs(n.dot(v)-d)<1e-6),center=points.reduce((a,b)=>a.add(b),new Vector3()).divideScalar(points.length),u=points[0].clone().sub(center).normalize(),v=n.clone().normalize().cross(u);
  points.sort((a,b)=>Math.atan2(a.clone().sub(center).dot(v),a.clone().sub(center).dot(u))-Math.atan2(b.clone().sub(center).dot(v),b.clone().sub(center).dot(u)));
  return{key:direction.join(','),direction,vertices:points.map(p=>p.toArray()as Vec3),label:direction.flatMap((s,i)=>s?[(s>0?'+':'−')+'XYZ'[i]]:[]).join(' / ')};
 });
}
export type LensAction='translate'|'rotate';
export interface LensPose {target:Vec3;upDistance:number;southDistance:number;yaw:number;position?:Vec3;up?:Vec3}
export function lensDirectionReason(direction:Vec3,restricted=false){
 if(!direction.every(Number.isFinite)||direction.every(n=>n===0))return'镜头方向无效';
 return'';
}
export function lensAxisReason(action:LensAction,axis:number,screens:boolean,overview:boolean){
 return'';
}
function fullLens(pose:LensPose){const a=pose.yaw*Math.PI/180;return{position:pose.position??[pose.target[0]+Math.sin(a)*pose.southDistance,pose.target[1]-Math.cos(a)*pose.southDistance,pose.target[2]+pose.upDistance]as Vec3,target:pose.target,up:pose.up??(Math.abs(pose.southDistance)<.000001?[-Math.sin(a),Math.cos(a),0]:[0,0,1])as Vec3};}
function lensResult(pose:LensPose,next:import('./shared').CameraPose):LensPose{const v=new Vector3(...next.position).sub(new Vector3(...next.target));return{...pose,...next,upDistance:v.z,southDistance:Math.hypot(v.x,v.y),yaw:Math.atan2(v.x,-v.y)*180/Math.PI};}
export function lensPoseForDirection(pose:LensPose,direction:Vec3):LensPose{return lensResult(pose,alignPose(fullLens(pose),direction));}
export function transformLens(pose:LensPose,action:LensAction,axis:number,amount:number):LensPose{return lensResult(pose,transformPose(fullLens(pose),action,axis,amount));}
/** Legacy callers are promoted to a full pose; runtime compatibility is reported separately. */
export function transformScreenLens(pose:LensPose,action:LensAction,axis:number,amount:number):LensPose{
 const full={...pose,position:pose.position??[pose.target[0],pose.target[1]-pose.southDistance,pose.target[2]+pose.upDistance]as Vec3,up:pose.up??[0,0,1]as Vec3},next=transformLens(full,action,axis,amount),native=nativeScreenPose({position:next.position!,target:next.target,up:next.up!});return{...next,...native};
}
