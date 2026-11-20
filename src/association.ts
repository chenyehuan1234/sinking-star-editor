import type {EntityView, Vec3, WorldProject} from './shared';

export const freezerConditions=['unlocked_by_id','unlocked_by_id2','unlocked_by_id3','unlocked_by_id4'] as const;
export type FreezerCondition=typeof freezerConditions[number];
export const isFreezerCondition=(field:string):field is FreezerCondition=>freezerConditions.some(key=>key===field);
export const freezerTargetTypes=['Level_Entry','Judge','Sign','Marker','Overworld_Unlock'];
export type ManagedEntryTargets=Partial<Record<FreezerCondition,string>>;
export interface AssociationTarget {
 key:string;
 title:string;
 detail?:string;
 search?:string;
 type?:string;
 position?:Vec3;
}
export interface IndexedAssociation {
 id:number;
 name:string;
 type:string;
 position:Vec3|null;
 channel?:string;
}
export const nativeValue=(entity:EntityView|undefined,field:string)=>entity?.nativeProperties?.find(p=>p.field.name===field)?.value;
export function entryModelSize(entity?:EntityView){
 const size=Number(nativeValue(entity,'size'));
 return Number.isFinite(size)&&size>0?size:1;
}
export const objectName=(entity:EntityView)=>String(nativeValue(entity,'entity_name')??'').trim();

export function matchesAssociation(target:AssociationTarget,query:string){
 const words=query.normalize('NFKC').trim().toLowerCase().split(/\s+/);
 if(!words[0])return true;
 const haystack=[target.title,target.detail,target.search,target.key].filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
 return words.every(word=>haystack.includes(word));
}

export function levelAssociationTargets(world:WorldProject|null,regions:ReadonlyMap<string,string>){
 const folders=new Map(world?.levelGroups?.map(group=>[group.id,group.title]));
 return world?.levels.map(level=>{
  const detail=[level.folderId&&folders.get(level.folderId),regions.get(level.project.template),level.project.name].filter(Boolean).join(' · ');
  return {key:level.id,title:level.title,detail,search:level.project.template};
 })??[];
}

export function parseChannel(value:string):string {
 const input=value.trim();
 if(!/^[+-]?\d{1,20}$/.test(input))throw Error('请输入整数频道号');
 const number=BigInt(input);
 if(number<-(1n<<63n)||number>=(1n<<63n))throw Error('频道号超过原生整数范围');
 return number.toString();
}
