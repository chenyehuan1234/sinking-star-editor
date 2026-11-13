import{OBJECT_BY_TYPE}from'./core/object-definitions';
import type{RegionBundle}from'./shared';
import{placementProfile,type PlacementPreferences}from'./input-config';import{defaultTerrainPreferences,type TerrainPreferences}from'./terrain-edit';
export interface SlotHabits{placement:PlacementPreferences;heightMode:'locked'|'surface';yaw:number;terrain:TerrainPreferences}
export type QuickSlot={kind:'terrain';tool:'floor'|'wall'|'erase';name:string;habits:SlotHabits}|{kind:'object';name:string;type:string;presetKey?:string;bundle:RegionBundle;habits:SlotHabits};
export interface QuickSlotSet{version:1;sourceHash:string;sourceBuild:string;slots:(QuickSlot|null)[];errors?:Record<string,string>}
export function defaultQuickSlots(sourceHash:string,sourceBuild:string):QuickSlotSet{return{version:1,sourceHash,sourceBuild,slots:Array.from({length:8},(_,i)=>i<2?{kind:'terrain' as const,tool:i===0?'floor' as const:'wall' as const,name:i===0?'地面':'墙体',habits:{placement:placementProfile('terrain'),heightMode:'surface',yaw:0,terrain:{...defaultTerrainPreferences(),plane:'auto'}}}:null)};}
export const slotCommand=(i:number,save=false)=>(save?'saveSlot':'slot')+(i+1);
export function ordinarySlotType(type:string){const d=OBJECT_BY_TYPE.get(type);return !!d&&d.placement==='single'&&['character','monster','block','mechanism','world'].includes(d.category)&&!['Ocean_Map','Level_Entry'].includes(type);}
