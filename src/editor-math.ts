import type {EntityView,Vec3,LevelView,NativeCameraView,EditOp} from './shared';
export type EditorTool='select'|'translate'|'rotate'|'scale'|'marquee'|'deleteRect'|'stampRect'|'floor'|'wall'|'erase'|'spawn'|'entry'|'copyRegion'|'extrude';
export const cameraDragThreshold=(x:number,y:number,atX:number,atY:number)=>Math.hypot(atX-x,atY-y)>5;
export const isScenery=(e:EntityView)=>['Inanimate','Decal','Animating','Procedurally_Animating','Outline_Override'].includes(e.type);
export const isAdded=(e:EntityView)=>!e.generatedSurface&&[899,900].includes(e.id>>>20);
export function gameplayObject(e:EntityView){return e.editable&&!['Inanimate','Decal','Animating','Procedurally_Animating','Group','Marker','Wall_Set','Ocean_Map','Level_Entry','Camera_Marker','Trigger','Outline_Override'].includes(e.type);}
export function designVisible(e:EntityView,showBackground=false){return gameplayObject(e)||isAdded(e)||showBackground&&isScenery(e);}
export function selectableObject(e:EntityView,unlockBackground=false){return e.editable&&!e.generatedSurface&&(gameplayObject(e)||isAdded(e)||unlockBackground)&&!['Level_Entry','Camera_Control','Camera_Marker'].includes(e.type);}
export function rectangleCells(a:Vec3,b:Vec3,spacing:[number,number]=[1,1],limit=4096):Vec3[]{
  const minX=Math.min(Math.round(a[0]),Math.round(b[0])),maxX=Math.max(Math.round(a[0]),Math.round(b[0])),minY=Math.min(Math.round(a[1]),Math.round(b[1])),maxY=Math.max(Math.round(a[1]),Math.round(b[1]));
  const sx=Math.max(1,Math.round(spacing[0])),sy=Math.max(1,Math.round(spacing[1])),count=(Math.floor((maxX-minX)/sx)+1)*(Math.floor((maxY-minY)/sy)+1);if(count>limit)throw new Error(`一次最多铺设 ${limit} 格，请缩小区域`);
  const result:Vec3[]=[];for(let y=minY;y<=maxY;y+=sy)for(let x=minX;x<=maxX;x+=sx)result.push([x,y,a[2]]);return result;
}
export function nativeQuaternion(yaw:number,rotation:readonly number[]=[0,0,0,1]):[number,number,number,number]{const a=yaw*Math.PI/360,s=Math.sin(a),c=Math.cos(a),[x,y,z,w]=rotation;return[c*x-s*y,s*x+c*y,c*z+s*w,c*w-s*z];}

type RotationObject=Pick<EntityView,'id'|'type'|'position'|'rotation'>;
export function rotationCenter(entities:RotationObject[],snap=true):Vec3{
  const positions=entities.map(e=>e.position!),center=([0,1,2]as const).map(a=>(Math.min(...positions.map(p=>p[a]))+Math.max(...positions.map(p=>p[a])))/2)as Vec3;
  return snap&&entities.length>1?center.map(v=>Math.round(v))as Vec3:center;
}
export function quarterTurn(entities:RotationObject[],direction:1|-1=1,snap=true,pivot?:Vec3):EditOp[]{
  if(!entities.length)return[];
  if(entities.some(e=>['Wall_Set','Ocean_Map'].includes(e.type)))throw Error('原生地形和水格保持轴对齐，不能直接旋转');
  if(entities.some(e=>!e.position||!e.position.every(Number.isFinite)))throw Error('选中物件缺少有效位置');
  const center=pivot??rotationCenter(entities,snap);
  return entities.map(e=>{const p=e.position!,dx=p[0]-center[0],dy=p[1]-center[1];return{kind:'transform',id:e.id,position:entities.length===1?[...p]:[center[0]-direction*dy,center[1]+direction*dx,p[2]].map(v=>v===0?0:v)as Vec3,rotation:nativeQuaternion(direction*90,e.rotation)};});
}

// Native overview controls are region anchors, not ordinary oriented cameras.
export function overviewRegion(level:LevelView,camera:NativeCameraView){
 const regions=level.camera?.regions??[],region=regions.filter(r=>([2,4].includes(r.kind)||r.kind===1&&r.cameraId===camera.id)&&(!r.cameraId||r.cameraId===camera.id)).sort((a,b)=>Number(b.cameraId===camera.id)-Number(a.cameraId===camera.id)||Math.abs(a.position[2]-camera.position[2])-Math.abs(b.position[2]-camera.position[2]))[0];
 if(region)return{center:[...region.position]as Vec3,extents:region.extents.map(n=>Math.max(.5,Math.abs(n)))as Vec3};
 const heights=[...new Set((level.terrain??[]).map(p=>p.z))].sort((a,b)=>Math.abs(a-camera.position[2])-Math.abs(b-camera.position[2])),z=heights[0]??camera.position[2],cells=(level.terrain??[]).filter(p=>Math.abs(p.z-z)<.51);
 if(!cells.length)return{center:[camera.position[0],camera.position[1],z]as Vec3,extents:[8,8,2]as Vec3};
 const minX=Math.min(...cells.map(p=>p.x))-.5,maxX=Math.max(...cells.map(p=>p.x))+.5,minY=Math.min(...cells.map(p=>p.y))-.5,maxY=Math.max(...cells.map(p=>p.y))+.5;
 return{center:[(minX+maxX)/2,(minY+maxY)/2,z]as Vec3,extents:[(maxX-minX)/2,(maxY-minY)/2,2]as Vec3};
}
