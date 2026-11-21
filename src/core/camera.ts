import {nativeScreenSize,newScreenSize} from '../level-settings';
import {wrappedScreenOrigin} from '../screen-wrapping';
import {topologyView} from './topology';
import{nativeCameraDefaults}from'../native-camera-rules';
import{validatePose,nativePoseRotation,nativeScreenPose,nativeScreenParameters,offsetPose}from'../camera-pose';
import{selectedScreenCamera}from'../screen-camera';
import{cameraTarget}from'../camera-math';
import{cameraLayer}from'../camera-layout';
import{applyCameraEdits,validateCameraEdits,cameraCategory,cameraManaged,cameraObjectLabel}from'./camera-objects';import type{GamePackage}from'./package';
import type {CameraConfig,CameraView,Vec3} from '../shared';
import type {EntityFile} from './entities';
import type {PropertyCodec} from './properties';
import {Matrix4,Quaternion,Vector3}from'three';import type{EntityRecord}from'./entities';

export function aimCamera(c:PropertyCodec,r:EntityRecord,target:Vec3,up:number,south:number,yaw=0){const a=yaw*Math.PI/180,x=new Vector3(-Math.sin(a)*south,Math.cos(a)*south,-up).normalize(),y=(south<.000001?new Vector3(-Math.cos(a),-Math.sin(a),0):new Vector3(0,0,1).cross(x)).normalize(),z=x.clone().cross(y),rotation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z)),values:Record<string,number>={up_distance:up,south_distance:south};['x','y','z'].forEach((axis,i)=>{values['position.'+axis]=target[i]+[Math.sin(a)*south,-Math.cos(a)*south,up][i];values['visual_position.'+axis]=values['position.'+axis];});rotation.toArray().forEach((n,i)=>values['orientation.'+'xyzw'[i]]=n);return c.patch(r,values);}

export function validateCamera(config:CameraConfig|undefined){
  if(!config)return;validateCameraEdits(config.edits);
  if(!['template','single','screens'].includes(config.mode))throw new Error('相机模式无效');
  if(config.screenCameraId!==undefined&&(!Number.isInteger(config.screenCameraId)||config.screenCameraId<1||config.screenCameraId>0xffffffff))throw Error('分屏取景镜头标识无效');
  for(const [key,min,max,integer]of [['screenSize',1,512,true],['origin',-10000,10000,true],['margins',0,100,true]]as const){const pair=config[key];if(pair&&(!Array.isArray(pair)||pair.length!==2||!pair.every(n=>Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isInteger(n)))))throw new Error('相机分区参数无效：'+key);}
  if(config.controls&&(!Array.isArray(config.controls)||config.controls.length>100))throw new Error('相机数量无效');
  const seen=new Set<number>();
  for(const control of config.controls??[]){if(!Number.isInteger(control.id)||control.id<1||seen.has(control.id))throw new Error('相机标识无效或重复');seen.add(control.id);if(control.nativePose)validatePose(control.nativePose);if(control.pose){validatePose(control.pose);if(control.position||control.target||control.yaw!==undefined)throw Error('完整镜头姿态不能同时包含旧位置或朝向覆盖');}if(control.yaw!==undefined&&(!Number.isFinite(control.yaw)||Math.abs(control.yaw)>360||!control.target||config.mode==='screens'&&control.yaw!==0))throw Error('镜头水平旋转需要单场景模式和构图目标');if(control.target&&(!Array.isArray(control.target)||control.target.length!==3||!control.target.every(n=>Number.isFinite(n)&&Math.abs(n)<100000)))throw new Error('相机构图目标无效');if(control.position&&control.target)throw new Error('相机不能同时指定原始位置和构图目标');if(control.position&&(!Array.isArray(control.position)||control.position.length!==3||!control.position.every(n=>Number.isFinite(n)&&Math.abs(n)<100000)))throw new Error('相机位置无效');for(const [key,min,max]of [['upDistance',.1,2000],['southDistance',0,2000],['lookAtSouthDistance',-2000,2000],['fov',5,120],['panRate',.01,100],['screenFov',5,120],['screenPanRate',.01,100]]as const){const n=control[key];if(n!==undefined&&(!Number.isFinite(n)||n<min||n>max))throw new Error('镜头参数无效：'+key);}}
}

