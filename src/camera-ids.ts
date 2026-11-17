import type {CameraConfig,CameraObjectEdit} from './shared';

const firstId=900*0x100000+1,lastId=901*0x100000;
const referenceFields=new Set(['position_id','look_at_id','overhead_map_id','script_target_entity_id']);

/** Retired IDs still belong to replayable history and must not be allocated again. */
export function cameraHistoryIds(config:CameraConfig|undefined):Set<number>{
 const ids=new Set(config?.controls?.map(c=>c.id));
 for(const edit of config?.edits??[]){
  if(edit.kind==='clone'){
   for(const id of Object.values(edit.ids))ids.add(id);
   if(!edit.sourceTemplate){ids.add(edit.sourceId);for(const id of Object.keys(edit.ids))ids.add(Number(id));}
  }else if(edit.kind==='delete')for(const id of edit.ids)ids.add(id);
  else{ids.add(edit.id);for(const [field,value]of Object.entries(edit.values))if(referenceFields.has(field)&&typeof value==='number'&&value)ids.add(value);}
 }
 return ids;
}

/**
 * Old builds reused deleted camera IDs for gameplay objects. Gameplay is replayed
 * first, so replay only those retired camera lifetimes with temporary IDs. Live
 * collisions remain errors; neither the saved history nor gameplay IDs change.
 */
export function cameraReplayEdits(edits:CameraObjectEdit[]|undefined,existing:Iterable<number>):CameraObjectEdit[]{
 const initial=new Set(existing),used=cameraHistoryIds({mode:'template',edits});
 for(const id of initial)used.add(id);
 const nextEvent=new Map<number,boolean>(),retired=new Map<number,Set<number>>();
 for(let i=(edits?.length??0)-1;i>=0;i--){
  const edit=edits![i];
  if(edit.kind==='delete')for(const id of edit.ids)nextEvent.set(id,true);
  else if(edit.kind==='clone')for(const id of Object.values(edit.ids)){
   if(nextEvent.get(id)){let ids=retired.get(i);if(!ids)retired.set(i,ids=new Set());ids.add(id);}
   nextEvent.set(id,false);
  }
 }
 let next=firstId;
 const aliases=new Map<number,number>(),active=new Set<number>(),resolve=(id:number)=>aliases.get(id)??id;
 return(edits??[]).map((edit,index)=>{
  if(edit.kind==='clone'){
   // Resolve source keys before installing aliases for the newly allocated IDs.
   const sourceId=edit.sourceTemplate?edit.sourceId:resolve(edit.sourceId);
   const sources=Object.entries(edit.ids).map(([source,id])=>[edit.sourceTemplate?Number(source):resolve(Number(source)),id]as const);
   const ids:Record<string,number>={};
   for(const [source,id]of sources){
    if(active.has(id))throw Error('新增相机 ID 冲突 #'+id);
    let target=id;
    if(initial.has(id)&&retired.get(index)?.has(id)){
     while(used.has(next))next++;
     if(next>=lastId)throw Error('新增对象编号空间已满');
     target=next++;used.add(target);aliases.set(id,target);
    }
    active.add(id);ids[source]=target;
   }
   return{...edit,sourceId,ids};
  }
  if(edit.kind==='patch')return{...edit,id:resolve(edit.id),values:Object.fromEntries(Object.entries(edit.values).map(([field,value])=>[field,referenceFields.has(field)&&typeof value==='number'?resolve(value):value]))};
  const ids=edit.ids.map(resolve);
  for(const id of edit.ids){active.delete(id);aliases.delete(id);}
  return{...edit,ids};
 });
}
