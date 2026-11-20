import {screenAt} from './camera-layout';
import type {LevelView} from './shared';
import type {LevelSettingsView} from './level-settings';
import {wrapScreenPoint} from './screen-wrapping';

type Screen=[number,number];
type Layout={origin:Screen;size:Screen};

export function roomBoundaryOpacity(settings?:LevelSettingsView) {
  if(!settings?.spotlight||settings.roomGlow===0)return 0;
  return settings.roomGlow!==undefined&&settings.roomGlow>0?settings.roomGlow:.7;
}

/** This overlay counts only actors available on the displayed height and in the loaded scene. */
export function roomPowerObjects(level:LevelView,layout:Layout,z:number) {
  const topology=level.topology;
  return level.entities.flatMap(entity=>{
    if(!entity.position||!['Gem_Slot','Promesst_Light'].includes(entity.type)||Math.abs(entity.position[2]-z)>.5)return [];
    const at=wrapScreenPoint(entity.position,topology);
    return [{id:entity.id,type:entity.type,room:screenAt(at,layout.origin,layout.size),at}];
  });
}

export function changedPowerRooms(level:LevelView,before:Layout,after:Layout,z:number) {
  const original=roomPowerObjects(level,before,z),byId=new Map(roomPowerObjects(level,after,z).map(entry=>[entry.id,entry]));
  return original.filter(entry=>{
    const next=byId.get(entry.id)!.room;
    return entry.room.some((n,i)=>before.origin[i]+n*before.size[i]!==after.origin[i]+next[i]*after.size[i]||before.size[i]!==after.size[i]);
  }).length;
}