export function applyCamera(c:PropertyCodec,file:EntityFile,config:CameraConfig|undefined,pkg?:GamePackage){
  validateCamera(config);applyCameraEdits(c,file,config?.edits,pkg);if(!config||config.mode==='template'&&!config.controls?.some(c=>c.nativePose))return;
  const available=new Set(file.records.filter(r=>r.type==='Camera_Control').map(r=>r.id));
  const settings=file.records.find(r=>r.type==='Settings');
  const screensEnabled=config.mode==='screens'||config.mode==='template'&&Boolean(settings&&c.get(settings,'per_screen_camera',false));
  const screenSize=config.screenSize??(config.mode==='screens'&&settings&&!c.get(settings,'per_screen_camera',false)?[newScreenSize,newScreenSize] as [number,number]:undefined)??(['x','y'].map(a=>settings?Number(c.get(settings,'squares_per_screen_'+a,nativeScreenSize)):nativeScreenSize) as [number,number]);
  const screenOrigin=wrappedScreenOrigin(config.origin??(['x','y'].map(a=>settings?Number(c.get(settings,'per_screen_camera_corner.'+a)):0) as [number,number]),screenSize,screensEnabled?topologyView(c,file):undefined);
  for(const control of config.controls??[])if(!available.has(control.id))throw new Error(`相机 ${control.id} 不存在`);
  const layered=hasCameraLayers(c,settings);
  const nativeRecords=new Map(file.records.filter(r=>r.type==='Camera_Control'&&c.parse(r).complete).map(r=>[r.id,r]));
  const nativeControls=[...nativeRecords.values()].map(r=>readCamera(c,r));
  const driver=selectedScreenCamera({controls:nativeControls,layered},config);
  const driverOverride=config.controls?.find(v=>v.id===driver?.id);
  // In a single native layer every primary camera is a candidate. Give those
  // carriers the bound screen framing, independently of ordinary world poses.
  // Imported multilayer rigs keep each layer's own screen parameters.
  const sharedScreen=config.mode==='screens'&&!layered&&driver&&(driverOverride?.pose||config.screenCameraId===driver.id)?driver:undefined;
  const anchors=new Map<number,Vec3>();let targetView:import('../shared').LevelView|undefined;
 const inferTarget=(id:number)=>{targetView??={name:'camera',typeCount:0,manifest:'',camera:cameraView(c,file),entities:file.records.filter(r=>r.type==='Guy').map(r=>({id:r.id,type:r.type,position:['x','y','z'].map(a=>Number(c.get(r,'position.'+a)))as Vec3,yaw:0,editable:false,bytes:0,mesh:'',cloneable:false}))};const camera=targetView.camera!.controls.find(v=>v.id===id)!;if(!cameraLayer(targetView,id).known)throw Error('观察高度未确认，请先对镜头观察中心取点');return cameraTarget(targetView,camera);};
  file.records=file.records.map(r=>{
    if(r.type==='Settings'&&config.mode!=='template'){
      const size=config.screenSize??(config.mode==='screens'&&!c.get(r,'per_screen_camera',false)?[newScreenSize,newScreenSize]:undefined);
      return c.patch(r,{per_screen_camera:config.mode==='screens',...(size?{squares_per_screen_x:size[0],squares_per_screen_y:size[1]}:{}),...(config.origin||screensEnabled?{'per_screen_camera_corner.x':screenOrigin[0],'per_screen_camera_corner.y':screenOrigin[1]}:{}),...(config.margins?{room_margin_x:config.margins[0],room_margin_y:config.margins[1]}:{})});
    }
    if(r.type!=='Camera_Control')return r;
    const primary=!c.get(r,'is_for_map_overview',false)&&Number(c.get(r,'minus_one_if_not_primary',0))===0;
    const own=config.controls?.find(v=>v.id===r.id);
    const control=primary&&sharedScreen?driverOverride??{id:sharedScreen.id}:own;
    if(!control||config.mode==='template'&&!control.nativePose)return r;
    if(screensEnabled&&primary){
      // Camera_Control.position selects the native world layer. It is not the
      // screen camera position; runtime adds up/south distances at each room.
      // Never write nativePose, its anchors, or its FOV into this path.
      if(!control.pose&&!sharedScreen){
       if(control.nativePose)return r;
       const legacy:Record<string,number>={};for(const[key,field]of [['upDistance','up_distance'],['southDistance','south_distance'],['lookAtSouthDistance','look_at_south_distance'],['fov','fov_vertical'],['panRate','room_pan_rate']]as const)if(control[key]!==undefined)legacy[field]=control[key]!;
       return Object.keys(legacy).length?c.patch(r,legacy):r;
      }
      const base=sharedScreen??nativeControls.find(camera=>camera.id===r.id);
      if(!base)return r;
      const parameters=control.pose?nativeScreenParameters(control.pose):control.nativePose?{}:control;
      const legacyLens=control.pose||!control.nativePose?control:undefined;
      if(r.id===control.id&&control.pose&&!nativeScreenPose(control.pose))(file.analysisWarnings??=[]).push({entityId:r.id,field:'orientation',message:'原游戏按每屏中心重算取景，当前的横向偏移或旋转可能与游戏画面不同。'});
      const lens=sharedScreen?nativeRecords.get(sharedScreen.id):undefined;
      return c.patch(r,{
       up_distance:parameters.upDistance??base.upDistance,
       south_distance:parameters.southDistance??base.southDistance,
       look_at_south_distance:parameters.lookAtSouthDistance??base.lookAtSouthDistance??0,
       fov_vertical:control.screenFov??legacyLens?.fov??base.fov,
       room_pan_rate:control.screenPanRate??legacyLens?.panRate??base.panRate,
       ...(lens&&lens.id!==r.id?{
        orthoness:c.get(lens,'orthoness',0),
        fov_expansion:c.get(lens,'fov_expansion',0),
        adjust_to_explored_fog:c.get(lens,'adjust_to_explored_fog',false)
       }:{})
      });
    }
    const values:Record<string,number>={};for(const [key,field]of [['upDistance','up_distance'],['southDistance','south_distance'],['lookAtSouthDistance','look_at_south_distance'],['fov','fov_vertical'],['panRate','room_pan_rate']]as const)if(control[key]!==undefined)values[field]=control[key]!;
    if(control.nativePose||control.pose&&!screensEnabled&&control.screenFov===undefined&&config.screenCameraId!==r.id){const selectedPose=control.nativePose??control.pose!,pose=offsetPose(selectedPose,[0,0,0]);
      for(const[field,point]of[['position_id',pose.position],['look_at_id',pose.target]]as const){const id=Number(c.get(r,field));if(id&&id!==r.id){const anchor=file.records.find(e=>e.id===id);if(!anchor||!cameraManaged(c,anchor))throw Error('此镜头跟随玩法对象，请先处理原生引用');anchors.set(id,point);}}
      pose.position.forEach((n,i)=>{values['position.'+'xyz'[i]]=n;values['visual_position.'+'xyz'[i]]=n;});nativePoseRotation(pose).forEach((n,i)=>values['orientation.'+'xyzw'[i]]=n);
      if(config.mode==='single'){const up=pose.position[2]-pose.target[2],south=Math.hypot(pose.position[0]-pose.target[0],pose.position[1]-pose.target[1]);if(up>=.1&&up<=2000)values.up_distance=up;if(south<=2000)values.south_distance=south;}
      return c.patch(r,values);
    }
    control.position?.forEach((n,i)=>{values['position.'+'xyz'[i]]=n;values['visual_position.'+'xyz'[i]]=n;});
    if(control.target){const positionId=Number(c.get(r,'position_id')),lookAtId=Number(c.get(r,'look_at_id'));for(const id of[positionId,lookAtId])if(id&&id!==r.id){const target=file.records.find(e=>e.id===id);if(!target||!cameraManaged(c,target))throw Error('此镜头跟随玩法对象，请先在相机引用中解除关联再调整构图');}r=aimCamera(c,r,control.target,control.upDistance??Number(c.get(r,'up_distance',nativeCameraDefaults.upDistance)),control.southDistance??Number(c.get(r,'south_distance',nativeCameraDefaults.southDistance)),control.yaw??0);if(positionId&&positionId!==r.id)anchors.set(positionId,['x','y','z'].map(a=>Number(c.get(r,'position.'+a)))as Vec3);if(lookAtId&&lookAtId!==r.id)anchors.set(lookAtId,control.target);}
    if(!control.target&&config.mode==='single'&&!control.position&&(control.upDistance!==undefined||control.southDistance!==undefined)){
      const target=inferTarget(r.id);r=aimCamera(c,r,target,control.upDistance??Number(c.get(r,'up_distance',nativeCameraDefaults.upDistance)),control.southDistance??Number(c.get(r,'south_distance',nativeCameraDefaults.southDistance)));
    }
    return c.patch(r,values);
  });
  file.records=file.records.map(r=>{const p=anchors.get(r.id);if(!p)return r;const values:Record<string,number>={};['x','y','z'].forEach((a,i)=>{values['position.'+a]=p[i];values['visual_position.'+a]=p[i];});return c.patch(r,values);});
}

