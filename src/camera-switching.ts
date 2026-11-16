import type {EntityView,LevelView} from './shared';

const value=(e:EntityView,name:string)=>e.nativeProperties?.find(p=>p.field.name===name)?.value;
/** View_Giver links named alternate views by name, and overview cameras by ID.
 * These are native authoring links; an editor's selected screen is not a trigger.
 */
export function cameraViewGivers(level:LevelView){
 const cameras=level.camera?.controls??[];
 return level.entities.filter(e=>e.type==='View_Giver').map(e=>{
  const name=String(value(e,'viewpoint_name')??''),ids=[Number(value(e,'map_overview_id')??0),Number(value(e,'map_overview_id_2')??0)].filter(Boolean);
  return{id:e.id,name,position:e.position,cameras:cameras.filter(c=>ids.includes(c.id)||!c.primary&&!c.overview&&!!name&&c.name===name),ids};
 });
}
