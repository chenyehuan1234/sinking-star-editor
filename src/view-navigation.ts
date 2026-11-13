import {Vector3,Quaternion} from 'three';
import type {Vec3} from './shared';

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
export interface LensPose {target:Vec3;upDistance:number;southDistance:number;yaw:number}
export function lensDirectionReason(direction:Vec3,restricted=false){
 if(direction[2]<=0)return'原生玩法镜头需要位于取景中心上方，不能精确对齐此方向';
 if(restricted&&(direction[0]!==0||direction[1]>0))return'此镜头保持原生南向，不能对齐此方向';
 return'';
}
export function lensAxisReason(action:LensAction,axis:number,screens:boolean,overview:boolean){
 if(screens&&(action==='translate'?axis!==2:axis!==0))return'原生分屏只支持高度平移与南向俯仰';
 if(overview&&action==='rotate'&&axis!==0)return'总览镜头保持原生方向，仅支持俯仰';return'';
}
export function lensPoseForDirection(pose:LensPose,direction:Vec3):LensPose{
 const reason=lensDirectionReason(direction);if(reason)throw Error(reason);
 const distance=Math.hypot(pose.upDistance,pose.southDistance),v=new Vector3(...direction).normalize().multiplyScalar(distance);
 return{...pose,upDistance:v.z,southDistance:Math.hypot(v.x,v.y),yaw:Math.atan2(v.x,-v.y)*180/Math.PI};
}
export function transformLens(pose:LensPose,action:LensAction,axis:number,amount:number):LensPose{
 if(!Number.isFinite(amount))throw Error('镜头变换无效');
 if(action==='translate'){const target=[...pose.target]as Vec3;target[axis]+=amount;if(target.some(n=>Math.abs(n)>=100000))throw Error('镜头位置超出原生范围');return{...pose,target};}
 const a=pose.yaw*Math.PI/180,v=new Vector3(Math.sin(a)*pose.southDistance,-Math.cos(a)*pose.southDistance,pose.upDistance).applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3().setComponent(axis,1),amount));
 if(v.z<.1||v.z>2000||Math.hypot(v.x,v.y)>2000)throw Error('已到原生镜头范围，不能越过取景平面或远近上限');
 return{...pose,upDistance:v.z,southDistance:Math.hypot(v.x,v.y),yaw:Math.atan2(v.x,-v.y)*180/Math.PI};
}