function hasCameraLayers(c:PropertyCodec,settings:EntityRecord|undefined){
 return Boolean(settings&&(c.get(settings,'has_lower_layer',false)||c.get(settings,'has_upper_layer',false)));
}
const cameraPoint=(c:PropertyCodec,r:EntityRecord)=>['x','y','z'].map(axis=>Number(c.get(r,'position.'+axis))) as Vec3;
function readCamera(c:PropertyCodec,r:EntityRecord,byId?:Map<number,EntityRecord>){
 const raw=new Map(c.parse(r).fields.map(f=>[f.schema.name,f.value]));
 const n=(key:string,fallback=0)=>Number(raw.get(key)??fallback),positionId=n('position_id'),lookAtId=n('look_at_id');
 const positionAnchor=byId?.get(positionId),lookAnchor=byId?.get(lookAtId);
 return{
  id:r.id,name:String(raw.get('entity_name')??'')||'镜头 '+r.id,
  position:cameraPoint(c,r),rotation:[n('orientation.x'),n('orientation.y'),n('orientation.z'),n('orientation.w',1)] as [number,number,number,number],
  overview:Boolean(raw.get('is_for_map_overview')??false),primary:n('minus_one_if_not_primary')===0,
  upDistance:n('up_distance',nativeCameraDefaults.upDistance),southDistance:n('south_distance',nativeCameraDefaults.southDistance),
  lookAtSouthDistance:n('look_at_south_distance',nativeCameraDefaults.lookAtSouthDistance),
  fov:n('fov_vertical',nativeCameraDefaults.fov),panRate:n('room_pan_rate',nativeCameraDefaults.panRate),
  positionId,lookAtId,resolvedPosition:positionAnchor?cameraPoint(c,positionAnchor):undefined,resolvedTarget:lookAnchor?cameraPoint(c,lookAnchor):undefined
 };
}

