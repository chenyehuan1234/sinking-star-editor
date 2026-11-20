import {copyGameFiles} from './copy-progress';
import {registerMaterialResolver} from '../render-purpose';
import {linkViewGiver} from '../core/view-giver';
import {gameplayProject,reservedEntityIds} from '../editor-organization';
import {decodeGateKey,gateValues} from '../gate-config';
import {nativeQuaternion} from '../editor-math';
import {rotationValues} from '../core/mechanisms';
import {testRevision} from './test-profiles';
import {SOURCE_EXE,RUNTIME_EXE,isolationSupported,isolationUnavailable,patchSaveDirectory,preparePlaytestSaves,verifyRuntimeSavePath} from './save-isolation';
import {gameplayWorld} from '../editor-organization';
import type {PlaytestChoice,PlaytestPlan,TestContext} from '../v08-types';
import {queueCacheTrim} from './storage';
import {nativeDocument,nativeWorkbench,nativeScene} from '../native-project';
import {validateNativeWorld} from '../core/native-world';
import type {NativeWorldProject,NativeWorldIndex,NativeRegionRequest,NativeRegionResult} from '../v08-types';
import{dependencyEvidence,schemaFingerprint,rebindSource}from'../core/compatibility';
import {mapProject} from '../scene-project';
import {compatiblePreview} from '../core/compatible-preview';
import{inspectTestCopy,freshTestState,writeCopyMarker,promoteTestCopy,recoverCopyReplacement,discardPreparingCopy,markPreparingCopy,cleanupAbandonedPreparingCopies,managedPath,type CopySource,type TestState}from'./playtest-copy';
export type{TestState}from'./playtest-copy';
import {PreviewWorker} from './preview-client';
import type {PreviewRequest,PreviewDelta} from '../preview-delta';
import {diffPreview} from '../preview-delta';
import{directoriesOverlap}from'./game-installation';
import{estimatePreparation}from'./disk-space';import{materializeExample}from'../core/examples';
import{sourceCamera,newCameraClone,cameraEditConfig}from'../core/camera-objects';
import {auxiliaryCameraOverride} from '../screen-camera';import type{CameraObjectRequest,Vec3}from'../shared';
import{mechanismIssues}from'../core/mechanism-check';
import{freshWorldRun,scopedWorld}from'../core/runs';import{captureRegion,validateBundle}from'../core/regions';import{projectSources}from'../core/project';import type{RegionSelection,RegionBundle,RunRequest}from'../shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile,spawn } from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {blockPlaytest} from '../playtest-policy';
import { promisify } from 'node:util';
import { GamePackage, sha256 } from '../core/package';
import { applyProject, buildChanges, levelView, renameSettings, validateProject } from '../core/project';
import { writeEntities } from '../core/entities';
import type { Catalog, EditorProject } from '../shared';
import type{WorldProject,WorldIssue}from'../shared';
import{ExeReflection}from'../core/reflection';import{PropertyCodec}from'../core/properties';
import{WorldCompiler,newWorld,validateWorld,worldIssues}from'../core/world';
import{prefabs,validateReferences}from'../core/mechanisms';import{CampaignManager}from'./campaigns';
import {buildObjectCatalog,currentCatalogLabels} from '../core/object-catalog';
import type {ObjectCatalog} from '../catalog-types';
import {NativeAssets} from './assets';
import {Worker} from 'node:worker_threads';
import {createBlank} from '../core/blank';
import {parseEntities} from '../core/entities';
import {placeNative} from '../core/placement';
import {migrateEntrances} from '../core/entries';
import {nativeRegions} from '../core/native-regions';
import {exportDocument,exportWorld} from '../core/export-scope';
import type {ExportRequest,ExportResult} from '../export-types';
import {designLevels, encodeShare, shareLevel, type ShareDesign} from '../core/share';

const exec=promisify(execFile);
export async function atomicWrite(file:string,data:Buffer|string):Promise<void>{
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=file+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,data,{flag:'wx'});await fs.rename(temp,file);}catch(e){await fs.rm(temp,{force:true});throw e;}
}

