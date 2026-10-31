import type{CameraConfig,CameraOverride}from'./shared';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Rebase a queued camera change onto the latest committed configuration. */
export function mergeCameraChange(before:CameraConfig|undefined,next:CameraConfig,latest:CameraConfig|undefined):CameraConfig{
 const result:CameraConfig={...latest,mode:latest?.mode??next.mode};
 for(const key of['mode','screenSize','origin','margins']as const)if(!same(before?.[key],next[key])){if(next[key]===undefined)delete(result as any)[key];else(result as any)[key]=structuredClone(next[key]);}
 if(!same(before?.controls,next.controls)){
  if(next.controls===undefined)delete result.controls;
  else{const old=new Map(before?.controls?.map(v=>[v.id,v])),changed=new Map(next.controls.map(v=>[v.id,v])),merged=new Map(latest?.controls?.map(v=>[v.id,{...v}]));for(const id of old.keys())if(!changed.has(id))merged.delete(id);for(const[id,item]of changed){const previous=old.get(id);if(same(previous,item))continue;const value:CameraOverride={...(merged.get(id)??{id})};for(const key of new Set([...Object.keys(previous??{}),...Object.keys(item)]))if(key!=='id'&&!same((previous as any)?.[key],(item as any)[key])){if((item as any)[key]===undefined)delete(value as any)[key];else(value as any)[key]=structuredClone((item as any)[key]);}if(item.target&&!same(previous?.target,item.target))delete value.position;if(item.position&&!same(previous?.position,item.position)){delete value.target;delete value.yaw;}merged.set(id,value);}result.controls=[...merged.values()];}
 }
 if(!same(before?.edits,next.edits)){const base=before?.edits??[],following=next.edits??[];if(following.length>=base.length&&base.every((v,i)=>same(v,following[i])))result.edits=[...(latest?.edits??[]),...structuredClone(following.slice(base.length))];else result.edits=structuredClone(next.edits);}
 return result;
}
export function shouldCommitBufferedValue(value:string,started:string,type:string){return value!==started&&(type!=='number'||value!==''&&Number.isFinite(Number(value)));}
