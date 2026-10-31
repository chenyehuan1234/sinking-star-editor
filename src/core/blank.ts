import {parseEntities,type EntityFile,type EntityRecord} from './entities';
import {GamePackage} from './package';
import {PropertyCodec} from './properties';
import type {EditorProject} from '../shared';
import {OBJECT_BY_TYPE} from './object-definitions';
import {aimCamera} from './camera';

export function createBlank(hash:string,build:string,width=16,height=16):EditorProject {
  if(![width,height].every(n=>Number.isInteger(n)&&n>=4&&n<=128))throw new Error('空白关卡尺寸为 4–128 格');
  return{format:'sinking-star-project',version:2,sourceHash:hash,sourceBuild:build,template:'mirror_1',base:{kind:'blank',width,height},name:'blank_level',operations:[],camera:{mode:'single'}};
}
export function blankFile(pkg:GamePackage,c:PropertyCodec,width:number,height:number):EntityFile {
  const source=parseEntities(pkg.get('data-common/mirror_1.entities')),records:EntityRecord[]=[];
  let serial=898*0x100000+1;const next=()=>serial++;
  const add=(r:EntityRecord)=>records.push({...r,id:next(),typeIndex:source.types.indexOf(r.type)});
  // Copy only the native environment and camera rig. No islands, narrative NPCs,
  // existence groups, level scripts or old puzzle objects enter a blank scene.
  for(const r of source.records)if(['Camera_Control','Sun','Sky','Wind','Fog'].includes(r.type))records.push(r.type==='Camera_Control'?c.patch(aimCamera(c,r,[(width-1)/2,(height-1)/2,0],Math.max(8,height*1.35,width*.95),Math.max(4,height*.6)),{fov_vertical:45}):{...r,diff:Buffer.from(r.diff)});
  const settings=source.records.find(r=>r.type==='Settings')!;
  records.push(c.patch(settings,{'grid.squares_x':width+4,'grid.squares_y':height+4,'grid.num_squares':(width+4)*(height+4),'grid.corner.x':-2,'grid.corner.y':-2,'grid.corner.z':-2,squares_z:8,'grid.wrapping':false,special_level:0,story_tag:'',intro_cutscene:'',outro_cutscene:'',story_proc:'',has_prelude:false,per_screen_camera:false,can_walk_into_water:false,fog_present:false,lock_grid:true}));
  const hero=parseEntities(pkg.get('data-common/heroes1_1.entities')).records.find(r=>r.type==='Guy')!;
  const x=Math.floor(width/2),y=Math.floor(height/2);
  add(c.patch(hero,{group_id:0,entity_name:'','position.x':x,'position.y':y,'position.z':0,'visual_position.x':x,'visual_position.y':y,'visual_position.z':0,'pre_move_position.x':x,'pre_move_position.y':y,'pre_move_position.z':0,initial_bark:'',win_bark:''}));
  const proto=parseEntities(pkg.get('data-common/3d_intro_heroes.entities')).records.find(r=>r.type==='Wall_Set'&&Number(c.get(r,'wall_data.bits.count'))===1)!;
  const count=width*height,slots=Array.from({length:Math.ceil(count/64)},(_,i)=>((1n<<BigInt(Math.min(64,count-i*64)))-1n).toString());
  add(c.patch(proto,{group_id:0,entity_name:'editor_blank_ground','position.x':0,'position.y':0,'position.z':-1,'visual_position.x':0,'visual_position.y':0,'visual_position.z':-1,'wall_data.corner.x':0,'wall_data.corner.y':0,'wall_data.corner.z':0,'wall_data.dimensions.x':width,'wall_data.dimensions.y':height,'wall_data.dimensions.z':1,'wall_data.bits.slots':slots,'wall_data.bits.count':count}));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)add(c.patch({id:0,type:'Inanimate',typeIndex:source.types.indexOf('Inanimate'),diff:Buffer.from([0xfd])},{entity_name:`editor_voxel_${x},${y},-1`,mesh:'Shape_Plane_Square_1',materials:['GameFloor_Cobblestone_B_Blend_A-child~3d_intro_heroes'],'position.x':x,'position.y':y,'position.z':0}));
  return{prefix:Buffer.from(source.prefix),types:[...source.types],records};
}
export function updateBlankBounds(c:PropertyCodec,file:EntityFile){
  const categories=new Set(['character','monster','block','mechanism','terrain','world']);
  const points=file.records.filter(r=>categories.has(OBJECT_BY_TYPE.get(r.type)?.category??'')).map(r=>{const p=['x','y','z'].map(a=>Number(c.get(r,'position.'+a)));if(r.type==='Wall_Set')return[p[0]+Number(c.get(r,'wall_data.corner.x')),p[1]+Number(c.get(r,'wall_data.corner.y')),p[2]+Number(c.get(r,'wall_data.corner.z')),Number(c.get(r,'wall_data.dimensions.x',1)),Number(c.get(r,'wall_data.dimensions.y',1)),Number(c.get(r,'wall_data.dimensions.z',1))];if(r.type==='Ocean_Map')return[...['x','y','z'].map(a=>Number(c.get(r,'grid.corner.'+a))),Number(c.get(r,'grid.squares_x',1)),Number(c.get(r,'grid.squares_y',1)),1];return[...p,1,1,1];});
  if(!points.length)return;
  const min=[0,1,2].map(a=>Math.floor(Math.min(...points.map(p=>p[a])))-2),max=[0,1,2].map(a=>Math.ceil(Math.max(...points.map(p=>p[a]+p[a+3])))+2),size=max.map((n,i)=>n-min[i]);
  if(size[0]*size[1]*size[2]>1_000_000)throw new Error('关卡逻辑范围过大，请收拢物件或缩小地形');
  file.records=file.records.map(r=>r.type==='Settings'?c.patch(r,{'grid.corner.x':min[0],'grid.corner.y':min[1],'grid.corner.z':min[2],'grid.squares_x':size[0],'grid.squares_y':size[1],'grid.num_squares':size[0]*size[1],squares_z:size[2]}):r);
}
