import type{EntityView}from'./shared';
export interface CharacterGroup{key:number;ids:number[];anchorId?:number}
export function characterControlId(entity:EntityView):number{return Number(entity.nativeProperties?.find(p=>p.field.name==='turn_order_id')?.value??0)||entity.id;}
export function characterGroups(entities:EntityView[]):CharacterGroup[]{const groups=new Map<number,CharacterGroup>();for(const e of entities){if(e.type!=='Guy')continue;const key=characterControlId(e),group=groups.get(key)??{key,ids:[]};group.ids.push(e.id);if(e.id===key)group.anchorId=e.id;groups.set(key,group);}return[...groups.values()];}
