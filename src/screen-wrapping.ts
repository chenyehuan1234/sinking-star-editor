import type {TopologyConfig,Vec3} from './shared';

type Pair=[number,number];
type Bounds=Pick<TopologyConfig,'corner'|'size'|'wrapping'>;

/** Rebase whole-room offsets without moving a single physical screen edge. */
export function wrappedScreenOrigin(origin:Pair,size:Pair,topology?:Bounds):Pair {
  if(!topology?.wrapping)return [...origin];
  return origin.map((n,i)=>(topology.corner[i]-n)%size[i]===0?topology.corner[i]:n) as Pair;
}

export function wrapScreenPoint(point:Vec3,topology?:Bounds):Vec3 {
  if(!topology?.wrapping)return [...point];
  return point.map((n,i)=>{
    if(i===2)return n;
    const lower=topology.corner[i]-.5,period=topology.size[i];
    return lower+((n-lower)%period+period)%period;
  }) as Vec3;
}

export function screenWrappingWarnings(origin:Pair,size:Pair,topology?:Bounds):string[] {
  if(!topology?.wrapping)return [];
  return ([0,1] as const).flatMap(axis=>{
    const label='XY'[axis],result:string[]=[];
    if((topology.corner[axis]-origin[axis])%size[axis]!==0)result.push(label+' 轴循环起点穿过分屏内部，跨循环边界后镜头和供电房间无法按整屏接续');
    if(topology.size[axis]%size[axis]!==0)result.push(label+' 轴循环周期 '+topology.size[axis]+' 格不是每屏 '+size[axis]+' 格的整数倍，循环接缝会截断房间');
    return result;
  });
}

export function screenAlignedTopology(topology:Bounds,origin:Pair,size:Pair):Bounds {
  const corner=[...topology.corner] as Vec3,extent=[...topology.size] as Vec3;
  for(const axis of [0,1] as const){
    const end=corner[axis]+extent[axis];
    corner[axis]=origin[axis]+Math.floor((corner[axis]-origin[axis])/size[axis])*size[axis];
    extent[axis]=Math.ceil((end-corner[axis])/size[axis])*size[axis];
  }
  return {...topology,corner,size:extent};
}
