import {Matrix4,Vector3,Vector4} from 'three';

export type ProjectedSegment=[number,number,number,number];

/** Clip before dividing by W, including segments crossing the camera's near plane. */
export function projectScreenSegment(start:Vector3,end:Vector3,matrix:Matrix4):ProjectedSegment|null {
  const a=new Vector4(start.x,start.y,start.z,1).applyMatrix4(matrix);
  const b=new Vector4(end.x,end.y,end.z,1).applyMatrix4(matrix);
  const distances=(p:Vector4)=>[p.w+p.x,p.w-p.x,p.w+p.y,p.w-p.y,p.w+p.z,p.w-p.z];
  const first=distances(a),last=distances(b);
  let low=0,high=1;
  for(let i=0;i<first.length;i++){
    if(first[i]<0&&last[i]<0)return null;
    const difference=first[i]-last[i];
    if(first[i]<0)low=Math.max(low,first[i]/difference);
    if(last[i]<0)high=Math.min(high,first[i]/difference);
    if(low>high)return null;
  }
  const from=a.clone().lerp(b,low),to=a.clone().lerp(b,high);
  if(from.w<=1e-8||to.w<=1e-8)return null;
  const points:ProjectedSegment=[from.x/from.w,from.y/from.w,to.x/to.w,to.y/to.w];
  return points.every(Number.isFinite)?points:null;
}
