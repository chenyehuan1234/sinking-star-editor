import type {Vec3} from './shared';

export function regionPoint([x,y,z]:Vec3,[a,b,c]:Vec3,yaw:number):Vec3{
  const angle=yaw*Math.PI/180,co=Math.round(Math.cos(angle)),si=Math.round(Math.sin(angle));
  return [x*co-y*si+a,x*si+y*co+b,z+c];
}

export function regionCorners([x,y,z]:Vec3,at:Vec3,yaw:number):Vec3[]{
  return ([[0,0,0],[x-1,0,0],[0,y-1,0],[x-1,y-1,z-1]] as Vec3[]).map(p=>regionPoint(p,at,yaw));
}
