import type{EditOp,LevelView}from'./shared';
/** Property previews update overlays (channels/directions) without native compilation. */
export function optimisticPropertyDraft(level:LevelView|null,operations:EditOp[]):LevelView|null{
 const changes=new Map<number,Record<string,import('./catalog-types').NativeValue>>();for(const op of operations)if(op.kind==='properties')changes.set(op.id,{...changes.get(op.id),...op.values});
 if(!level||!changes.size)return level;return{...level,entities:level.entities.map(e=>{const values=changes.get(e.id);return values?{...e,nativeProperties:e.nativeProperties?.map(p=>Object.hasOwn(values,p.field.name)?{...p,value:values[p.field.name],defaulted:false}:p)}:e;})};
}
/** Keep committed transforms visible while the native preview is in flight. */
export function optimisticTransforms(level:LevelView|null,operations:EditOp[]):LevelView|null{
 if(!level||!operations.length)return level;
 const changes=new Map<number,Extract<EditOp,{kind:'transform'}>>();
 for(const op of operations)if(op.kind==='transform')changes.set(op.id,{...changes.get(op.id),...op});
 return{...level,entities:level.entities.map(e=>{const op=changes.get(e.id);return op?{...e,...(op.position?{position:op.position}:{}),...(op.rotation?{rotation:op.rotation}:{}),...(op.scale?{scale:op.scale}:{})}:e;})};
}
/** Native previews are IPC copies: retain unchanged heavy buffers to avoid rebuilding GPU terrain. */
export function retainSceneBuffers(previous:LevelView|null,next:LevelView|null):LevelView|null{
 if(!previous||!next||previous.name!==next.name)return next;
 const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 return{...next,terrain:equal(previous.terrain,next.terrain)?previous.terrain:next.terrain,waters:equal(previous.waters,next.waters)?previous.waters:next.waters,camera:equal(previous.camera,next.camera)?previous.camera:next.camera};
}
