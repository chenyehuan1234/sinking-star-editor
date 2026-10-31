import{applyCameraEdits,validateCameraEdits,cameraCategory,cameraManaged,cameraObjectLabel}from'./camera-objects';import type{GamePackage}from'./package';
import type {CameraConfig,CameraView,Vec3} from '../shared';
import type {EntityFile} from './entities';
import type {PropertyCodec} from './properties';
import {Matrix4,Quaternion,Vector3}from'three';import type{EntityRecord}from'./entities';

export function aimCamera(c:PropertyCodec,r:EntityRecord,target:Vec3,up:number,south:number,yaw=0){const a=yaw*Math.PI/180,x=new Vector3(-Math.sin(a)*south,Math.cos(a)*south,-up).normalize(),y=(south<.000001?new Vector3(-Math.cos(a),-Math.sin(a),0):new Vector3(0,0,1).cross(x)).normalize(),z=x.clone().cross(y),rotation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z)),values:Record<string,number>={up_distance:up,south_distance:south};['x','y','z'].forEach((axis,i)=>{values['position.'+axis]=target[i]+[Math.sin(a)*south,-Math.cos(a)*south,up][i];values['visual_position.'+axis]=values['position.'+axis];});rotation.toArray().forEach((n,i)=>values['orientation.'+'xyzw'[i]]=n);return c.patch(r,values);}

export function validateCamera(config:CameraConfig|undefined){
  if(!config)return;validateCameraEdits(config.edits);
  if(!['template','single','screens'].includes(config.mode))throw new Error('相机模式无效');
  for(const [key,min,max,integer]of [['screenSize',1,512,true],['origin',-10000,10000,true],['margins',0,100,true]]as const){const pair=config[key];if(pair&&(!Array.isArray(pair)||pair.length!==2||!pair.every(n=>Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isInteger(n)))))throw new Error('相机分区参数无效：'+key);}
  if(config.controls&&(!Array.isArray(config.controls)||config.controls.length>100))throw new Error('相机数量无效');
  const seen=new Set<number>();
  for(const control of config.controls??[]){if(!Number.isInteger(control.id)||control.id<1||seen.has(control.id))throw new Error('相机标识无效或重复');seen.add(control.id);if(control.yaw!==undefined&&(!Number.isFinite(control.yaw)||Math.abs(control.yaw)>360||!control.target||config.mode==='screens'&&control.yaw!==0))throw Error('镜头水平旋转需要单场景模式和构图目标');if(control.target&&(!Array.isArray(control.target)||control.target.length!==3||!control.target.every(n=>Number.isFinite(n)&&Math.abs(n)<100000)))throw new Error('相机构图目标无效');if(control.position&&control.target)throw new Error('相机不能同时指定原始位置和构图目标');if(control.position&&(!Array.isArray(control.position)||control.position.length!==3||!control.position.every(n=>Number.isFinite(n)&&Math.abs(n)<100000)))throw new Error('相机位置无效');for(const [key,min,max]of [['upDistance',.1,2000],['southDistance',0,2000],['fov',5,120],['panRate',.01,100]]as const){const n=control[key];if(n!==undefined&&(!Number.isFinite(n)||n<min||n>max))throw new Error('镜头参数无效：'+key);}}
}

export function applyCamera(c:PropertyCodec,file:EntityFile,config:CameraConfig|undefined,pkg?:GamePackage){
  validateCamera(config);applyCameraEdits(c,file,config?.edits,pkg);if(!config||config.mode==='template')return;
  const available=new Set(file.records.filter(r=>r.type==='Camera_Control').map(r=>r.id));
  for(const control of config.controls??[])if(!available.has(control.id))throw new Error(`相机 ${control.id} 不存在`);
  const anchors=new Map<number,Vec3>();
  file.records=file.records.map(r=>{
    if(r.type==='Settings')return c.patch(r,{per_screen_camera:config.mode==='screens',...(config.screenSize?{squares_per_screen_x:config.screenSize[0],squares_per_screen_y:config.screenSize[1]}:{}),...(config.origin?{'per_screen_camera_corner.x':config.origin[0],'per_screen_camera_corner.y':config.origin[1]}:{}),...(config.margins?{room_margin_x:config.margins[0],room_margin_y:config.margins[1]}:{})});
    const control=config.controls?.find(v=>v.id===r.id);if(r.type!=='Camera_Control'||!control)return r;
    const values:Record<string,number>={};for(const [key,field]of [['upDistance','up_distance'],['southDistance','south_distance'],['fov','fov_vertical'],['panRate','room_pan_rate']]as const)if(control[key]!==undefined)values[field]=control[key]!;
    control.position?.forEach((n,i)=>{values['position.'+'xyz'[i]]=n;values['visual_position.'+'xyz'[i]]=n;});
    if(control.target){const positionId=Number(c.get(r,'position_id')),lookAtId=Number(c.get(r,'look_at_id'));for(const id of[positionId,lookAtId])if(id&&id!==r.id){const target=file.records.find(e=>e.id===id);if(!target||!cameraManaged(c,target))throw Error('此镜头跟随玩法对象，请先在相机引用中解除关联再调整构图');}r=aimCamera(c,r,control.target,control.upDistance??Number(c.get(r,'up_distance',14.5)),control.southDistance??Number(c.get(r,'south_distance',4)),control.yaw??0);if(positionId)anchors.set(positionId,['x','y','z'].map(a=>Number(c.get(r,'position.'+a)))as Vec3);if(lookAtId)anchors.set(lookAtId,control.target);}
    if(!control.target&&config.mode==='single'&&!control.position&&(control.upDistance!==undefined||control.southDistance!==undefined)){
      const q=new Quaternion(...['x','y','z','w'].map(a=>Number(c.get(r,'orientation.'+a,a==='w'?1:0)))as[number,number,number,number]),forward=new Vector3(1,0,0).applyQuaternion(q),position=new Vector3(...['x','y','z'].map(a=>Number(c.get(r,'position.'+a)))as Vec3),hero=file.records.find(r=>r.type==='Guy'),floor=hero?Number(c.get(hero,'position.z')):0,target=forward.z<-.001?position.clone().addScaledVector(forward,(floor-position.z)/forward.z):position.clone().setZ(floor);r=aimCamera(c,r,target.toArray()as Vec3,control.upDistance??Number(c.get(r,'up_distance',14.5)),control.southDistance??Number(c.get(r,'south_distance',4)));
    }
    return c.patch(r,values);
  });
  file.records=file.records.map(r=>{const p=anchors.get(r.id);if(!p)return r;const values:Record<string,number>={};['x','y','z'].forEach((a,i)=>{values['position.'+a]=p[i];values['visual_position.'+a]=p[i];});return c.patch(r,values);});
}

