import {validateEditor,gameplayWorld,gameplayProject} from '../editor-organization';
import { GamePackage,sha256 } from './package';
import {parseEntities,writeEntities,type EntityFile,type EntityRecord}from './entities';
import{PropertyCodec}from './properties';
import{applyProject,validateProject,validName,projectSources}from './project';
import type{EditorProject,Vec3,WorldProject,WorldIssue}from '../shared';
import{validateReferences}from'./mechanisms';
export type{WorldProject,WorldIssue}from'../shared';
export interface WorldBuild {changes:Map<string,Buffer>;resources:{source:string;target:string}[];issues:WorldIssue[];levelNames:Record<string,string>;revision:number}
import {mergeManifests} from './manifests';
export {mergeManifests} from './manifests';
const HUB_NAMESPACE=800;
export function newWorld(hash:string,build:string):WorldProject {
  const id=globalThis.crypto.randomUUID().replaceAll('-','').slice(0,12),width=32,height=32;
  return{format:'sinking-star-world',version:1,id,name:'我的大地图',sourceHash:hash,sourceBuild:build,map:{width,height,tiles:Array.from({length:width*height},(_,i)=>{const x=i%width,y=Math.floor(i/width);return x>=2&&x<=18&&y>=2&&y<=14?1:0;}),spawn:[6,5],entries:[]},levels:[]};
}
export function validateWorld(w:WorldProject){
  if(!w||w.format!=='sinking-star-world'||![1,2,3].includes(w.version)||!/^[a-f0-9]{12}$/.test(w.id)||typeof w.name!=='string'||w.name.length>100||!/^[a-f0-9]{64}$/.test(w.sourceHash)||typeof w.sourceBuild!=='string')throw new Error('大地图工程格式无效');
  validateEditor(w.map?.editor);const m=w.map;if(!m||!Number.isInteger(m.width)||!Number.isInteger(m.height)||m.width<4||m.width>128||m.height<4||m.height>128||!Array.isArray(m.tiles)||m.tiles.length!==m.width*m.height||!m.tiles.every(t=>[0,1,2].includes(t)))throw new Error('地图尺寸或地形无效（4–128 格）');
  if(m.objects)validateProject({format:'sinking-star-project',version:3,sourceHash:w.sourceHash,sourceBuild:w.sourceBuild,template:'mirror_1',name:'overworld',operations:m.objects});
  const point=(p:unknown)=>Array.isArray(p)&&p.length===2&&p.every(Number.isInteger)&&p[0]>=0&&p[1]>=0&&p[0]<m.width&&p[1]<m.height;
  if(!point(m.spawn)||!Array.isArray(m.entries)||m.entries.length>200||!Array.isArray(w.levels)||w.levels.length>200)throw new Error('地图出生点或关卡数量无效');
  const ids=new Set<string>(),names=new Set<string>();for(const l of w.levels){if(!validName(l.id)||ids.has(l.id)||typeof l.title!=='string')throw new Error('小关卡标识无效或重复');ids.add(l.id);validateProject(l.project);if(l.project.sourceHash!==w.sourceHash||l.project.sourceBuild!==w.sourceBuild)throw new Error('合集内关卡的源版本不一致');}
  for(const e of m.entries){if(!validName(e.id)||names.has(e.id)||typeof e.title!=='string'||typeof e.levelId!=='string'||!point([e.x,e.y]))throw new Error('入口标识或位置无效');if(e.prototype&&(!validName(e.prototype.template)||!Number.isInteger(e.prototype.sourceId)||e.prototype.sourceId<1||e.prototype.sourceId>0xffffffff))throw new Error('入口样式无效');names.add(e.id);}
}
export function worldIssues(w:WorldProject):WorldIssue[]{
  validateWorld(w);const m=w.map,issues:WorldIssue[]=[],floor=(x:number,y:number)=>x>=0&&y>=0&&x<m.width&&y<m.height&&m.tiles[y*m.width+x]===1;
  if(!floor(...m.spawn))issues.push({severity:'error',message:'出生点必须位于地面上'});
  if(!m.entries.length)issues.push({severity:'error',message:'请至少放置一个关卡入口'});
  const reached=new Set<number>(),queue=floor(...m.spawn)?[m.spawn]:[];for(let i=0;i<queue.length;i++){const[x,y]=queue[i],key=y*m.width+x;if(reached.has(key))continue;reached.add(key);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(floor(x+dx,y+dy)&&!reached.has((y+dy)*m.width+x+dx))queue.push([x+dx,y+dy]);}
  const occupied=new Set<string>();for(const e of m.entries){const loc=`${e.x},${e.y}`;if(occupied.has(loc))issues.push({severity:'error',message:`入口「${e.title}」与其他入口重叠`,entryId:e.id});occupied.add(loc);
    if(!w.levels.some(l=>l.id===e.levelId))issues.push({severity:'error',message:`入口「${e.title}」尚未关联有效关卡`,entryId:e.id});
    if(!floor(e.x,e.y))issues.push({severity:'error',message:`入口「${e.title}」必须位于地面`,entryId:e.id});
    else if(!reached.has(e.y*m.width+e.x))issues.push({severity:'warning',message:`从出生点无法步行到达「${e.title}」`,entryId:e.id});
  }
  for(const l of w.levels)if(!m.entries.some(e=>e.levelId===l.id))issues.push({severity:'warning',message:`「${l.title}」没有地图入口`,levelId:l.id});
  return issues;
}
export class WorldCompiler {
  private files=new Map<string,EntityFile>();
  constructor(readonly pkg:GamePackage,readonly codec:PropertyCodec){}
  file(n:string){let f=this.files.get(n);if(!f){f=parseEntities(this.pkg.get(`data-common/${n}.entities`));this.files.set(n,f);}return f;}
  find(level:string,type:string,predicate?:(r:EntityRecord)=>boolean){const r=this.file(level).records.find(r=>r.type===type&&(!predicate||predicate(r)));if(!r)throw new Error(`模板 ${level} 中缺少 ${type}`);return r;}
  move(r:EntityRecord,p:Vec3){return this.codec.patch(r,{'position.x':p[0],'position.y':p[1],'position.z':p[2],'visual_position.x':p[0],'visual_position.y':p[1],'visual_position.z':p[2]});}
  bare(type:string,id:number):EntityRecord{const f=this.file('mirror_1');const typeIndex=f.types.indexOf(type);if(typeIndex<0)throw new Error(`未知类型 ${type}`);return{id,typeIndex,type,diff:Buffer.from([0xfd])};}
  private stripGroup(r:EntityRecord){return this.codec.patch(r,{group_id:0,entity_name:''});}
  previewMap(w:WorldProject){return this.mapFile(w,'overworld',1000,w.map.spawn);}
  private mapFile(w:WorldProject,name:string,revision:number,spawn:[number,number]):EntityFile{
    const c=this.codec,m=w.map,original=this.file('mirror_1');let serial=1;const id=()=>HUB_NAMESPACE*0x100000+serial++;
    const records:EntityRecord[]=[];
    const cells=m.tiles.flatMap((t,i)=>t?[[i%m.width,Math.floor(i/m.width)]]:[]);
    const xs=cells.map(p=>p[0]),ys=cells.map(p=>p[1]),minX=xs.length?Math.min(...xs):0,maxX=xs.length?Math.max(...xs):m.width-1,minY=ys.length?Math.min(...ys):0,maxY=ys.length?Math.max(...ys):m.height-1;
    const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2,cameraHeight=Math.max(18,(maxY-minY+7)*1.05,(maxX-minX+7)*.65);
    for(const type of ['Camera_Control','Sun','Sky','Wind','Fog','Marker']){const rs=original.records.filter(r=>r.type===type);for(let r of rs){
      if(type==='Camera_Control'){
        const x=Number(c.get(r,'orientation.x')),y=Number(c.get(r,'orientation.y')),z=Number(c.get(r,'orientation.z')),q=Number(c.get(r,'orientation.w',1));
        const fx=1-2*(y*y+z*z),fy=2*(x*y+q*z),fz=2*(x*z-q*y);
        if(fz<-.1)r=this.move(r,[centerX+fx*cameraHeight/fz,centerY+fy*cameraHeight/fz,cameraHeight]);
      }
      records.push({...r,diff:Buffer.from(r.diff)});
    }}
    for(const label of ['overhead_onground','minimap_onground']){const camera=this.find('overworld','Camera_Control',r=>c.get(r,'entity_name')===label);records.push({...c.patch(this.move(camera,[m.width/2,m.height/2,label.startsWith('mini')?89:1]),{position_id:0,look_at_id:0,adjust_to_explored_fog:false,up_distance:Math.max(14.5,m.width*.7,m.height*.7)}),id:id()});}
    let settings=this.find('overworld','Settings');
    settings=c.patch(settings,{'grid.squares_x':m.width+4,'grid.squares_y':m.height+4,'grid.num_squares':(m.width+4)*(m.height+4),'grid.wrapping':false,'grid.corner.x':-2,'grid.corner.y':-2,'grid.corner.z':-2,squares_z:8,can_walk_into_water:false,per_screen_camera:false,has_lower_layer:false,has_upper_layer:false,special_level:1,fog_present:false,disable_local_area_map:false,has_prelude:false,story_tag:'',intro_cutscene:'',outro_cutscene:'',story_proc:'',sound_level_name:'mirror_1',level_data_version:revision,lock_grid:true});
    records.push(settings);
    const queen=this.stripGroup(this.find('overworld','Guy'));
    records.push(c.patch(this.move(queen,[...spawn,0]),{initial_bark:'',win_bark:'','pre_move_position.x':spawn[0],'pre_move_position.y':spawn[1],'pre_move_position.z':0}));
    const fast=this.file('overworld').records.filter(r=>r.type==='Camera_Marker'&&c.get(r,'overhead_map_type')===1);
    for(const r of fast.slice(0,3))records.push({...c.patch(this.move(this.stripGroup(r),[m.width/2,m.height/2,1]),{overhead_map_id:0,'props.box_extents.x':m.width/2,'props.box_extents.y':m.height/2,'props.box_extents.z':2}),id:id()});
    const wallProto=this.find('3d_intro_heroes','Wall_Set',r=>Number(c.get(r,'wall_data.bits.count'))===1);
    for(const z of[-1,0]){
      const slots=Array.from({length:Math.ceil(m.width*m.height/64)},()=>0n);
      m.tiles.forEach((t,i)=>{if(z===-1?t!==0:t===2)slots[i>>6]|=1n<<BigInt(i%64);});
      const wall=c.patch(this.move(this.stripGroup(wallProto),[0,0,z]),{'wall_data.corner.x':0,'wall_data.corner.y':0,'wall_data.corner.z':0,'wall_data.dimensions.x':m.width,'wall_data.dimensions.y':m.height,'wall_data.dimensions.z':1,'wall_data.bits.slots':slots.map(String),'wall_data.bits.count':m.width*m.height});
      records.push({...wall,id:id()});
    }
    const mat='GameFloor_Cobblestone_B_Blend_A-child~3d_intro_heroes';
    for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)if(m.tiles[y*m.width+x]){
      const z=m.tiles[y*m.width+x]===2?1:0;
      const tile=c.patch(this.move(this.bare('Inanimate',id()),[x,y,z]),{mesh:'Shape_Plane_Square_1',materials:[mat],'tint_color_a.x':z?.28:.62,'tint_color_a.y':z?.35:.67,'tint_color_a.z':z?.39:.58,'orientation.x':0,'orientation.w':1});
      records.push(tile);
      if(z===1){
        for(const[dx,dy,qx,qy]of[[1,0,0,Math.SQRT1_2],[-1,0,0,-Math.SQRT1_2],[0,1,-Math.SQRT1_2,0],[0,-1,Math.SQRT1_2,0]]){
          if(x+dx>=0&&x+dx<m.width&&y+dy>=0&&y+dy<m.height&&m.tiles[(y+dy)*m.width+x+dx]===2)continue;
          records.push({...c.patch(this.move(tile,[x+dx/2,y+dy/2,.5]),{'orientation.x':qx,'orientation.y':qy,'orientation.w':Math.SQRT1_2}),id:id()});
        }
      }
    }
    const entryProto=this.find('overworld','Level_Entry',r=>c.parse(r).complete);
    for(const e of m.entries){const proto=e.prototype?this.file(e.prototype.template).records.find(r=>r.id===e.prototype!.sourceId&&r.type==='Level_Entry'):entryProto;if(!proto||!c.parse(proto).complete)throw new Error('入口样式不存在');let r=this.stripGroup(proto);r=this.move(r,[e.x,e.y,0]);r=c.patch(r,{level_name:e.levelId?`ed_${w.id}_${e.levelId}`:'',unlocked_by_id:0,unlocked_by_id2:0,unlocked_by_id3:0,unlock_is_or_gate:false,tower_flags:0,dropdown:false,currently_broken:false,currently_disfavored:false,can_move:false,riding_on_id:0,enabled_t_target:1,...(!e.prototype?{mesh:'GAME_OVER_Entry_Locked_A'}:{})});records.push({...r,id:id()});}
    const result={prefix:Buffer.from(original.prefix),types:[...original.types],records};
    // Source environment IDs remain stable, while fresh terrain and entrances use a disjoint namespace.
    if(new Set(records.map(r=>r.id)).size!==records.length)throw new Error('地图实体 ID 冲突');
    return applyProject(this.pkg,{format:'sinking-star-project',version:1,sourceHash:w.sourceHash,sourceBuild:w.sourceBuild,template:'mirror_1',name:'overworld',operations:m.objects??[]},c,result);
  }
  build(w:WorldProject,quickEntry?:string):WorldBuild{
    const issues=worldIssues(w);if(issues.some(i=>i.severity==='error'))throw new Error(issues.filter(i=>i.severity==='error').map(i=>i.message).join('\n'));
    const selected=quickEntry?w.map.entries.find(e=>e.id===quickEntry):undefined;if(quickEntry&&!selected)throw new Error('快速选关入口不存在');
    const spawn=selected?[selected.x,selected.y] as[number,number]:w.map.spawn;
    const revision=(Number.parseInt(sha256('world-compiler-5'+JSON.stringify(gameplayWorld(w))).slice(0,7),16)%0x3fffffff)+1000;
    const changes=new Map<string,Buffer>(),resources:WorldBuild['resources']=[],levelNames:Record<string,string>={};
    for(const l of w.levels){
      const name=`ed_${w.id}_${l.id}`;levelNames[l.id]=name;const f=applyProject(this.pkg,l.project,this.codec);
      const refs=validateReferences(this.codec,f);if(refs.length)throw new Error(`「${l.title}」：${refs.join('；')}`);
      if(!f.records.some(r=>r.type==='Guy'))throw new Error(`「${l.title}」缺少主角`);
      if(l.project.base?.kind==='blank'&&!f.records.some(r=>r.type==='Door'))throw new Error(`「${l.title}」缺少出口`);
      const localRevision=Number.parseInt(sha256('world-compiler-5'+JSON.stringify(gameplayProject(l.project))).slice(0,7),16)+1000;
      f.records=f.records.map(r=>r.type==='Settings'?this.codec.patch(r,{level_data_version:localRevision}):r);
      changes.set(`data-common/${name}.entities`,writeEntities(f));changes.set(`data-common/${name}.level_manifest`,mergeManifests(projectSources(l.project).map(t=>this.pkg.get(`data-common/${t}.level_manifest`).toString())));
      changes.set(`data/level_sets/${name}.level_set`,Buffer.from(`[1]\n${name}\n`));
      for(const ext of['all_paint_data','all_lightmap_data'])resources.push({source:`data-common/${l.project.template}.${ext}`,target:`data-common/${name}.${ext}`});
    }
    for(const name of['overworld','intro']){
      const hub=this.mapFile(w,name,revision,spawn),refs=validateReferences(this.codec,hub);if(refs.length)throw new Error('大地图：'+refs.join('；'));
      changes.set(`data-common/${name}.entities`,writeEntities(hub));
      changes.set(`data-common/${name}.level_manifest`,mergeManifests(['mirror_1','3d_intro_heroes',...w.map.entries.flatMap(e=>e.prototype?[e.prototype.template]:[]),...(w.map.objects??[]).flatMap(o=>o.kind==='stamp'?o.bundle.sources:o.kind==='prefab'||o.kind==='profile'?[o.template]:o.kind==='properties'&&o.sourceTemplate?[o.sourceTemplate]:[])].map(t=>this.pkg.get(`data-common/${t}.level_manifest`).toString()),['Shape_Plane_Square_1','GAME_OVER_Entry_Locked_A','queen']));
    }
    return{changes,resources,issues,levelNames,revision};
  }
}
