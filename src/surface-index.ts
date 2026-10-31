import{Ray,Vector3}from'three';
import type{LevelView}from'./shared';
/** Top faces indexed by elevation. Query cost depends on height layers, not number of voxels. */
export class SurfaceIndex{
 readonly layers=new Map<number,Set<string>>();
 constructor(terrain:NonNullable<LevelView['terrain']>){for(const p of terrain){let cells=this.layers.get(p.z);if(!cells)this.layers.set(p.z,cells=new Set());cells.add(p.x+','+p.y);}}
 hits(ray:Ray,visible:(z:number)=>boolean){const hits:Vector3[]=[];if(ray.direction.z>=-1e-9)return hits;for(const[z,cells]of this.layers){if(!visible(z))continue;const t=(z-ray.origin.z)/ray.direction.z;if(t<0)continue;const p=ray.at(t,new Vector3());if(cells.has(Math.round(p.x)+','+Math.round(p.y)))hits.push(p);}return hits;}
}