export function cameraView(c:PropertyCodec,file:EntityFile):CameraView{
 const byId=new Map(file.records.map(r=>[r.id,r])),settings=file.records.find(r=>r.type==='Settings'),get=(name:string,fallback:number|boolean)=>settings?c.get(settings,name,fallback):fallback;
 const point=(r:EntityRecord)=>['x','y','z'].map(a=>Number(c.get(r,'position.'+a)))as Vec3;
 const controls=file.records.filter(r=>r.type==='Camera_Control'&&c.parse(r).complete).map(r=>readCamera(c,r,byId));
 const regions=file.records.filter(r=>(r.type==='Camera_Marker'||r.type==='Marker'&&c.get(r,'script_name','')==='camera_z_lock')&&c.parse(r).complete).map(r=>({id:r.id,name:String(c.get(r,'entity_name',''))||cameraObjectLabel(c,r)+' #'+r.id,position:point(r),extents:['x','y','z'].map(a=>Number(c.get(r,'props.box_extents.'+a,1)))as Vec3,kind:r.type==='Marker'?-1:Number(c.get(r,'overhead_map_type')),cameraId:Number(c.get(r,'overhead_map_id')),category:cameraCategory(c,r)??undefined,sourceType:r.type as 'Camera_Marker'|'Marker',priority:r.type==='Camera_Marker'?Number(c.get(r,'priority')):undefined,targetId:r.type==='Marker'?Number(c.get(r,'script_target_entity_id')):undefined,nativeParameter:r.type==='Marker'?Number(c.get(r,'float_parameter')):undefined}));
 const ids=new Set([...controls,...regions].map(r=>r.id)),references=file.records.flatMap(r=>c.parse(r).fields.filter(f=>f.schema.pid&&Number(f.value)&&(cameraManaged(c,r)||ids.has(Number(f.value)))).map(f=>({sourceId:r.id,field:f.schema.name,targetId:Number(f.value)})));
 const layered=hasCameraLayers(c,settings);
 const primary=controls.filter(camera=>camera.primary&&!camera.overview);
 const nativeZ=(field:string)=>{const value=settings&&c.get(settings,field,NaN);return typeof value==='number'&&Number.isFinite(value)?value:undefined;};
 const lower=settings&&c.get(settings,'has_lower_layer',false),upper=settings&&c.get(settings,'has_upper_layer',false);
 const below=nativeZ('underground_barrier'),above=nativeZ('skyground_barrier');
 const layers:NonNullable<CameraView['layers']>=[];
 function layer(kind:typeof layers[number]['kind'],baseZ?:number,boundaryZ?:number){
  const candidates=primary.filter(camera=>{
   if(!layered)return kind==='ground';
   const z=camera.position[2];
   if(kind==='underground')return below!==undefined&&z<below;
   if(kind==='sky')return above!==undefined&&z>above;
   return (!lower||below!==undefined&&z>below)&&(!upper||above!==undefined&&z<above);
  });
  layers.push({kind,baseZ,boundaryZ,cameraId:candidates.length===1?candidates[0].id:undefined});
 }
 if(lower)layer('underground',nativeZ('underground_z0'),below);
 layer('ground',nativeZ('ground_z0'));
 if(upper)layer('sky',nativeZ('skyground_z0'),above);
 return{layered,layers,perScreen:Boolean(get('per_screen_camera',false)),screenSize:[Number(get('squares_per_screen_x',nativeScreenSize)),Number(get('squares_per_screen_y',nativeScreenSize))],origin:[Number(get('per_screen_camera_corner.x',0)),Number(get('per_screen_camera_corner.y',0))],margins:[Number(get('room_margin_x',0)),Number(get('room_margin_y',0))],controls,regions,references};
}
