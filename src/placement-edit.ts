import type{EditOp,EntityView,Vec3}from'./shared';
import type{VoxelIndex,WorkPlane}from'./terrain-edit';
import {planeRectangle} from './terrain-edit';
export function rectangularFace(index:VoxelIndex,start:Vec3,end:Vec3,normal:Vec3):Vec3[]{const plane=normal[2]?'XY':normal[1]?'XZ':'YZ';return planeRectangle(start,end,plane).filter(p=>index.has(p)&&!index.has(facePlacement(p,normal)));}

export function facePlacement(cell:Vec3,normal:Vec3,erase=false):Vec3{return cell.map((n,i)=>n+(erase?0:normal[i]))as Vec3;}
export function faceBrush(index:VoxelIndex,center:Vec3,plane:WorkPlane,size:number,erase=false):Vec3[]{
 if(!Number.isInteger(size)||size<1||size>9||size%2===0)throw Error('笔刷尺寸须为 1～9 的奇数');
 const axes=plane==='XY'?[0,1]:plane==='XZ'?[0,2]:[1,2],result:Vec3[]=[],radius=(size-1)/2;
 for(let u=-radius;u<=radius;u++)for(let v=-radius;v<=radius;v++){const at=[...center]as Vec3;at[axes[0]]+=u;at[axes[1]]+=v;if(index.has(at)===erase)result.push(at);}
 return result;
}
export function exposedFace(index:VoxelIndex,seed:Vec3,normal:Vec3,limit=4096):Vec3[]{
 const axis=normal.findIndex(n=>n!==0);if(axis<0||normal.filter(Boolean).length!==1||Math.abs(normal[axis])!==1)throw Error('地形面方向无效');
 const result:Vec3[]=[],queue:Vec3[]=[seed],seen=new Set<string>(),axes=[0,1,2].filter(i=>i!==axis);
 for(let i=0;i<queue.length;i++){const p=queue[i],key=p.join(',');if(seen.has(key))continue;seen.add(key);if(!index.has(p)||index.has(facePlacement(p,normal)))continue;result.push(p);if(result.length>limit)throw Error(`该连续面超过 ${limit} 格，请用矩形先划分地形`);for(const a of axes)for(const sign of[-1,1]){const next=[...p]as Vec3;next[a]+=sign;queue.push(next);}}
 return result;
}
export function extrudeFace(index:VoxelIndex,face:Vec3[],normal:Vec3,distance:number,limit=4096):{positions:Vec3[];solid:boolean}{
 if(!Number.isInteger(distance)||Math.abs(distance)>128)throw Error('单次拉伸最多 128 层');
 const solid=distance>0,positions:Vec3[]=[];
 if(face.length*Math.abs(distance)>limit)throw Error(`一次最多编辑 ${limit} 格，请缩小面或拉伸距离`);
 for(const p of face)for(let step=0;step<Math.abs(distance);step++){const at=p.map((n,i)=>n+normal[i]*(solid?step+1:-step))as Vec3;if(at.some(n=>Math.abs(n)>=10000))throw Error('拉伸超出坐标范围');if(index.has(at)!==solid)positions.push(at);}
 return{positions,solid};
}
const property=(e:EntityView,name:string)=>e.nativeProperties?.find(p=>p.field.name===name)?.value??0;
export function ordinaryChannelObject(e:EntityView){return e.type==='Gate'?!Boolean(property(e,'is_monster_gate')):e.type==='Switch'&&Number(property(e,'special_type'))===0;}
export function channelLinkOperations(all:EntityView[],ids:number[],targetId:number):EditOp[]{
 const source=ids.map(id=>all.find(e=>e.id===id)),target=all.find(e=>e.id===targetId);
 if(!source.length||source.some(e=>!e||!ordinaryChannelObject(e))||!target||!ordinaryChannelObject(target))throw Error('快速频道关联只支持普通开关和普通门闸；怪物门与特殊开关沿用原生规则');
 if(ids.includes(targetId))throw Error('请选择所选物件之外的关联目标');
 const flavor=property(target,'flavor');return source.filter(e=>String(property(e!,'flavor'))!==String(flavor)).map(e=>({kind:'properties',id:e!.id,values:{flavor}}));
}
