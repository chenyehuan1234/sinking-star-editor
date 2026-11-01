import type{TopologyConfig,LevelView}from'./shared';
import{gameplayObject}from'./editor-math';

export function fitTopologyXY(level:LevelView|undefined|null,value:TopologyConfig):TopologyConfig{
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 const include=(x:number,y:number)=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
 for(const c of level?.terrain??[])include(c.x,c.y);
 for(const e of level?.entities??[])if(e.position&&gameplayObject(e)&&e.type!=='Camera_Control')include(e.position[0],e.position[1]);
 for(const w of level?.waters??[])if(w.width>0&&w.height>0){include(w.x,w.y);include(w.x+w.width-1,w.y+w.height-1);}
 return Number.isFinite(minX)?{...value,corner:[Math.floor(minX),Math.floor(minY),value.corner[2]],size:[Math.ceil(maxX)-Math.floor(minX)+1,Math.ceil(maxY)-Math.floor(minY)+1,value.size[2]]}:structuredClone(value);
}

/** Rebase only edited fields, including individual axes, over queued changes. */
export function mergeTopologyChange(base:TopologyConfig|undefined,next:TopologyConfig|undefined,current:TopologyConfig|undefined):TopologyConfig|undefined{
 if(next===undefined)return;
 if(!base)return structuredClone(next);
 const value=structuredClone(current??base);
 for(const name of['wrapping','wrappingOverride','forceWrappingOverride']as const)if(next[name]!==base[name])(value[name]as number|boolean)=next[name];
 for(const name of['corner','size']as const)for(const axis of[0,1,2])if(next[name][axis]!==base[name][axis])value[name][axis]=next[name][axis];
 return value;
}
