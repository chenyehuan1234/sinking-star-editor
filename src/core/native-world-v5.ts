import type {EditorProject,LevelView,RegionSelection,Vec3,WorldIssue,WorldProject} from '../shared';
import {captureWorldRegion} from './world-region';
import type {NativeWorldProject,NativeWorldIndex,NativeRegionRequest,NativeRegionResult} from '../v08-types';
import {nativeOperations,nativeScene} from '../native-project';
import {NativeWorldEngine,validateNativeWorld} from './native-world';
import {sha256} from './package';
import {parseEntities,writeEntities,position,type EntityFile} from './entities';
import {applyProject,levelView,projectSources} from './project';
import {validateReferences} from './mechanisms';
import {mergeManifests} from './manifests';

/** Keep the original world as the base; viewport windows and scene folders never rebuild the hub. */
export class UnifiedNativeWorldEngine extends NativeWorldEngine {
 private snapshots=new Map<string,EntityFile>();
 private windows=new Map<string,NativeRegionResult>();
 private plain(p:NativeWorldProject):NativeWorldProject {
  validateNativeWorld(p);if(p.version===4)return p;
  const cell=super.index().cells[0].id;
  return {...p,version:4,edits:{[cell]:p.operations??[]},levelEdits:{}};
 }
 private worldProject(p:NativeWorldProject):EditorProject {return {format:'sinking-star-project',version:3,sourceHash:p.sourceHash,sourceBuild:p.sourceBuild,template:'overworld',name:'overworld',operations:nativeOperations(p),camera:p.camera,topology:p.topology};}
 private snapshot(p:NativeWorldProject) {
  const project=this.worldProject(p),key=sha256(JSON.stringify(project));let file=this.snapshots.get(key);
  if(!file){file=project.operations.length||p.camera||p.topology?applyProject(this.pkg,project,this.codec,{...this.file,types:[...this.file.types],records:[...this.file.records]}):this.file;this.snapshots.set(key,file);if(this.snapshots.size>2)this.snapshots.delete(this.snapshots.keys().next().value!);}
  return file;
 }
 regionFile(p:NativeWorldProject){return this.snapshot(p);}
 captureRegion(p:NativeWorldProject,workbench:WorldProject,selection:RegionSelection,progress?:(phase?:string)=>void){
  const source=this.worldProject(p);
  return captureWorldRegion(this.codec,this.snapshot(p),workbench,'world',source,selection,projectSources(source),level=>applyProject(this.pkg,level,this.codec),progress);
 }
 override index(p?:NativeWorldProject):NativeWorldIndex {
  const index=super.index(p?this.plain(p):undefined);
  const links=p?.version===5?this.snapshot(p).records.filter(e=>e.type==='Level_Entry').map(e=>({id:e.id,target:String(this.codec.get(e,'level_name','')),position:position(e)??[0,0,0] as Vec3})):index.cells.flatMap(c=>c.entries.map(e=>({id:e.id,target:e.name,position:e.position})));const settings=this.file.records.find(e=>e.type==='Settings')!,lower=Number(this.codec.get(settings,'underground_barrier',-4)),upper=Number(this.codec.get(settings,'skyground_barrier',10)),zs=links.map(e=>e.position[2]),heightRanges=[{title:'地下',min:Math.floor(Math.min(...zs)),max:Math.ceil(lower)-1},{title:'地表',min:Math.ceil(lower),max:Math.floor(upper)},{title:'天空',min:Math.floor(upper)+1,max:Math.ceil(Math.max(...zs))}];return {...index,heightRanges,entryCount:links.length,levels:p?.version===5?['overworld',...p.scenes!.map(l=>l.id)]:index.levels,entryLinks:links};
 }
 override search(p:NativeWorldProject,query:string){return super.search(this.plain(p),query);}
 override region(r:NativeRegionRequest):NativeRegionResult {
  const start=performance.now();this.index(r.project);
  if(r.session!==r.project.id||!Number.isSafeInteger(r.revision)||r.revision<0)throw Error('预览会话或修订号无效');
  if(r.cellId.startsWith('level:')&&r.project.version===5){const name=r.cellId.slice(6),p=nativeScene(r.project,name);if(!p)throw Error('关卡已不存在');const file=applyProject(this.pkg,p,this.codec);return {session:r.session,revision:r.revision,cellId:r.cellId,view:levelView(this.pkg,p.template,file,this.codec),recordCount:file.records.length,elapsedMs:performance.now()-start,nextId:this.availableId(file)};}
  if(!r.bounds&&r.cellId!=='world')return super.region({...r,project:this.plain(r.project)});
  const bounds=r.bounds??{min:[-1,-1,-100]as Vec3,max:[190,156,100]as Vec3};
  if(![...bounds.min,...bounds.max].every(Number.isFinite)||bounds.min.some((v,i)=>v>bounds.max[i]))throw Error('可视范围无效');
  const key=sha256(JSON.stringify([this.worldProject(r.project),bounds,!!r.overview,!!r.includeBackground]));const cached=this.windows.get(key);
  if(cached)return {...cached,session:r.session,revision:r.revision,elapsedMs:performance.now()-start};
  const file=this.snapshot(r.project),inside=(p:Vec3,padding=0)=>p.every((v,i)=>v>=bounds.min[i]-padding&&v<=bounds.max[i]+padding);
  const scenery=new Set(['Inanimate','Decal','Animating','Procedurally_Animating','Particle_Source']);
  let records=file.records.filter(e=>r.overview?e.type==='Level_Entry'&&inside(position(e)??[0,0,0]):(!scenery.has(e.type)||r.includeBackground||(e.id>>>20)>=899)&&(['Settings','Camera_Control','Camera_Marker','Wall_Set','Ocean_Map','Group'].includes(e.type)||inside(position(e)??[0,0,0],2)));
  const cameraTargets=new Set(records.filter(e=>e.type==='Camera_Control').flatMap(e=>['position_id','look_at_id'].map(k=>Number(this.codec.get(e,k,0)))).filter(Boolean));for(const e of file.records)if(cameraTargets.has(e.id)&&!records.includes(e))records.push(e);
  const ids=new Set(records.map(e=>e.id)),groups=new Map(file.records.filter(e=>e.type==='Group').map(e=>[e.id,e]));
  for(let i=0;i<records.length;i++){const group=groups.get(Number(this.codec.get(records[i],'group_id',0)));if(group&&!ids.has(group.id)){ids.add(group.id);records.push(group);}}
  let view:LevelView;
  if(r.overview){view={name:'overworld',entities:levelView(this.pkg,'overworld',{...this.file,records},this.codec).entities.map(e=>({...e,mesh:''})),typeCount:this.file.types.length,manifest:'',topology:this.index(r.project).topology,terrain:[]};const terrain=levelView(this.pkg,'overworld',{...this.file,records:file.records.filter(e=>e.type==='Wall_Set')},this.codec,bounds).terrain??[],coarse=new Map<string,{x:number;y:number;z:number}>();for(const c of terrain){const x=Math.floor(c.x/4)*4+1.5,y=Math.floor(c.y/4)*4+1.5,key=x+','+y+','+Math.floor(c.z/4),old=coarse.get(key);if(!old||old.z<c.z)coarse.set(key,{x,y,z:c.z});}view.terrain=[...coarse.values()];view.overview=true;}
  else {view=levelView(this.pkg,'overworld',{...file,records},this.codec,bounds);for(const w of view.waters??[]){const x=Math.max(w.x,Math.ceil(bounds.min[0])),y=Math.max(w.y,Math.ceil(bounds.min[1])),width=Math.max(0,Math.min(w.x+w.width,Math.ceil(bounds.max[0]))-x),height=Math.max(0,Math.min(w.y+w.height,Math.ceil(bounds.max[1]))-y),cells:number[]=[];for(let j=0;j<height;j++)for(let i=0;i<width;i++)cells.push(w.cells[(y+j-w.y)*w.width+x+i-w.x]);Object.assign(w,{x,y,width,height,cells});}}
  view.partial=true;const visibleIds=new Set(view.entities.map(e=>e.id)),targets=new Set(view.entities.flatMap(e=>(e.nativeProperties??[]).filter(p=>p.field.kind==='reference'&&Number(p.value)&&!visibleIds.has(Number(p.value))).map(p=>Number(p.value))));view.externalTargets=file.records.filter(e=>targets.has(e.id)).map(e=>({id:e.id,type:e.type,position:position(e)??[0,0,0] as Vec3}));
  const result={session:r.session,revision:r.revision,cellId:'world',view,recordCount:records.length,elapsedMs:performance.now()-start,nextId:this.availableId(file)};
  this.windows.set(key,result);if(this.windows.size>6)this.windows.delete(this.windows.keys().next().value!);return result;
 }
 private availableId(file:EntityFile){return Math.max(900*0x100000,...file.records.filter(r=>r.id>>>20===900).map(r=>r.id))+1;}
 validate(p:NativeWorldProject):WorldIssue[] {
  const index=this.index(p),issues:WorldIssue[]=[],names=new Set(index.levels);
  for(const entry of index.entryLinks??[])if(!names.has(entry.target))issues.push({severity:'error',entityId:entry.id,message:'入口 #'+entry.id+' 关联的关卡不存在：'+entry.target});
  if(p.version===5)for(const l of p.scenes!){const project=l.project;if(project.template===l.id&&project.base?.kind!=='blank'&&!project.operations.length&&!project.camera&&!project.topology)continue;
   try{const f=applyProject(this.pkg,project,this.codec);if(!f.records.some(r=>r.type==='Guy'))issues.push({severity:'error',levelId:l.id,message:l.title+'：缺少主角'});if(project.base?.kind==='blank'&&!f.records.some(r=>r.type==='Door'))issues.push({severity:'error',levelId:l.id,message:l.title+'：缺少出口'});for(const message of validateReferences(this.codec,f))issues.push({severity:'error',levelId:l.id,message:l.title+'：'+message});}catch(e){issues.push({severity:'error',levelId:l.id,message:l.title+'：'+String(e)});}
  }
  return issues;
 }
 impact(p:NativeWorldProject,name:string):{entries:number[];references:string[]} {
  const entries=(this.index(p).entryLinks??[]).filter(e=>e.target===name).map(e=>e.id),entryIds=new Set(entries),references:string[]=[];
  for(const r of this.snapshot(p).records){if(entryIds.has(r.id))continue;for(const field of this.codec.parseTransient(r).fields)if(field.schema.pid&&entryIds.has(Number(field.value)))references.push(r.type+' #'+r.id+' → 入口 #'+field.value+'（'+field.schema.name+'）');}
  // Explicit scene exits are dependencies, not editor folder membership.
  for(const scene of this.index(p).levels){if(scene==='overworld'||scene===name)continue;const project=nativeScene(p,scene);if(!project)continue;const f=applyProject(this.pkg,project,this.codec);for(const r of f.records.filter(r=>r.type==='Door'))for(const field of ['target_level','switch_to_level_set'])if(this.codec.get(r,field,'')===name)references.push(scene+' #'+r.id+' → '+name+'（'+field+'）');}
  for(const entry of this.pkg.entries)if(entry.name.endsWith('.level_set')&&entry.data.toString().split(/\r?\n/).some(line=>line.split('#')[0].trim()===name))references.push('原生关卡序列 '+entry.name+' → '+name+'（先保留此场景，可单独移除地图入口）');
  return {entries,references};
 }
 override build(p:NativeWorldProject):{buffer:Buffer;changed:string[];resources?:{source:string;target:string}[]} {
  if(p.version===4)return super.build(p);this.index(p);
  const changes=new Map<string,Buffer>(),removed=new Set<string>(),resources:{source:string;target:string}[]=[],base=super.index(),names=new Set(p.scenes!.map(l=>l.id));
  const unchanged=(l:NonNullable<NativeWorldProject['scenes']>[number])=>base.levels.includes(l.id)&&l.project.template===l.id&&l.project.base?.kind!=='blank'&&!l.project.operations.length&&!l.project.camera&&!l.project.topology; if(!nativeOperations(p).length&&!p.camera&&!p.topology&&p.scenes!.every(unchanged)&&names.size===base.levels.length-1)return {buffer:this.pkg.buffer,changed:[],resources:[]};
  const file=this.snapshot(p),baseline=new Set(validateReferences(this.codec,this.file,{transient:true,nativeWorld:true}));
  const problems=validateReferences(this.codec,file,{transient:true,nativeWorld:true}).filter(v=>!baseline.has(v));if(problems.length)throw Error('大世界无效引用：'+problems.slice(0,8).join('；'));
  for(const r of file.records)if(r.type==='Level_Entry'&&!names.has(String(this.codec.get(r,'level_name',''))))throw Error('入口 #'+r.id+' 关联的关卡不存在，请先处理入口');
  if(nativeOperations(p).length||p.camera||p.topology){changes.set('data-common/overworld.entities',writeEntities(file));const sources=projectSources(this.worldProject(p));if(sources.some(n=>n!=='overworld'))changes.set('data-common/overworld.level_manifest',mergeManifests(sources.map(n=>this.pkg.get('data-common/'+n+'.level_manifest').toString())));}
  for(const l of p.scenes!){const project=l.project,original=base.levels.includes(l.id);if(original&&project.template===l.id&&project.base?.kind!=='blank'&&!project.operations.length&&!project.camera&&!project.topology)continue;
   const f=applyProject(this.pkg,project,this.codec),before=original?new Set(validateReferences(this.codec,parseEntities(this.pkg.get('data-common/'+l.id+'.entities')),{transient:true})):new Set<string>();
   const issues=validateReferences(this.codec,f,{transient:true}).filter(v=>!before.has(v));if(issues.length)throw Error(l.title+' 无效引用：'+issues.slice(0,8).join('；'));
   changes.set('data-common/'+l.id+'.entities',writeEntities(f));changes.set('data-common/'+l.id+'.level_manifest',mergeManifests(projectSources(project).map(n=>this.pkg.get('data-common/'+n+'.level_manifest').toString())));
   if(!original){changes.set('data/level_sets/'+l.id+'.level_set',Buffer.from('[1]\n'+l.id+'\n'));for(const ext of ['all_paint_data','all_lightmap_data'])resources.push({source:'data-common/'+project.template+'.'+ext,target:'data-common/'+l.id+'.'+ext});}
  }
  for(const name of base.levels)if(name!=='overworld'&&!names.has(name)){for(const entry of this.pkg.entries)if(entry.name.endsWith('.level_set')&&entry.data.toString().split(/\r?\n/).some(line=>line.split('#')[0].trim()===name))throw Error('关卡 '+name+' 仍被原生序列 '+entry.name+' 引用，不能删除');for(const file of ['data-common/'+name+'.entities','data-common/'+name+'.level_manifest','data/level_sets/'+name+'.level_set'])removed.add(file);}
  return {buffer:changes.size||removed.size?this.pkg.rebuild(changes,removed):this.pkg.buffer,changed:[...changes.keys(),...removed],resources};
 }
}