export class EditorService {
  onPlaytestProgress?:(text:string,progress?:import('../shared').PreparationProgress)=>void;
  async prepareShare(world:WorldProject, levelId:string|undefined, editorVersion:string){
    await this.unchanged();
    const design:ShareDesign=world.native?nativeDocument(world):world;
    if(world.native)validateNativeWorld(design);else validateWorld(world);
    const byName=new Map<string,string>();
    for(const level of world.levels)for(const key of [level.id,level.project.name,`ed_${world.id}_${level.id}`])byName.set(key,level.id);
    const levels=designLevels(design);
    const wanted=levelId?new Set([levelId]):undefined;
    const byId=new Map(world.levels.map(level=>[level.id,level]));
    const manifestById=new Map(levels.map(level=>[level.id,level]));
    function add(id:string, result:Set<string>){if(id&&byId.has(id))result.add(id);}
    const inspected=new Set<string>();
    const inspect=(id:string)=>{
      if(inspected.has(id))return;
      inspected.add(id);
      const level=byId.get(id);
      if(!level)throw Error('所选关卡不存在');
      if(world.native&&!level.project.operations.length&&!level.project.base&&level.project.template===level.id)return;
      const dependencies=new Set<string>();
      const file=applyProject(this.pkg,level.project,this.codec);
      for(const object of file.records){
        const fields=object.type==='Door'?['target_level','switch_to_level_set']:object.type==='Level_Entry'?['level_name']:[];
        for(const field of fields){
          const name=String(this.codec!.get(object,field,''));
          add(byName.get(name)??'',dependencies);
          if(name.startsWith('ed_')&&!byName.has(name))throw Error(`「${level.title}」的 ${field} 引用了未找到的关卡 ${name}`);
        }
      }
      dependencies.delete(id);
      if(dependencies.size)manifestById.get(id)!.requires=[...dependencies];
      if(wanted)for(const target of dependencies)wanted.add(target);
    };
    for(const id of wanted??byId.keys())inspect(id);
    if(levelId){
      return shareLevel(design,{format:'sstar-share',version:1,title:design.name,scope:'project',sourceHash:design.sourceHash,sourceBuild:design.sourceBuild,editorVersion,sha256:'',levels},levelId);
    }
    return encodeShare(design,'project',editorVersion,levels);
  }
  async exportDesign(request:ExportRequest,target:string):Promise<ExportResult>{
    if(!request||!['project','runtime'].includes(request.format))throw Error('导出类型无效');
    const source=request.project;if(source.format==='sinking-star-world')await this.checkWorld(source);else await this.nativeIndex(source);
    const parent=await fs.realpath(request.format==='project'?path.dirname(target):target);
    for(const protectedRoot of[this.gamePath,this.campaigns.saves,this.testRoot])if(protectedRoot){const rel=path.relative(await fs.realpath(protectedRoot).catch(()=>protectedRoot),parent);if(!rel||!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel))throw Error('请选择游戏、正式存档及试玩副本以外的导出位置');}
    if(source.format==='sinking-star-native-world'&&source.version===5&&request.scope.mode!=='world'){const selected=new Set(request.scope.levelIds);for(const l of source.scenes!.filter(l=>selected.has(l.id))){const file=applyProject(this.pkg,l.project,this.codec);for(const r of file.records.filter(r=>r.type==='Door'))for(const field of ['target_level','switch_to_level_set']){const target=String(this.codec!.get(r,field,''));if(source.scenes!.some(l=>l.id===target)&&!selected.has(target))throw Error('「'+l.title+'」出口依赖未选关卡 '+target+'，请一并导出');}}}const scoped=exportWorld(source,request.scope),document=exportDocument(source,request.scope);
    if(scoped.format==='sinking-star-world'){
      for(const l of scoped.levels){const file=applyProject(this.pkg,l.project,this.codec);for(const r of file.records.filter(r=>r.type==='Door'))for(const field of['target_level','switch_to_level_set']){const name=String(this.codec!.get(r,field,''));if(!name)continue;const match=source.format==='sinking-star-world'?source.levels.find(t=>name===`ed_${source.id}_${t.id}`||name===t.project.name):undefined;if(match&&!scoped.levels.some(t=>t.id===match.id))throw Error(`「${l.title}」的 ${field} 依赖未选关卡「${match.title}」，请一并导出`);if(match&&request.format==='runtime')l.project.operations.push({kind:'properties',id:r.id,values:{[field]:`ed_${scoped.id}_${match.id}`}});}}
    }
    if(request.format==='project'){
      const file=path.join(parent,path.basename(target));try{if((await fs.lstat(file)).isSymbolicLink())throw Error('导出文件不能是链接');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      await atomicWrite(file,JSON.stringify(document,null,2));return{path:file,files:1};
    }
    await this.verifySourceHash();let output:Buffer,resources:{source:string;target:string}[]=[];
    if(scoped.format==='sinking-star-world'){const result=this.compiler!.build(scoped);output=this.pkg.rebuild(result.changes);resources=[...result.resources];const pc=await fs.readdir(path.join(this.gamePath,'data-pc'));for(const l of scoped.levels){const source=l.project.template,target=result.levelNames[l.id];for(const name of pc)if(name.startsWith(source+'_')&&name.endsWith('.texture'))resources.push({source:`data-pc/${name}`,target:`data-pc/${target}${name.slice(source.length)}`});}}
    else{const worker=await this.previewWorker();if(!worker)throw Error('请先构建后台');const result=await worker.request<{buffer:Uint8Array;resources?:{source:string;target:string}[]}>('native-build',{project:scoped,build:this.build});output=Buffer.from(result.buffer);resources=await this.nativeAliases(scoped,result.resources??[]);}
    const name=(source.name||'export').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,50)+'-'+Date.now(),out=path.join(parent,name),stage=out+'.tmp';await fs.mkdir(stage);
    try{const entries:{path:string;sha256:string}[]=[];const put=async(relative:string,data:Buffer|string)=>{if(relative.includes('..')||path.isAbsolute(relative))throw Error('导出资源路径无效');await atomicWrite(path.join(stage,relative),data);entries.push({path:relative,sha256:sha256(data)});};
      await put('data/levels.package',output);if(scoped.format==='sinking-star-world'){const paint=Buffer.alloc(16);paint.write('allp');paint.writeUInt32LE(6,4);const light=Buffer.alloc(8);light.writeUInt32LE(3);for(const name of['overworld','intro']){await put(`data-common/${name}.all_paint_data`,paint);await put(`data-common/${name}.all_lightmap_data`,light);}}for(const r of resources){const from=path.resolve(this.gamePath,r.source);if(!from.startsWith(this.gamePath+path.sep))throw Error('资源来源越界');try{await put(r.target,await fs.readFile(from));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
      await put(document.format==='sinking-star-project'?'design.sstar.json':document.format==='sinking-star-world'?'design.sstar-world.json':'design.sstar-native-world.json',JSON.stringify(document,null,2));
      await put('README.txt','沉星之序编辑器原生运行数据\r\n需要匹配版本的原游戏资源。此文件夹不包含游戏程序或存档。请通过编辑器导入 design 工程并独立试玩，不要覆盖 Steam 原安装。\r\n单关表示本次自定义内容范围；levels.package 仍包含原生基础内容。\r\n');
      await atomicWrite(path.join(stage,'manifest.json'),JSON.stringify({format:'sstar-runtime-export',version:1,sourceHash:this.sourceHash,sourceBuild:this.build,scope:request.scope,files:entries},null,2));await fs.rename(stage,out);return{path:out,files:entries.length+1,hash:sha256(output)};
    }catch(e){await fs.rm(stage,{recursive:true,force:true});throw e;}
  }
  gamePath='';pkg!:GamePackage;sourceHash='';private exeHash='';private isolationReady=false;build='unknown';private stamp='';private busy=false;
  readonly testRoot:string;
  codec?:PropertyCodec;private compiler?:WorldCompiler;readonly campaigns:CampaignManager;
  private previews?:PreviewWorker;
  private async previewWorker(){const filename=path.join(path.dirname(this.workerFile),'preview-worker.cjs');try{await fs.access(filename);}catch{return undefined;}return this.previews??=new PreviewWorker(this.gamePath,filename);}
  assets?:NativeAssets;private objects?:Promise<ObjectCatalog>;private assetFiles:string[]=[];
  constructor(readonly workspace:string,readonly workerFile=path.resolve('dist/main/asset-worker.cjs')){this.workspace=path.resolve(workspace);this.testRoot=path.join(this.workspace,'playtest-game');this.campaigns=new CampaignManager(this.workspace);}
  async exclusive<T>(fn:()=>Promise<T>):Promise<T>{if(this.busy)throw new Error('另一项文件操作正在进行，请稍候');this.busy=true;try{return await fn();}finally{this.busy=false;}}
  async connect(gamePath:string):Promise<Catalog>{
    const root=await fs.realpath(gamePath);
    await fs.access(path.join(root,'sinking_star.exe'));
    const source=path.join(root,'data/levels.package'),buffer=await fs.readFile(source),pkg=new GamePackage(buffer),st=await fs.stat(source);
    if(directoriesOverlap(await fs.realpath(this.campaigns.saves).catch(()=>this.campaigns.saves),await fs.realpath(this.workspace).catch(()=>this.workspace)))throw Error('工作区不能包含正式存档目录，也不能位于正式存档目录内');
    if(directoriesOverlap(root,await fs.realpath(this.workspace).catch(()=>this.workspace)))throw new Error('请选择 Steam 原始游戏目录，工作区与原游戏目录不能互相包含');
    const sourceHash=sha256(buffer),exe=await fs.readFile(path.join(root,'sinking_star.exe')),codec=exe.length>64?new PropertyCodec(new ExeReflection(exe)):undefined;
    let assetFiles:string[]=[],materials:GamePackage|undefined,regions:Catalog['regions'],build='unknown';
    if(codec){
      for(const type of['Settings','Guy','Wall_Set','Camera_Control','Marker','Level_Entry','Inanimate'])if(!codec.reflection.types.has(type))throw Error(`当前版本缺少必要原生类型：${type}`);
      for(const name of['mirror_1','heroes1_1','3d_intro_heroes'])pkg.get(`data-common/${name}.entities`);
      assetFiles=await fs.readdir(path.join(root,'data-pc'));materials=new GamePackage(await fs.readFile(path.join(root,'data/materials.package')));
      let localization='';try{localization=await fs.readFile(path.join(root,'data/strings/s-cn.localization'),'utf8');}catch{}regions=nativeRegions(pkg,codec,localization);
    }
    try{const acf=await fs.readFile(path.resolve(root,'../../appmanifest_499170.acf'),'utf8');build=acf.match(/"buildid"\s+"(\d+)"/)?.[1]??'unknown';}catch{}
    await fs.mkdir(this.workspace,{recursive:true});
    // Connecting and browsing are read-only toward the game's save directory.
    // A failed new connection must leave the previously usable installation intact.
    await this.previews?.dispose();this.previews=undefined;await this.assets?.dispose();this.objects=undefined;this.pkg=pkg;this.sourceHash=sourceHash;this.exeHash=sha256(exe);this.gamePath=root;this.stamp=`${st.size}:${st.mtimeMs}`;this.codec=codec;this.assetFiles=assetFiles;this.build=build;
    this.assets=codec?new NativeAssets(root,this.workspace,sourceHash+codec.reflection.hash,assetFiles,materials!,this.workerFile):undefined;if(this.assets){const assets=this.assets;registerMaterialResolver(this.pkg,name=>assets.material(name).shader);}
    this.schemaCache='';this.compiler=codec?new WorldCompiler(pkg,codec):undefined;this.isolationReady=isolationSupported(exe);
    const checkedNovember19=this.sourceHash==='b78c8cb3796fd0bf370461b267a299dc107d90d407f4fd59c75778d98f778653'&&this.exeHash==='e5d5d928fab492fdd5ef978133e00c85b897144850aaed8b3291d758980c1a4a';
    let runtimeVerified=false;try{const e=JSON.parse(await fs.readFile(path.join(this.workspace,'playtest-evidence.json'),'utf8'));runtimeVerified=e.runtimeVerified===true&&e.sourceHash===this.sourceHash;}catch{}
    return {gamePath:root,sourceHash:this.sourceHash,build:this.build,workspace:this.workspace,compatibility:checkedNovember19?'Build 26787118 已通过原生数据检查':((this.sourceHash==='d747e5d9b8f540c9c6b90e8e987bd74a8c7f8f2f0672fce189403128f1f3117c'&&this.codec?.reflection.hash==='d802098b7cb85eadfc733b88d1554042fad950c572e916febea3f669a474a549')||(this.sourceHash==='408aba3676925faea0c823f8c231e30844feffe9c32ae42644d273ef31863589'&&this.codec?.reflection.hash==='0ae10a513dae25286fe93d0db4fa8a2df9a473bc07e1734e12bc1ad30166db1c')||(this.sourceHash==='a736bb1c2b6d44b80fb6de5b30a1f93308ebac0d3ead0e7c022b58a0eee47314'&&this.exeHash==='978b302fd0952e4ea8d869553aec875d9c635278a7d0f8cdb752f5a797a370aa'))?'数据回归版本；游戏内运行仍需实测':'当前版本未经回归；已通过结构解析，试玩需实测',levels:pkg.entries.filter(e=>e.name.endsWith('.entities')).map(e=>path.basename(e.name,'.entities')),regions,runtimeVerified};
  }
  async unchanged(){
    if(!this.pkg)throw new Error('请先连接游戏目录');
    const st=await fs.stat(path.join(this.gamePath,'data/levels.package'));
    if(`${st.size}:${st.mtimeMs}`!==this.stamp)throw new Error('游戏源包发生变化，请重新连接并核对兼容性');
  }
  private schemaCache='';
  evidence(p:EditorProject|WorldProject){if(!this.codec)throw Error('当前安装缺少原生类型信息');if(!this.schemaCache)try{this.schemaCache=schemaFingerprint(this.codec);}catch{this.schemaCache=this.codec.reflection.hash;}return dependencyEvidence(this.pkg,p,this.schemaCache);}
  async adaptProject(p:EditorProject){
    await this.checkProject(p);
    return p.sourceHash===this.sourceHash&&p.sourceBuild===this.build?p:rebindSource(p,this.sourceHash,this.build);
  }
  async adaptWorld(w:WorldProject){
    validateWorld(w);await this.unchanged();
    if(w.sourceHash===this.sourceHash&&w.sourceBuild===this.build)return w;
    if(w.native){const p=await this.adaptNativeWorld(nativeDocument(w));return nativeWorkbench(p,await this.nativeIndex(p));}
    return rebindSource(w,this.sourceHash,this.build);
  }
  async adaptNativeWorld(p:NativeWorldProject){
    validateNativeWorld(p);await this.unchanged();
    if(p.sourceHash===this.sourceHash&&p.sourceBuild===this.build)return p;
    const next=rebindSource(p,this.sourceHash,this.build),index=await this.nativeIndex();
    if(next.version===4)next.scenes=nativeWorkbench(next,{...index,levels:[...new Set([...index.levels,...Object.keys(next.levelEdits)])]}).levels;
    else {
      const imported=new Set([...next.scenes!.map(level=>level.id),...next.deletedScenes??[]]);
      const linked=new Set((await this.nativeIndex(next)).entryLinks?.map(entry=>entry.target));
      const additions=nativeWorkbench({...next,scenes:undefined,levelEdits:{}},{...index,levels:index.levels.filter(name=>linked.has(name)&&!imported.has(name))}).levels;
      next.scenes!.push(...additions);
      // Older worlds may omit native scenes that were added by a game update.
      // Keep unlisted original data on build unless the editor explicitly deleted a scene.
    }
    return next;
  }

  async checkProject(p:EditorProject){validateProject(p);await this.unchanged();}
  async verifySourceHash(){await this.unchanged();if(sha256(await fs.readFile(path.join(this.gamePath,'data/levels.package')))!==this.sourceHash)throw new Error('游戏源包哈希发生变化，操作已停止');}
  async openLevel(name:string){await this.unchanged();return levelView(this.pkg,name,undefined,this.codec);}
  async preview(input:EditorProject){const p=await this.adaptProject(input),worker=await this.previewWorker();return worker?worker.request<import('../shared').LevelView>('preview',p):levelView(this.pkg,p.template,compatiblePreview(p,candidate=>applyProject(this.pkg,candidate,this.codec)),this.codec);}
  async previewUpdate(r:PreviewRequest,previewOwner?:string):Promise<PreviewDelta>{if(typeof r.scene!=='string'||r.scene.length>200||!Number.isSafeInteger(r.revision)||r.revision<0||Boolean(r.project)===Boolean(r.world))throw Error('预览请求无效');if(r.project)await this.checkProject(r.project);else await this.checkWorld(r.world!);const worker=await this.previewWorker();if(worker)return worker.request('update',{...r,previewOwner});return diffPreview(null,r.project?await this.preview(r.project):await this.worldPreview(r.world!),r);}
  private async cameraScene(input:EditorProject|WorldProject){
    if(input.format==='sinking-star-world'){
      if(input.native)throw Error('原版大地图镜头编辑需要原版场景请求');
      await this.checkWorld(input);
      return {project:mapProject(input),preview:(p:EditorProject)=>this.compiler!.previewMap({...input,map:{...input.map,objects:p.operations,camera:p.camera}})};
    }
    await this.checkProject(input);
    return {project:input,preview:(p:EditorProject)=>applyProject(this.pkg,p,this.codec)};
  }
  async viewGiverLink(input:EditorProject|WorldProject,r:import('../shared').ViewGiverLinkRequest){const {project,preview}=await this.cameraScene(input);if(!this.codec)throw Error('卷轴关联需要原生类型信息');const worker=input.format==='sinking-star-project'?await this.previewWorker():undefined;return worker?worker.request<import('../shared').ViewGiverLinkResult>('view-giver-link',{project,request:r}):linkViewGiver(this.pkg,this.codec,project,r,preview);}
  async cameraObject(input:EditorProject|WorldProject,request:CameraObjectRequest){const {project:p,preview}=await this.cameraScene(input);const c=this.codec;if(!c)throw Error('相机编辑需要原生类型信息');const file=preview(p),reserved=reservedEntityIds(p.operations,file.records.map(r=>r.id),p.camera);let edit;
   if(request.action==='delete')edit={kind:'delete' as const,ids:[request.id]};
   else if(request.action==='clone')edit=newCameraClone(c,file,file,request.id,request.offset,undefined,reserved);
   else if(request.action==='create'){if(!['play','overview','height-lock','limiter','overview-region'].includes(request.kind))throw Error('原生区域类别无效');const selected=request.role==='aux'?(request.sourceId?file.records.find(r=>r.id===request.sourceId&&r.type==='Camera_Control'&&!c.get(r,'is_for_map_overview',false)):file.records.find(r=>r.type==='Camera_Control'&&!c.get(r,'is_for_map_overview',false)&&Number(c.get(r,'minus_one_if_not_primary',0))!==-1)):undefined;if(request.sourceId&&!selected)throw Error('额外视角的来源镜头不存在或不是玩法镜头');if(selected)edit=newCameraClone(c,file,file,selected.id,[0,0,0],undefined,reserved);else{const source=sourceCamera(c,this.pkg,request.kind),origin=['x','y','z'].map(a=>Number(c.get(source.root,'position.'+a))),offset=request.position.map((n,i)=>n-origin[i])as Vec3;edit=newCameraClone(c,file,source.file,source.root.id,offset,source.template,reserved);}}
   else throw Error('未知相机操作');let config=cameraEditConfig(p.camera,edit);if(request.action==='create'&&request.role!==undefined){if(request.kind!=='play'||!['main','aux'].includes(request.role))throw Error('镜头用途无效');if(request.role==='aux'&&edit.kind==='clone'){if(!edit.sourceTemplate){const original=auxiliaryCameraOverride(p.camera,edit.sourceId,edit.ids[edit.sourceId]);if(original)config.controls=[...(config.controls??[]),original];}const used=new Set(file.records.filter(r=>r.type==='Camera_Control').map(r=>String(c.get(r,'entity_name',''))));let name='extra_view',n=2;while(used.has(name))name='extra_view_'+n++;config=cameraEditConfig(config,{kind:'patch',id:edit.ids[edit.sourceId],values:{entity_name:name,minus_one_if_not_primary:-1}});}}if(request.action==='delete'){config.controls=config.controls?.filter(v=>v.id!==request.id);if(config.screenCameraId===request.id)delete config.screenCameraId;}preview({...p,camera:config});return config;
  }
  async levelCreateBlank(width=16,height=16){await this.unchanged();return createBlank(this.sourceHash,this.build,width,height);}
  async presetPreview(key:string){const catalog=await this.objectCatalog(),configured=decodeGateKey(key),p=catalog.presets.find(p=>p.key===(configured?.key??key)&&p.parsed);if(configured&&p?.type!=='Gate')throw Error('配置只用于门闸');if(!p)throw new Error('预设不存在');const source=parseEntities(this.pkg.get(`data-common/${p.template}.entities`));const file:import('../core/entities').EntityFile={prefix:source.prefix,types:source.types,records:[]};placeNative(this.pkg,this.codec!,file,{kind:'prefab',id:900*0x100000+1,template:p.template,sourceId:p.sourceId,position:[0,0,0],assembly:p.type!=='Level_Entry'&&p.placement==='assembly',standaloneFreezer:p.type==='Freezer'||undefined,values:configured?gateValues(configured.draft):undefined});if(configured){file.records=file.records.map(r=>r.id===900*0x100000+1?this.codec!.patch(r,rotationValues(r.type,nativeQuaternion(configured.draft.yaw))):r);}return levelView(this.pkg,p.template,file,this.codec);}
  private thumbnailPath(key:string){if(typeof key!=='string'||!/^[a-f0-9]{16,128}$/.test(key))throw new Error('缩略图标识无效');return path.join(this.workspace,'cache','thumbnails-v04',this.sourceHash,key+'.png');}
  async thumbnailRead(key:string){try{const file=this.thumbnailPath(key),data=await fs.readFile(file);await fs.utimes(file,new Date(),new Date()).catch(()=>{});return'data:image/png;base64,'+data.toString('base64');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
  async thumbnailWrite(key:string,png:string){const file=this.thumbnailPath(key);if(typeof png!=='string'||!png.startsWith('data:image/png;base64,')||png.length>2_000_000)throw new Error('缩略图数据无效');const data=Buffer.from(png.slice(22),'base64');if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('缩略图必须是 PNG');await atomicWrite(file,data);queueCacheTrim(this.workspace);}
  async objectCatalog():Promise<ObjectCatalog>{
    await this.unchanged();if(!this.codec)throw new Error('对象目录需要游戏类型信息');
    return this.objects??=(async()=>{const file=path.join(this.workspace,'cache',`catalog-${this.sourceHash}-${this.codec!.reflection.hash}.json`);try{const c=JSON.parse(await fs.readFile(file,'utf8'))as ObjectCatalog;if(c.version===1&&c.schemaRevision===4&&c.sourceHash===this.sourceHash&&c.exeHash===this.codec!.reflection.hash)return currentCatalogLabels(c);}catch{}
      const c=await new Promise<ObjectCatalog>((resolve,reject)=>{const worker=new Worker(path.join(path.dirname(this.workerFile),'catalog-worker.cjs'));worker.once('message',m=>{void worker.terminate();m.error?reject(new Error(m.error)):resolve(m.value);});worker.once('error',reject);worker.once('exit',code=>{if(code!==0&&code!==1)reject(new Error('对象扫描线程异常退出'));});worker.postMessage({root:this.gamePath,build:this.build});});
      await atomicWrite(file,JSON.stringify(c));return c;})();
  }
  async worldPreview(w:WorldProject){if(w.native)return (await this.nativeRegion({project:nativeDocument(w),session:w.id,revision:0,cellId:'world',overview:true})).view;await this.checkWorld(w);const worker=await this.previewWorker();if(worker)return worker.request<import('../shared').LevelView>('worldPreview',w);return levelView(this.pkg,'overworld',this.compiler!.previewMap(w),this.codec);}
  async buildProject(p:EditorProject){
    await this.checkProject(p);
    const source=await fs.readFile(path.join(this.gamePath,'data/levels.package'));
    if(sha256(source)!==this.sourceHash)throw new Error('源包哈希已变化，构建停止');
    const output=this.pkg.rebuild(buildChanges(this.pkg,p,this.codec)),name=`${p.name}-${Date.now()}`;
    const out=path.join(this.workspace,'exports',name+'.package');await atomicWrite(out,output);
    await atomicWrite(path.join(this.workspace,'exports',name+'.sstar.json'),JSON.stringify(p,null,2));
    return {path:out,hash:sha256(output)};
  }
  async assertStopped(){
    if(process.platform!=='win32')return;
    const result=await exec('tasklist',['/FO','CSV','/NH'],{windowsHide:true});
    if(/"(?:sinking_star|SinkingStarPlaytest)\.exe"/i.test(result.stdout))throw new Error('请先退出沉星之序或试玩窗口，再修改测试副本');
  }
  private statePath(){return path.join(this.workspace,'playtest-state.json');}
  private copySource():CopySource{return{workspace:this.workspace,gamePath:this.gamePath,testRoot:this.testRoot,sourceHash:this.sourceHash,sourceBuild:this.build,exeHash:this.exeHash};}
  private async readState():Promise<TestState>{
    const copy=await inspectTestCopy(this.copySource());if(!copy.prepared||!copy.state)throw Error(copy.requiresRefresh?'试玩副本属于旧游戏版本，请重新准备试玩':'请先准备试玩副本');const s=copy.state;
    if(s.pendingHash){const actual=sha256(await fs.readFile(path.join(this.testRoot,'data/levels.package')));if(actual===s.pendingHash){s.deployedHash=actual;delete s.pendingHash;await atomicWrite(this.statePath(),JSON.stringify(s,null,2));}}
    if(copy.recoverState)await atomicWrite(this.statePath(),JSON.stringify(s,null,2));return s;
  }
  async preparationEstimate():Promise<import('../shared').PreparationEstimate>{await this.unchanged();const copy=await inspectTestCopy(this.copySource());return{...await estimatePreparation(this.gamePath,this.workspace,copy.prepared||Boolean(copy.sourceExeMissing)),requiresRefresh:copy.requiresRefresh};}
  async prepare():Promise<string>{
    await this.unchanged();await this.assertStopped();const source=this.copySource();
    const blank={copiedBytes:0,totalBytes:0,filesCopied:0,totalFiles:0};
    const report=(phase:import('../shared').PreparationProgress['phase'],text:string,counts=blank)=>this.onPlaytestProgress?.(text,{phase,...counts});
    try{if(await fs.access(path.join(this.workspace,'playtest-replacement.json')).then(()=>true,()=>false))report('cleanup','恢复上次试玩副本更新…');await recoverCopyReplacement(source);await cleanupAbandonedPreparingCopies(source,()=>report('cleanup','清理上次未完成的复制…'));}catch(error){this.onPlaytestProgress?.('试玩副本恢复失败：'+String(error));throw error;}
    const copy=await inspectTestCopy(source).catch(error=>{this.onPlaytestProgress?.('准备试玩副本失败：'+String(error));throw error;});
    if(copy.sourceExeMissing){await this.verifySourceHash();await atomicWrite(path.join(this.testRoot,SOURCE_EXE),await fs.readFile(path.join(this.gamePath,'sinking_star.exe')));return this.prepare();}
    if(copy.prepared){if(copy.recoverState)await atomicWrite(this.statePath(),JSON.stringify(copy.state,null,2));const raw=path.join(this.testRoot,'sinking_star.exe');if(await fs.access(raw).then(()=>true,()=>false))await fs.rename(raw,path.join(this.testRoot,SOURCE_EXE));this.onPlaytestProgress?.('复用已有试玩副本');return this.testRoot;}
    const building=path.join(this.workspace,`preparing-${Date.now()}-${process.pid}`);
    try{
      report('scan','统计试玩副本大小…');
      const estimate=await this.preparationEstimate();if(!estimate.canPrepare)throw Error(`工作区磁盘空间不足：需约 ${(estimate.requiredBytes/2**30).toFixed(1)} GB，可用 ${(estimate.availableBytes/2**30).toFixed(1)} GB。请在工程菜单更换工作区并重启。`);
      await managedPath(this.workspace,building);
      const counts=await copyGameFiles(this.gamePath,building,p=>this.onPlaytestProgress?.(p.phase==='scan'?'统计试玩副本大小…':copy.requiresRefresh?'复制新版试玩副本…':'首次复制试玩副本…',p),()=>markPreparingCopy(source,building));
      report('verify','校验新版试玩资源…',counts);
      if(sha256(await fs.readFile(path.join(building,'data/levels.package')))!==this.sourceHash||sha256(await fs.readFile(path.join(building,'sinking_star.exe')))!==this.exeHash)throw Error('复制期间游戏源文件已变化，请重新连接');
      await this.verifySourceHash();await this.assertStopped();
      const backup=path.join(this.workspace,'backups',this.sourceHash+'.package');await managedPath(this.workspace,backup);await fs.mkdir(path.dirname(backup),{recursive:true});
      try{await fs.writeFile(backup,this.pkg.buffer,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
      if(sha256(await fs.readFile(backup))!==this.sourceHash)throw Error('备份包损坏');
      const state=freshTestState(source);await fs.writeFile(path.join(building,'steam_appid.txt'),'499170');await writeCopyMarker(building,state,copy.state);
      await fs.rename(path.join(building,'sinking_star.exe'),path.join(building,SOURCE_EXE));
      const final=await inspectTestCopy(source);if(final.prepared)throw Error('试玩副本已由另一项操作更新，请重试');
      report('replace','替换当前试玩副本…',counts);
      await promoteTestCopy(source,building,final);await atomicWrite(this.statePath(),JSON.stringify(state,null,2));
      report('cleanup','清理旧试玩副本…',counts);await recoverCopyReplacement(source);
      this.onPlaytestProgress?.(copy.requiresRefresh?'试玩副本已更新，旧副本已清理':'试玩副本已准备完成');return this.testRoot;
    }catch(error){
      // A surviving replacement journal owns its rollback and staging directory.
      // Never discard those files when recovery needs them.
      const pending=await fs.access(path.join(this.workspace,'playtest-replacement.json')).then(()=>true,()=>false);
      if(!pending)await discardPreparingCopy(source,building).catch(cleanup=>{this.onPlaytestProgress?.('临时复制清理失败：'+String(cleanup));});
      this.onPlaytestProgress?.('准备试玩副本失败：'+String(error));throw error;
    }
  }
  private async restoreAux(s:TestState){
    for(const rel of s.aux){const source=path.join(this.gamePath,rel),target=path.join(this.testRoot,rel);
      try{await fs.copyFile(source,target);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')await fs.rm(target,{force:true});else throw e;}
    }
  }
  async deploy(p:EditorProject){
    await this.checkProject(p);await this.verifySourceHash();await this.assertStopped();await this.prepare();
    const s=await this.readState();
    const f=applyProject(this.pkg,p,this.codec);if(!this.codec)renameSettings(f,p.template,'intro');
    const changes=buildChanges(this.pkg,p,this.codec);
    changes.set('data-common/intro.entities',writeEntities(f));changes.set('data-common/intro.level_manifest',changes.get(`data-common/${p.name}.level_manifest`)!);
    const output=this.pkg.rebuild(changes);
    await this.restoreAux(s);
    // Preserve template paint/lightmap IDs; alias reflection probes to the test slot name.
    const copies:{source:string;target:string}[]=[];
    for(const ext of ['all_paint_data','all_lightmap_data'])copies.push({source:`data-common/${p.template}.${ext}`,target:`data-common/intro.${ext}`});
    for(const name of await fs.readdir(path.join(this.gamePath,'data-pc')))if(name.startsWith(p.template+'_')&&name.endsWith('-probe_array.texture'))copies.push({source:`data-pc/${name}`,target:`data-pc/intro${name.slice(p.template.length)}`});
    s.aux=[...new Set([...s.aux,...copies.map(c=>c.target)])];s.pendingHash=sha256(output);
    // Persist recovery intent before touching test assets. Original Steam files are never a target.
    await atomicWrite(this.statePath(),JSON.stringify(s,null,2));
    for(const c of copies){try{await fs.copyFile(path.join(this.gamePath,c.source),path.join(this.testRoot,c.target));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await fs.rm(path.join(this.testRoot,c.target),{force:true});}}
    await atomicWrite(path.join(this.testRoot,'data/levels.package'),output);
    s.deployedHash=sha256(output);delete s.pendingHash;s.template=p.template;s.name=p.name;
    await atomicWrite(this.statePath(),JSON.stringify(s,null,2));
    return '测试副本已更新。启动后选择「开始新战役」进入首关；每次修改后请使用新测试战役，以免旧历史覆盖布局。';
  }
  async restore(){
    await this.unchanged();await this.assertStopped();const s=await this.readState();
    const original=await fs.readFile(path.join(this.workspace,'backups',s.sourceHash+'.package'));
    if(sha256(original)!==s.sourceHash)throw new Error('原包备份哈希不匹配，恢复已停止');
    s.pendingHash=this.sourceHash;await atomicWrite(this.statePath(),JSON.stringify(s,null,2));
    await this.restoreAux(s);await atomicWrite(path.join(this.testRoot,'data/levels.package'),original);
    await atomicWrite(this.statePath(),JSON.stringify(freshTestState(this.copySource()),null,2));
    return '测试副本的关卡包和辅助资源已恢复；Steam 安装目录未改动。';
  }
  async launch():Promise<string>{return blockPlaytest();}
  async checkWorld(w:WorldProject){if(w.native){await this.nativeIndex(nativeDocument(w));return;}validateWorld(w);await this.unchanged();if(!this.compiler||!this.codec)throw new Error('当前游戏缺少已验证的类型信息');}
  private async nativeAliases(p:NativeWorldProject,initial:{source:string;target:string}[]=[]){const resources=[...initial],pc=await fs.readdir(path.join(this.gamePath,'data-pc'));for(const scene of p.scenes??[]){if(this.pkg.entries.some(e=>e.name==='data-common/'+scene.id+'.entities'))continue;for(const name of pc)if(name.startsWith(scene.project.template+'_')&&name.endsWith('.texture'))resources.push({source:'data-pc/'+name,target:'data-pc/'+scene.id+name.slice(scene.project.template.length)});}return resources;}
  async nativeImpact(project:NativeWorldProject,name:string):Promise<{entries:number[];references:string[]}>{await this.nativeIndex(project);return (await this.previewWorker())!.request('native-impact',{project,name,build:this.build});}
  async nativeValidate(project:NativeWorldProject):Promise<WorldIssue[]>{await this.nativeIndex(project);const worker=await this.previewWorker();return worker!.request('native-validate',{project,build:this.build});}
  async nativeSearch(project:NativeWorldProject,query:string):Promise<{id:number;type:string;name:string;position:Vec3;cellId:string}[]>{await this.unchanged();const worker=await this.previewWorker();if(!worker)throw Error('请先构建编辑器后台');return worker.request('native-search',{project,query,build:this.build});}
  async nativeIndex(project?:NativeWorldProject):Promise<NativeWorldIndex>{await this.unchanged();if(project)validateNativeWorld(project);const worker=await this.previewWorker();if(!worker)throw Error('请先构建编辑器后台');return worker.request('native-index',{project,build:this.build});}
  async nativePreviewUpdate(r:import('../v08-types').NativeViewportPreviewRequest,previewOwner?:string):Promise<PreviewDelta>{
    await this.unchanged();
    if(typeof r.scene!=='string'||r.scene.length>200||r.scene!==r.project.id+':world'||r.cellId!=='world'||r.baseRevision!==undefined&&(!Number.isSafeInteger(r.baseRevision)||r.baseRevision<0||r.baseRevision>=r.revision))throw Error('大地图预览修订无效');
    const worker=await this.previewWorker();if(!worker)throw Error('请先构建编辑器后台');
    return worker.request('native-preview-update',{...r,build:this.build,previewOwner});
  }
  async nativeAssociations(p:NativeWorldProject){
    await this.unchanged();const worker=await this.previewWorker();if(!worker)throw Error('未连接原生关卡后台');
    return worker.request<import('../association').IndexedAssociation[]>('native-associations',{project:p,build:this.build});
  }
  async nativeRegion(r:NativeRegionRequest):Promise<NativeRegionResult>{await this.unchanged();const worker=await this.previewWorker();if(!worker)throw Error('请先构建编辑器后台');return worker.request('native-region',{...r,build:this.build});}
  async nativeDeploy(project:NativeWorldProject):Promise<string>{
    await this.nativeIndex(project);await this.assertStopped();await this.verifySourceHash();
    const worker=await this.previewWorker();if(!worker)throw Error('请先构建编辑器后台');
    this.onPlaytestProgress?.('构建完整世界的原生修改…');
    const result=await worker.request<{buffer:Uint8Array;changed:string[];resources?:{source:string;target:string}[]}>('native-build',{project,build:this.build});
    await this.prepare();const state=await this.readState();await this.restoreAux(state);
    const resources=await this.nativeAliases(project,result.resources??[]);state.aux=[...new Set([...state.aux,...resources.map(r=>r.target)])];
    const output=Buffer.from(result.buffer.buffer,result.buffer.byteOffset,result.buffer.byteLength);state.pendingHash=sha256(output);await atomicWrite(this.statePath(),JSON.stringify(state,null,2));
    for(const r of resources)try{await fs.copyFile(path.join(this.gamePath,r.source),path.join(this.testRoot,r.target));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    await atomicWrite(path.join(this.testRoot,'data/levels.package'),output);state.deployedHash=state.pendingHash;delete state.pendingHash;delete state.world;await atomicWrite(this.statePath(),JSON.stringify(state,null,2));
    return '已部署完整世界到试玩副本';
  }
  async nativeBuild(project:NativeWorldProject){await this.unchanged();await this.verifySourceHash();const worker=await this.previewWorker();if(!worker)throw Error('请先构建编辑器后台');validateNativeWorld(project);const result=project.version===5||Object.values(project.edits).some(ops=>ops.length)||Object.values(project.levelEdits).some(ops=>ops.length)?await worker.request<{buffer:Uint8Array;changed:string[]}>('native-build',{project,build:this.build}):{buffer:this.pkg.buffer,changed:[]},file=path.join(this.workspace,'exports','native-world-'+project.id+'-'+Date.now()+'.package');const buffer=Buffer.from(result.buffer.buffer,result.buffer.byteOffset,result.buffer.byteLength);await atomicWrite(file,buffer);await atomicWrite(path.join(path.dirname(file),path.basename(file,'.package')+'.sstar-native-world.json'),JSON.stringify(project,null,2));return{path:file,hash:sha256(buffer),changed:result.changed};}
  async worldCreate(){await this.unchanged();return newWorld(this.sourceHash,this.build);}
  async upgradeWorldEntries(w:WorldProject){if(w.native)return w;await this.checkWorld(w);if(!w.map.objects?.length||w.sourceEvidence?.history?.length)return w;return migrateEntrances(w,this.compiler!.previewMap(w),this.codec!);}
  private async exampleFile(name:string){await this.unchanged();if(!this.codec)throw Error('示例需要可解析的原游戏');const recipe=JSON.parse(await fs.readFile(path.join(path.dirname(this.workerFile),'../examples',name+'.recipe.json'),'utf8'));const w=materializeExample(recipe,this.pkg,this.codec,this.sourceHash,this.build);this.compiler!.build(w);return w;}
  async worldExample(){return this.exampleFile('3d-showcase');}
  async worldStudioExample(){return this.exampleFile('studio-v07');}
  async worldRecreations(){return this.exampleFile('native-replicas');}
  async worldPrefabs(){await this.unchanged();if(!this.codec)throw new Error('机关库需要反射信息');return prefabs(this.pkg,this.codec);}
  async worldValidate(w:WorldProject):Promise<WorldIssue[]>{if(w.native)return this.nativeValidate(nativeDocument(w));
    await this.checkWorld(w);const worker=await this.previewWorker();if(worker)return worker.request<WorldIssue[]>('validate',w);const issues=worldIssues(w);
    if(w.map.objects?.length||w.map.entries.length||w.map.camera)try{const f=this.compiler!.previewMap(w);for(const message of [...f.replayIssues??[],...validateReferences(this.codec!,f)])issues.push({severity:'error',entityId:Number(message.match(/#(\d+)/)?.[1])||undefined,message:'大地图：'+message});}catch(e){issues.push({severity:'error',message:'大地图：'+String(e)});}
    for(const l of w.levels){try{const f=compatiblePreview(l.project,p=>applyProject(this.pkg,p,this.codec));for(const message of f.replayIssues??[])issues.push({severity:'error',levelId:l.id,message:l.title+'：'+message});issues.push(...mechanismIssues(this.codec!,f).map(i=>({...i,levelId:l.id,message:l.title+'：'+i.message})));if(!f.records.some(r=>r.type==='Guy'))issues.push({severity:'error',levelId:l.id,message:`${l.title}：缺少主角`});if(l.project.base?.kind==='blank'&&!f.records.some(r=>r.type==='Door'))issues.push({severity:'error',levelId:l.id,message:`${l.title}：缺少出口`});for(const error of validateReferences(this.codec!,f))issues.push({severity:'error',levelId:l.id,entityId:Number(error.match(/#(\d+)/)?.[1])||undefined,message:`${l.title}：${error}`});}catch(e){issues.push({severity:'error',levelId:l.id,message:`${l.title}：${String(e)}`});}}
    return issues;
  }
  async worldBuild(w:WorldProject){await this.checkWorld(w);await this.verifySourceHash();const b=this.compiler!.build(w),output=this.pkg.rebuild(b.changes),name=`world-${w.id}-${Date.now()}`,out=path.join(this.workspace,'exports',name+'.package');await atomicWrite(out,output);await atomicWrite(path.join(this.workspace,'exports',name+'.sstar-world.json'),JSON.stringify(w,null,2));return{path:out,hash:sha256(output)};}
  async worldDeploy(w:WorldProject,quickEntry?:string){
    await this.checkWorld(w);await this.verifySourceHash();await this.assertStopped();this.onPlaytestProgress?.('准备或复用试玩副本…');await this.prepare();this.onPlaytestProgress?.('构建所选范围…');
    const built=this.compiler!.build(w,quickEntry),output=this.pkg.rebuild(built.changes),s=await this.readState();await this.restoreAux(s);
    const generated=new Map<string,Buffer>();const emptyPaint=Buffer.alloc(16);emptyPaint.write('allp');emptyPaint.writeUInt32LE(6,4);const emptyLight=Buffer.alloc(8);emptyLight.writeUInt32LE(3);
    for(const name of['overworld','intro']){generated.set(`data-common/${name}.all_paint_data`,emptyPaint);generated.set(`data-common/${name}.all_lightmap_data`,emptyLight);}
    const resources=[...built.resources];const pc=await fs.readdir(path.join(this.gamePath,'data-pc'));
    for(const l of w.levels){const target=built.levelNames[l.id],source=l.project.template;for(const name of pc)if(name.startsWith(source+'_')&&name.endsWith('.texture'))resources.push({source:`data-pc/${name}`,target:`data-pc/${target}${name.slice(source.length)}`});}
    s.aux=[...new Set([...s.aux,...generated.keys(),...resources.map(r=>r.target)])];s.pendingHash=sha256(output);await atomicWrite(this.statePath(),JSON.stringify(s,null,2));
    for(const r of resources)try{await fs.copyFile(path.join(this.gamePath,r.source),path.join(this.testRoot,r.target));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await fs.rm(path.join(this.testRoot,r.target),{force:true});}
    for(const[rel,data]of generated)await atomicWrite(path.join(this.testRoot,rel),data);
    await atomicWrite(path.join(this.testRoot,'data/levels.package'),output);s.deployedHash=sha256(output);delete s.pendingHash;s.world={id:w.id,revision:built.revision,quickEntry};await atomicWrite(this.statePath(),JSON.stringify(s,null,2));
    await atomicWrite(path.join(this.workspace,'projects',`${w.id}.last-deployed.sstar-world.json`),JSON.stringify(w,null,2));
    return `已整体部署 ${w.levels.length} 个小关卡和 ${w.map.entries.length} 个入口。所有入口可直接进入。`;
  }
  async worldLaunch(_w:WorldProject,_quickEntry?:string,_initialLevel?:string,_fresh=false):Promise<string>{return blockPlaytest();}
  onRegionProgress?:(job:string,phase:string)=>void;
  private regionJobs=new Map<string,Int32Array>();
  cancelRegionJob(job:string){const signal=this.regionJobs.get(job);if(signal)Atomics.store(signal,0,1);}
  private async regionJob<T>(job:string|undefined,execute:(signal:SharedArrayBuffer|undefined,progress:(phase:string)=>void)=>Promise<T>){
    if(job!==undefined&&(!/^[a-f0-9-]{36}$/.test(job)||this.regionJobs.has(job)))throw Error('区域任务编号无效');
    const signal=job?new Int32Array(new SharedArrayBuffer(4)):undefined;
    if(job&&signal)this.regionJobs.set(job,signal);
    try{
      const result=await execute(signal?.buffer as SharedArrayBuffer|undefined,phase=>{if(job&&!Atomics.load(signal!,0))this.onRegionProgress?.(job,phase);});
      if(signal&&Atomics.load(signal,0))throw Error('已取消区域操作');
      return result;
    }finally{if(job)this.regionJobs.delete(job);}
  }
  async worldRegionPaste(request:import('../shared').RegionPasteRequest,job?:string){
   return this.regionJob(job,async(signal,progress)=>{
    const {world,scene,bundle}=request;
    if(world.native){validateNativeWorld(nativeDocument(world));await this.unchanged();}
    else await this.checkWorld(world);
    if(world.sourceHash!==this.sourceHash||world.sourceBuild!==this.build||bundle.sourceHash!==this.sourceHash||bundle.sourceBuild!==this.build)throw Error('区域与目标工程的游戏来源不一致');
    if(scene!=='world'&&!world.levels.some(level=>level.id===scene))throw Error('目标关卡已不存在');
    const worker=await this.previewWorker();
    if(!worker)throw Error('区域粘贴需要后台预览进程');
    const updated=await worker.request<WorldProject>('world-region-paste',{...request,build:this.build,signal},progress);
    if(updated.native)validateNativeWorld(nativeDocument(updated));else validateWorld(updated);
    return updated;
   });
  }
  async worldRegionCapture(world:WorldProject,scene:string,selection:RegionSelection,job?:string){
   return this.regionJob(job,async(signal,progress)=>{
    if(world.native){validateNativeWorld(nativeDocument(world));await this.unchanged();}
    else await this.checkWorld(world);
    if(world.sourceHash!==this.sourceHash||world.sourceBuild!==this.build)throw Error('区域来源与当前游戏版本不一致');
    if(scene!=='world'&&!world.levels.some(level=>level.id===scene))throw Error('源关卡已不存在');
    const worker=await this.previewWorker();
    if(!worker)throw Error('区域复制需要后台预览进程');
    return worker.request<RegionBundle>('world-region-capture',{world,scene,selection,build:this.build,signal},progress);
   });
  }
  async regionCapture(p:EditorProject,selection:RegionSelection){await this.checkProject(p);const worker=await this.previewWorker();if(worker)return worker.request<RegionBundle>('capture',{project:p,selection});return captureRegion(this.codec!,applyProject(this.pkg,p,this.codec),p,selection,projectSources(p));}
  async regionPreview(bundle:RegionBundle){validateBundle(bundle);if(bundle.sourceHash!==this.sourceHash||bundle.sourceBuild!==this.build)throw Error('组合与当前游戏版本不一致');const source=parseEntities(this.pkg.get('data-common/mirror_1.entities')),file={...source,records:[]};const p:EditorProject={format:'sinking-star-project',version:3,sourceHash:this.sourceHash,sourceBuild:this.build,template:'mirror_1',name:'region_preview',operations:[{kind:'stamp',id:900*0x100000+1,bundle:bundle.version===2?{...bundle,transfer:undefined,records:bundle.records.slice(0,200),terrain:bundle.terrain.slice(0,1024)}:bundle,position:[0,0,0],yaw:0}]};return levelView(this.pkg,'mirror_1',applyProject(this.pkg,p,this.codec,file),this.codec);}
  async runValidate(w:WorldProject,r:RunRequest){const scoped=scopedWorld(w,r);await this.checkWorld(scoped);const issues=await this.worldValidate(scoped);if(r.mode!=='world')for(const l of scoped.levels){const f=applyProject(this.pkg,l.project,this.codec);for(const e of f.records.filter(e=>e.type==='Door'))for(const field of ['target_level','switch_to_level_set']){const name=String(this.codec!.get(e,field,''));if(name&&!['intro','overworld'].includes(name)&&!scoped.levels.some(t=>[t.id,t.project.name,t.project.template,'ed_'+scoped.id+'_'+t.id].includes(name)))issues.push({severity:'error',levelId:l.id,entityId:e.id,message:l.title+'：出口依赖范围外关卡 '+name+'，请加入测试组或修改出口'});}}return issues;}
  async runPlan(w:WorldProject,r:RunRequest):Promise<PlaytestPlan>{
    await this.checkWorld(w);scopedWorld(w,r);
    const context:TestContext={projectId:w.id,sourceHash:w.sourceHash,scope:{mode:r.mode,levelIds:r.mode==='world'?[]:[...r.levelIds]},revision:testRevision(gameplayWorld(w))};
    return this.isolatedRunPlan(context);
  }
  private async checkNativeRun(p:NativeWorldProject,r:RunRequest){
    freshWorldRun(r);
    const index=await this.nativeIndex(p);
    if(!r||!['single','world'].includes(r.mode)||!Array.isArray(r.levelIds)||r.mode==='single'&&(r.levelIds.length!==1||r.levelIds[0]==='overworld'||!index.levels.includes(r.levelIds[0])))throw Error('请选择有效的原版世界试玩范围');
  }
  async nativeRunPlan(p:NativeWorldProject,r:RunRequest):Promise<PlaytestPlan>{
    await this.checkNativeRun(p,r);
    const context:TestContext={projectId:p.id,sourceHash:p.sourceHash,scope:{mode:r.mode,levelIds:r.mode==='world'?[]:[...r.levelIds]},revision:testRevision(p.version===5?{sourceHash:p.sourceHash,operations:p.operations,scenes:p.scenes?.map(l=>({id:l.id,project:gameplayProject(l.project)})).sort((a,b)=>a.id.localeCompare(b.id)),camera:p.camera,topology:p.topology}:{sourceHash:p.sourceHash,edits:p.edits,levelEdits:p.levelEdits})};
    return this.isolatedRunPlan(context);
  }
  private async isolatedRunPlan(context:TestContext):Promise<PlaytestPlan>{
    return {context,compatible:[],incompatible:[],supported:this.isolationReady,preparation:await this.preparationEstimate(),reason:this.isolationReady?'试玩前自动核对独立存档目录':isolationUnavailable};
  }
  private async startPlaytest(initialLevel:string,fresh=false,fromLibrary=false){
    this.onPlaytestProgress?.('准备独立试玩存档…');
    await this.assertStopped();
    const source=await fs.readFile(path.join(this.testRoot,SOURCE_EXE));
    if(sha256(source)!==this.exeHash)throw Error('试玩程序已变化，请重新准备试玩副本');
    const file=path.join(this.testRoot,RUNTIME_EXE);
    await managedPath(this.workspace,file);
    const save=await preparePlaytestSaves(this.workspace,this.sourceHash,initialLevel,{fresh,library:fromLibrary,verify:async bound=>{
      const program=patchSaveDirectory(source,bound.id);
      await atomicWrite(file,program.buffer);
      if(sha256(await fs.readFile(file))!==program.hash)throw Error('独立试玩程序校验失败');
      this.onPlaytestProgress?.('核对试玩副本的存档路径…');
      await this.assertStopped();
      await verifyRuntimeSavePath(file,this.testRoot,bound.alias,bound.saves);
    }});
    await this.assertStopped();
    this.onPlaytestProgress?.('启动独立试玩…');
    const child=spawn(file,[],{cwd:this.testRoot,stdio:'ignore',detached:true,windowsHide:false});
    await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.once('exit',()=>{void this.exclusive(async()=>{
      await this.assertStopped();
      await save.profiles.captureIndependentSettings();
    }).catch(()=>{});});
    child.unref();
    return fromLibrary?'已启动独立试玩，从关卡初始状态开始。':fresh?'已在独立存档中从头试玩整个工程。':'已启动独立试玩。';
  }
  async runLaunch(w:WorldProject,r:RunRequest,_legacyChoice?:PlaytestChoice,entryLevel?:string){
    const fresh=freshWorldRun(r);
    if(!this.isolationReady)throw Error(isolationUnavailable);
    this.onPlaytestProgress?.('检查试玩范围与原生依赖…');
    await this.assertStopped();
    const issues=await this.runValidate(w,r),errors=issues.filter(i=>i.severity==='error');
    if(errors.length)throw Error(errors.map(i=>i.message).join('；'));
    const scoped=scopedWorld(w,r);
    if(entryLevel&&!scoped.levels.some(level=>level.id===entryLevel))throw Error('试玩关卡不在所选范围内');
    await this.worldDeploy(scoped);
    const initial=entryLevel??(r.mode==='single'?scoped.levels[0].id:undefined);
    return this.startPlaytest(initial?['ed',scoped.id,initial].join('_'):'overworld',fresh,Boolean(entryLevel));
  }
  async nativeRunLaunch(p:NativeWorldProject,r:RunRequest,_legacyChoice?:PlaytestChoice){
    if(!this.isolationReady)throw Error(isolationUnavailable);
    await this.assertStopped();
    await this.checkNativeRun(p,r);
    if(p.version===5){
      const errors=(await this.nativeValidate(p)).filter(i=>i.severity==='error'&&(r.mode==='world'||i.levelId===r.levelIds[0]));
      if(errors.length)throw Error(errors.map(i=>i.message).join('；'));
    }
    if(r.mode==='single'){
      const name=r.levelIds[0],w=newWorld(p.sourceHash,p.sourceBuild);w.id=p.id;
      w.levels=[{id:'native_scene',title:name,project:nativeScene(p,name)!}];
      const scoped=scopedWorld(w,{mode:'single',levelIds:['native_scene']});
      const errors=(await this.worldValidate(scoped)).filter(i=>i.severity==='error');
      if(errors.length)throw Error(errors.map(i=>i.message).join('；'));
      await this.worldDeploy(scoped);
      return this.startPlaytest('ed_'+scoped.id+'_native_scene');
    }
    await this.nativeDeploy(p);
    return this.startPlaytest('overworld',freshWorldRun(r));
  }

  async worldReset(_w:WorldProject):Promise<string>{return blockPlaytest();}
}
