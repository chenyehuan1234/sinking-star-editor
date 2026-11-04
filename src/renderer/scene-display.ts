import {ordinaryChannelObject} from '../placement-edit';
import {entityKey,type ObjectKey} from '../editor-organization';
import type{EntityView,LevelView}from'../shared';import{isAdded,isScenery}from'../editor-math';
export const displayCategories=[['terrain','地形'],['character','角色'],['monster','怪物'],['mechanism','机关／方块'],['water','水域'],['decoration','用户装饰'],['background','原版背景']]as const;
export type DisplayCategory=typeof displayCategories[number][0];export interface SceneDisplay{objects?:Record<string,{hidden?:boolean;locked?:boolean}>;isolate?:ObjectKey[];mode:'all'|'current'|'range';min:number;max:number;follow:boolean;upper:'fade'|'hide';cut:boolean;categories:Record<DisplayCategory,{visible:boolean;locked:boolean}>}
export const defaultDisplay=():SceneDisplay=>({mode:'all',min:0,max:0,follow:true,upper:'fade',cut:false,categories:Object.fromEntries(displayCategories.map(([key])=>[key,{visible:key!=='background',locked:key==='background'}]))as SceneDisplay['categories']});
export function categoryOf(e:EntityView):DisplayCategory{return e.type==='Wall_Set'?'terrain':e.type==='Ocean_Map'?'water':e.type==='Guy'?'character':['Monster','Friendly_Dragon','Baby_Dragon','Egg'].includes(e.type)?'monster':isScenery(e)?isAdded(e)?'decoration':'background':'mechanism';}
export function visibility(e:EntityView,d:SceneDisplay,layer:number):'visible'|'faded'|'hidden'{const c=d.categories[categoryOf(e)];if(d.objects?.[entityKey(e.id)]?.hidden||d.isolate?.length&&!d.isolate.includes(entityKey(e.id))&&!['terrain','water','background'].includes(categoryOf(e)))return'hidden';if(!c.visible)return'hidden';if(categoryOf(e)==='background'&&d.cut)return'visible';return heightVisibility(e.position?.[2]??0,d,layer);}
export function heightVisibility(z:number,d:SceneDisplay,layer:number):'visible'|'faded'|'hidden'{if(d.mode==='all')return'visible';const lo=d.mode==='current'?d.follow?layer:d.min:Math.min(d.min,d.max),hi=d.mode==='current'?lo:Math.max(d.min,d.max);return z<lo-.49?'hidden':z>hi+.49?d.upper==='fade'?'faded':'hidden':'visible';}
export function canModify(e:EntityView,d:SceneDisplay,layer:number){return visibility(e,d,layer)==='visible'&&!objectLocked(e,d);}
export function objectLocked(e:EntityView,d:SceneDisplay){return d.categories[categoryOf(e)].locked||Boolean(d.objects?.[entityKey(e.id)]?.locked);}
export function keyLocked(key:ObjectKey,d:SceneDisplay){return Boolean(d.objects?.[key]?.locked)||(key.startsWith('entry:')&&d.categories.mechanism.locked);}
export function keyVisible(key:ObjectKey,d:SceneDisplay){return !d.objects?.[key]?.hidden&&(!d.isolate?.length||d.isolate.includes(key));}
export function channelKey(value:unknown){try{return BigInt(String(value??0)).toString();}catch{return String(value);}}
export function channelHue(key:unknown){let n=0;for(const c of String(key))n=(n*31+c.charCodeAt(0))%360;return n;}
const relationCache=new WeakMap<LevelView,ReturnType<typeof buildRelations>>();
function buildRelations(level:LevelView){const byId=new Map(level.entities.map(e=>[e.id,e])),byChannel=new Map<string,EntityView[]>();for(const e of level.entities)if(ordinaryChannelObject(e)){const id=channelKey(e.nativeProperties?.find(p=>p.field.name==='flavor')?.value??0),members=byChannel.get(id)??[];members.push(e);byChannel.set(id,members);}const channels=[...byChannel].map(([id,members])=>({id,members})),references=level.entities.flatMap(e=>(e.nativeProperties??[]).filter(p=>p.field.kind==='reference'&&!['turn_order_id','transmute_stashed_turn_order_id'].includes(p.field.name)&&Number(p.value)).map(p=>({source:e,field:p.field,target:byId.get(Number(p.value)),targetId:Number(p.value)})));return{channels,references};}
export function relations(level:LevelView){let graph=relationCache.get(level);if(!graph){graph=buildRelations(level);relationCache.set(level,graph);}return graph;}

export type RelationScope='selected'|'channel'|'all';
export function relationsFor(level:LevelView,selection:number[],scope:RelationScope){
 const graph=relations(level);if(scope==='all')return graph;const chosen=new Set(selection),channels=graph.channels.filter(c=>c.members.some(e=>chosen.has(e.id)));
 if(scope==='channel')for(const channel of channels)for(const member of channel.members)chosen.add(member.id);
 return{channels,references:graph.references.filter(r=>chosen.has(r.source.id)||chosen.has(r.targetId))};
}

export function terrainTouchesLocked(level:LevelView|null,display:SceneDisplay,positions:{x:number;y:number;z:number}[]){if(display.categories.terrain.locked)return positions.length>0;const ids=new Set(level?.entities.filter(e=>objectLocked(e,display)).map(e=>e.id));if(!ids.size)return false;const locked=new Set(level?.terrain?.filter(c=>c.id!==undefined&&ids.has(c.id)).map(c=>`${c.x},${c.y},${c.z-1}`));return positions.some(c=>locked.has(`${c.x},${c.y},${c.z}`));}
