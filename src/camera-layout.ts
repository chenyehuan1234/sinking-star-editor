import {newScreenSize} from './level-settings';
import {Box3,Vector3} from 'three';
import type {CameraConfig,LevelView,Vec3} from './shared';
import type {CameraPlan} from './editor-organization';

export function screenLayout(level:LevelView,config?:CameraConfig){
 const enabled=config?.mode==='screens'||config?.mode!=='single'&&!!level.camera?.perScreen;
 const size=config?.screenSize??(level.camera?.perScreen?level.camera.screenSize:[newScreenSize,newScreenSize] as [number,number]);
 return{size,origin:config?.origin??level.camera?.origin??[0,0],enabled};
}
/** Native integer positions are cell centres; screen edges lie half a cell before origin. */
export function screenAt(point:Vec3,origin:[number,number],size:[number,number]):[number,number]{return[Math.floor((point[0]-origin[0]+.5)/size[0]),Math.floor((point[1]-origin[1]+.5)/size[1])];}
export function screenCenter(room:[number,number],origin:[number,number],size:[number,number],z:number):Vec3{return[origin[0]+(room[0]+.5)*size[0]-.5,origin[1]+(room[1]+.5)*size[1]-.5,z];}
export function screenCoverage(bounds:Box3,origin:[number,number],size:[number,number]){
 if(bounds.isEmpty())return null;
 const low=screenAt(bounds.min.toArray(),origin,size),high=screenAt(bounds.max.clone().subScalar(1e-6).toArray(),origin,size);
 return{low,high,columns:high[0]-low[0]+1,rows:high[1]-low[1]+1};
}
export function plannedScreens(level:LevelView,config?:CameraConfig,plan?:CameraPlan){
 const layout=screenLayout(level,config),topology=layout.enabled&&level.topology?.wrapping?level.topology:undefined;
 if(plan)return {...plan,automatic:false};
 const bounds=topology?new Box3(new Vector3(topology.corner[0]-.5,topology.corner[1]-.5,0),new Vector3(topology.corner[0]+topology.size[0]-.5,topology.corner[1]+topology.size[1]-.5,1)):layoutBounds(level);
 const covered=screenCoverage(bounds,layout.origin,layout.size);
 return {start:covered?.low??[0,0] as [number,number],columns:covered?.columns??1,rows:covered?.rows??1,automatic:true};
}
export function screenInPlan(room:[number,number],plan:CameraPlan){return room.every((n,i)=>n>=plan.start[i]&&n<plan.start[i]+(i?plan.rows:plan.columns));}
export function moveScreenLayout(config:CameraConfig|undefined,plan:CameraPlan,origin:[number,number],delta:[number,number]){
 const next=origin.map((n,i)=>n+delta[i])as[number,number];if(next.some(n=>!Number.isInteger(n)||Math.abs(n)>10000))throw Error('分屏起点须为 −10000～10000 的整数');
 return{config:{...config,mode:'screens' as const,origin:next},plan:{start:[...plan.start]as[number,number],columns:plan.columns,rows:plan.rows}};
}
/** Navigation follows the same planned grid as the overlay, including empty screens.
 * Page large layouts instead of silently truncating them or mounting 262,144 options.
 */
export function screenNavigation(level:LevelView,config?:CameraConfig,plan?:CameraPlan,z=0,page=0){
 const l=screenLayout(level,config),p=plannedScreens(level,config,plan),total=l.enabled?p.columns*p.rows:0,pageSize=500,pages=Math.ceil(total/pageSize),current=Math.max(0,Math.min(Math.floor(page),Math.max(0,pages-1))),offset=current*pageSize;
 const rooms=Array.from({length:Math.min(pageSize,Math.max(0,total-offset))},(_,i)=>{const index=offset+i,column=p.start[0]+index%p.columns,row=p.start[1]+Math.floor(index/p.columns);return{key:`${column},${row},${z}`,index,column,row,columnNumber:index%p.columns+1,rowNumber:Math.floor(index/p.columns)+1,x:l.origin[0]+column*l.size[0],y:l.origin[1]+row*l.size[1],z,sx:l.size[0],sy:l.size[1]};});
 return{rooms,total,page:current,pages,offset};
}
export function cameraLayer(level:LevelView,id:number){
 const c=level.camera?.controls.find(c=>c.id===id);if(!c)return{z:0,known:false,label:'观察高度未确认'};
 if(c.resolvedTarget)return{z:c.resolvedTarget[2],known:true,label:'原生观察目标'};
 // camera_z_lock targets a height anchor, not a Camera_Control; its float is priority.
 const heights=[...new Set(level.entities.filter(e=>e.type==='Guy'&&e.position).map(e=>e.position![2]))];
 if(heights.length===1&&!level.partial&&(level.camera?.layered===false&&c.primary||level.camera?.controls.filter(c=>c.primary&&!c.overview).length===1))return{z:heights[0],known:true,label:'单一玩法高度'};
 return{z:c.position[2]-c.upDistance,known:false,label:'观察高度未确认，请取点'};
}
export function layoutBounds(level:LevelView){const b=new Box3();for(const p of level.terrain??[])b.expandByPoint(new Vector3(p.x,p.y,p.z));for(const e of level.entities)if(e.position&&!['Inanimate','Decal','Sky','Sun','Fog','Point_Light','Light_Probe','Camera_Control','Camera_Marker','Marker','Wall_Set','Ocean_Map'].includes(e.type))b.expandByPoint(new Vector3(...e.position));if(!b.isEmpty()){b.min.x-=.5;b.min.y-=.5;b.max.x+=.5;b.max.y+=.5;}return b;}