export function cameraView(c:PropertyCodec,file:EntityFile):CameraView{
 const byId=new Map(file.records.map(r=>[r.id,r])),settings=file.records.find(r=>r.type==='Settings'),get=(name:string,fallback:number|boolean)=>settings?c.get(settings,name,fallback):fallback;
 const point=(r:EntityRecord)=>['x','y','z'].map(a=>Number(c.get(r,'position.'+a)))as Vec3;
 const controls=file.records.filter(r=>r.type==='Camera_Control'&&c.parse(r).complete).map(r=>{const raw=new Map(c.parse(r).fields.map(f=>[f.schema.name,f.value])),n=(key:string,fallback=0)=>Number(raw.get(key)??fallback),positionId=n('position_id'),lookAtId=n('look_at_id');return{id:r.id,name:String(raw.get('entity_name')??'')||'镜头 '+r.id,position:point(r),rotation:[n('orientation.x'),n('orientation.y'),n('orientation.z'),n('orientation.w',1)]as[number,number,number,number],overview:Boolean(raw.get('is_for_map_overview')??false),primary:n('minus_one_if_not_primary')!==-1,upDistance:n('up_distance',14.5),southDistance:n('south_distance',4),fov:n('fov_vertical',45),panRate:n('room_pan_rate',1),positionId,lookAtId,resolvedPosition:positionId&&byId.has(positionId)?point(byId.get(positionId)!):undefined,resolvedTarget:lookAtId&&byId.has(lookAtId)?point(byId.get(lookAtId)!):undefined};});
 const regions=file.records.filter(r=>(r.type==='Camera_Marker'||r.type==='Marker'&&c.get(r,'script_name','')==='camera_z_lock')&&c.parse(r).complete).map(r=>({id:r.id,name:String(c.get(r,'entity_name',''))||cameraObjectLabel(c,r)+' #'+r.id,position:point(r),extents:['x','y','z'].map(a=>Number(c.get(r,'props.box_extents.'+a,1)))as Vec3,kind:r.type==='Marker'?-1:Number(c.get(r,'overhead_map_type')),cameraId:Number(c.get(r,'overhead_map_id')),category:cameraCategory(c,r)??undefined,sourceType:r.type as 'Camera_Marker'|'Marker',priority:r.type==='Camera_Marker'?Number(c.get(r,'priority')):undefined,targetId:r.type==='Marker'?Number(c.get(r,'script_target_entity_id')):undefined,nativeParameter:r.type==='Marker'?Number(c.get(r,'float_parameter')):undefined}));
 const ids=new Set([...controls,...regions].map(r=>r.id)),references=file.records.flatMap(r=>c.parse(r).fields.filter(f=>f.schema.pid&&Number(f.value)&&(cameraManaged(c,r)||ids.has(Number(f.value)))).map(f=>({sourceId:r.id,field:f.schema.name,targetId:Number(f.value)})));
 return{perScreen:Boolean(get('per_screen_camera',false)),screenSize:[Number(get('squares_per_screen_x',16)),Number(get('squares_per_screen_y',16))],origin:[Number(get('per_screen_camera_corner.x',0)),Number(get('per_screen_camera_corner.y',0))],margins:[Number(get('room_margin_x',0)),Number(get('room_margin_y',0))],controls,regions,references};
}
