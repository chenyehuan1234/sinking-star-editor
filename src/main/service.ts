import{inspectTestCopy,freshTestState,writeCopyMarker,promoteTestCopy,managedPath,type CopySource,type TestState}from'./playtest-copy';
export type{TestState}from'./playtest-copy';
import {PreviewWorker} from './preview-client';
import type {PreviewRequest,PreviewDelta} from '../preview-delta';
import {diffPreview} from '../preview-delta';
import{directoriesOverlap}from'./game-installation';
import{estimatePreparation}from'./disk-space';import{materializeExample}from'../core/examples';
import{sourceCamera,newCameraClone,cameraEditConfig}from'../core/camera-objects';import type{CameraObjectRequest,Vec3}from'../shared';
import{mechanismIssues}from'../core/mechanism-check';
import{scopedWorld}from'../core/runs';import{captureRegion,validateBundle}from'../core/regions';import{projectSources}from'../core/project';import type{RegionSelection,RegionBundle,RunRequest}from'../shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GamePackage, sha256 } from '../core/package';
import { applyProject, buildChanges, levelView, renameSettings, validateProject } from '../core/project';
import { writeEntities } from '../core/entities';
import type { Catalog, EditorProject } from '../shared';
import type{WorldProject,WorldIssue}from'../shared';
import{ExeReflection}from'../core/reflection';import{PropertyCodec}from'../core/properties';
import{WorldCompiler,newWorld,validateWorld,worldIssues}from'../core/world';
import{prefabs,validateReferences}from'../core/mechanisms';import{CampaignManager}from'./campaigns';
import {buildObjectCatalog} from '../core/object-catalog';
import type {ObjectCatalog} from '../catalog-types';
import {NativeAssets} from './assets';
import {Worker} from 'node:worker_threads';
import {createBlank} from '../core/blank';
import {parseEntities} from '../core/entities';
import {placeNative} from '../core/placement';
import {migrateEntrances} from '../core/entries';
import {nativeRegions} from '../core/native-regions';

const exec=promisify(execFile);
export async function atomicWrite(file:string,data:Buffer|string):Promise<void>{
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=file+`.${process.pid}.${Date.now()}.tmp`;
  try{await fs.writeFile(temp,data,{flag:'wx'});await fs.rename(temp,file);}catch(e){await fs.rm(temp,{force:true});throw e;}
}

export class EditorService {
  gamePath='';pkg!:GamePackage;sourceHash='';private exeHash='';build='unknown';private stamp='';private busy=false;
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
    try{await this.assertStopped();await this.campaigns.deactivate();}catch(e){if(!String(e).includes('请先退出沉星之序'))throw e;}
    // A failed new connection must leave the previously usable installation intact.
    await this.previews?.dispose();this.previews=undefined;await this.assets?.dispose();this.objects=undefined;this.pkg=pkg;this.sourceHash=sourceHash;this.exeHash=sha256(exe);this.gamePath=root;this.stamp=`${st.size}:${st.mtimeMs}`;this.codec=codec;this.assetFiles=assetFiles;this.build=build;
    this.assets=codec?new NativeAssets(root,this.workspace,sourceHash+codec.reflection.hash,assetFiles,materials!,this.workerFile):undefined;
    this.compiler=codec?new WorldCompiler(pkg,codec):undefined;
    let runtimeVerified=false;try{const e=JSON.parse(await fs.readFile(path.join(this.workspace,'playtest-evidence.json'),'utf8'));runtimeVerified=e.runtimeVerified===true&&e.sourceHash===this.sourceHash;}catch{}
    return {gamePath:root,sourceHash:this.sourceHash,build:this.build,workspace:this.workspace,compatibility:((this.sourceHash==='d747e5d9b8f540c9c6b90e8e987bd74a8c7f8f2f0672fce189403128f1f3117c'&&this.codec?.reflection.hash==='d802098b7cb85eadfc733b88d1554042fad950c572e916febea3f669a474a549')||(this.sourceHash==='408aba3676925faea0c823f8c231e30844feffe9c32ae42644d273ef31863589'&&this.codec?.reflection.hash==='0ae10a513dae25286fe93d0db4fa8a2df9a473bc07e1734e12bc1ad30166db1c'))?'数据回归版本；游戏内运行仍需实测':'当前版本未经回归；已通过结构解析，试玩需实测',levels:pkg.entries.filter(e=>e.name.endsWith('.entities')).map(e=>path.basename(e.name,'.entities')),regions,runtimeVerified};
  }
  async unchanged(){
    if(!this.pkg)throw new Error('请先连接游戏目录');
    const st=await fs.stat(path.join(this.gamePath,'data/levels.package'));
    if(`${st.size}:${st.mtimeMs}`!==this.stamp)throw new Error('游戏源包发生变化，请重新连接并核对兼容性');
  }
  async checkProject(p:EditorProject){validateProject(p);await this.unchanged();if(p.sourceHash!==this.sourceHash||p.sourceBuild!==this.build)throw new Error(`工程版本不匹配：来源 ${p.sourceBuild} / ${p.sourceHash.slice(0,8)}，当前 ${this.build} / ${this.sourceHash.slice(0,8)}。原工程保持不变，请连接原版本游戏；本版不自动迁移原生数据。`);}
  async verifySourceHash(){await this.unchanged();if(sha256(await fs.readFile(path.join(this.gamePath,'data/levels.package')))!==this.sourceHash)throw new Error('游戏源包哈希发生变化，操作已停止');}
  async openLevel(name:string){await this.unchanged();return levelView(this.pkg,name,undefined,this.codec);}
  async preview(p:EditorProject){await this.checkProject(p);const worker=await this.previewWorker();return worker?worker.request<import('../shared').LevelView>('preview',p):levelView(this.pkg,p.template,applyProject(this.pkg,p,this.codec),this.codec);}
  async previewUpdate(r:PreviewRequest):Promise<PreviewDelta>{if(typeof r.scene!=='string'||r.scene.length>200||!Number.isSafeInteger(r.revision)||r.revision<0||Boolean(r.project)===Boolean(r.world))throw Error('预览请求无效');if(r.project)await this.checkProject(r.project);else await this.checkWorld(r.world!);const worker=await this.previewWorker();if(worker)return worker.request('update',r);return diffPreview(null,r.project?await this.preview(r.project):await this.worldPreview(r.world!),r);}
  async cameraObject(p:EditorProject,request:CameraObjectRequest){await this.checkProject(p);const c=this.codec;if(!c)throw Error('相机编辑需要原生类型信息');const file=applyProject(this.pkg,p,c);let edit;
   if(request.action==='delete')edit={kind:'delete' as const,ids:[request.id]};
   else if(request.action==='clone')edit=newCameraClone(c,file,file,request.id,request.offset);
   else if(request.action==='create'){if(!['play','overview','height-lock','limiter','overview-region'].includes(request.kind))throw Error('原生区域类别无效');const source=sourceCamera(c,this.pkg,request.kind),origin=['x','y','z'].map(a=>Number(c.get(source.root,'position.'+a))),offset=request.position.map((n,i)=>n-origin[i])as Vec3;edit=newCameraClone(c,file,source.file,source.root.id,offset,source.template);}
   else throw Error('未知相机操作');const config=cameraEditConfig(p.camera,edit);if(request.action==='delete')config.controls=config.controls?.filter(v=>v.id!==request.id);applyProject(this.pkg,{...p,camera:config},c);return config;
  }
  async levelCreateBlank(width=16,height=16){await this.unchanged();return createBlank(this.sourceHash,this.build,width,height);}
  async presetPreview(key:string){const catalog=await this.objectCatalog(),p=catalog.presets.find(p=>p.key===key&&p.parsed);if(!p)throw new Error('预设不存在');const source=parseEntities(this.pkg.get(`data-common/${p.template}.entities`));const file={prefix:source.prefix,types:source.types,records:[]};placeNative(this.pkg,this.codec!,file,{kind:'prefab',id:900*0x100000+1,template:p.template,sourceId:p.sourceId,position:[0,0,0],assembly:p.placement==='assembly'});return levelView(this.pkg,p.template,file,this.codec);}
  private thumbnailPath(key:string){if(typeof key!=='string'||!/^[a-f0-9]{16,128}$/.test(key))throw new Error('缩略图标识无效');return path.join(this.workspace,'cache','thumbnails-v04',this.sourceHash,key+'.png');}
  async thumbnailRead(key:string){try{return'data:image/png;base64,'+(await fs.readFile(this.thumbnailPath(key))).toString('base64');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
  async thumbnailWrite(key:string,png:string){const file=this.thumbnailPath(key);if(typeof png!=='string'||!png.startsWith('data:image/png;base64,')||png.length>2_000_000)throw new Error('缩略图数据无效');const data=Buffer.from(png.slice(22),'base64');if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('缩略图必须是 PNG');await atomicWrite(file,data);}
  async objectCatalog():Promise<ObjectCatalog>{
    await this.unchanged();if(!this.codec)throw new Error('对象目录需要游戏类型信息');
    return this.objects??=(async()=>{const file=path.join(this.workspace,'cache',`catalog-${this.sourceHash}-${this.codec!.reflection.hash}.json`);try{const c=JSON.parse(await fs.readFile(file,'utf8'))as ObjectCatalog;if(c.version===1&&c.schemaRevision===2&&c.sourceHash===this.sourceHash&&c.exeHash===this.codec!.reflection.hash)return c;}catch{}
      const c=await new Promise<ObjectCatalog>((resolve,reject)=>{const worker=new Worker(path.join(path.dirname(this.workerFile),'catalog-worker.cjs'));worker.once('message',m=>{void worker.terminate();m.error?reject(new Error(m.error)):resolve(m.value);});worker.once('error',reject);worker.once('exit',code=>{if(code!==0&&code!==1)reject(new Error('对象扫描线程异常退出'));});worker.postMessage({root:this.gamePath,build:this.build});});
      await atomicWrite(file,JSON.stringify(c));return c;})();
  }
  async worldPreview(w:WorldProject){await this.checkWorld(w);const worker=await this.previewWorker();if(worker)return worker.request<import('../shared').LevelView>('worldPreview',w);if(!w.map.tiles.some(Boolean)&&!w.map.objects?.length&&!w.map.entries.length)return{name:'overworld',entities:[],typeCount:88,manifest:'',terrain:[]};return levelView(this.pkg,'overworld',this.compiler!.previewMap(w),this.codec);}
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
    const result=await exec('tasklist',['/FI','IMAGENAME eq sinking_star.exe','/FO','CSV','/NH'],{windowsHide:true});
    if(/"sinking_star\.exe"/i.test(result.stdout))throw new Error('请先退出沉星之序，再修改测试副本');
  }
  private statePath(){return path.join(this.workspace,'playtest-state.json');}
  private copySource():CopySource{return{workspace:this.workspace,gamePath:this.gamePath,testRoot:this.testRoot,sourceHash:this.sourceHash,sourceBuild:this.build,exeHash:this.exeHash};}
  private async readState():Promise<TestState>{
    const copy=await inspectTestCopy(this.copySource());if(!copy.prepared||!copy.state)throw Error(copy.requiresRefresh?'试玩副本属于旧游戏版本，请重新准备试玩':'请先准备试玩副本');const s=copy.state;
    if(s.pendingHash){const actual=sha256(await fs.readFile(path.join(this.testRoot,'data/levels.package')));if(actual===s.pendingHash){s.deployedHash=actual;delete s.pendingHash;await atomicWrite(this.statePath(),JSON.stringify(s,null,2));}}
    if(copy.recoverState)await atomicWrite(this.statePath(),JSON.stringify(s,null,2));return s;
  }
  async preparationEstimate():Promise<import('../shared').PreparationEstimate>{await this.unchanged();const copy=await inspectTestCopy(this.copySource());return{...await estimatePreparation(this.gamePath,this.workspace,copy.prepared),requiresRefresh:copy.requiresRefresh};}
  async prepare(){
    await this.unchanged();await this.assertStopped();const source=this.copySource(),copy=await inspectTestCopy(source);
    if(copy.prepared){if(copy.recoverState)await atomicWrite(this.statePath(),JSON.stringify(copy.state,null,2));return this.testRoot;}
    const estimate=await this.preparationEstimate();if(!estimate.canPrepare)throw Error(`工作区磁盘空间不足：需约 ${(estimate.requiredBytes/2**30).toFixed(1)} GB，可用 ${(estimate.availableBytes/2**30).toFixed(1)} GB。请在工程菜单更换工作区并重启。`);
    const building=path.join(this.workspace,`preparing-${Date.now()}-${process.pid}`);await managedPath(this.workspace,building);
    await fs.cp(this.gamePath,building,{recursive:true,filter:s=>!s.split(path.sep).includes('logs'),force:false,errorOnExist:true});
    if(sha256(await fs.readFile(path.join(building,'data/levels.package')))!==this.sourceHash||sha256(await fs.readFile(path.join(building,'sinking_star.exe')))!==this.exeHash)throw Error('复制期间游戏源文件已变化，请重新连接');
    await this.verifySourceHash();await this.assertStopped();
    const backup=path.join(this.workspace,'backups',this.sourceHash+'.package');await managedPath(this.workspace,backup);await fs.mkdir(path.dirname(backup),{recursive:true});
    try{await fs.writeFile(backup,this.pkg.buffer,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
    if(sha256(await fs.readFile(backup))!==this.sourceHash)throw Error('备份包损坏');
    const state=freshTestState(source);await fs.writeFile(path.join(building,'steam_appid.txt'),'499170');await writeCopyMarker(building,state,copy.state);
    // Recheck the registered package before moving anything, after the potentially long copy.
    const final=await inspectTestCopy(source);if(final.prepared)throw Error('试玩副本已由另一项操作更新，请重试');
    await promoteTestCopy(source,building,final);await atomicWrite(this.statePath(),JSON.stringify(state,null,2));return this.testRoot;
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
  async launch(){
    await this.unchanged();await this.assertStopped();await this.readState();
    const saves=path.join(os.homedir(),'Saved Games','Order of the Sinking Star'),snapshot=path.join(this.workspace,'backups',`saves-${Date.now()}`);
    try{await fs.cp(saves,snapshot,{recursive:true,errorOnExist:true,force:false});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    await atomicWrite(path.join(snapshot,'_editor-snapshot.json'),JSON.stringify({createdAt:new Date().toISOString(),source:saves,reason:'before-playtest'},null,2));
    const child=spawn(path.join(this.testRoot,'sinking_star.exe'),['-windowed','-size','1280','720'],{cwd:this.testRoot,stdio:'ignore',detached:true,windowsHide:false});
    await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
    return `试玩已启动。存档快照：${snapshot}。请新建测试战役；工具不会自动覆盖后续存档。`;
  }
  async checkWorld(w:WorldProject){validateWorld(w);await this.unchanged();if(w.sourceHash!==this.sourceHash||w.sourceBuild!==this.build)throw new Error(`工程版本不匹配：来源 ${w.sourceBuild} / ${w.sourceHash.slice(0,8)}，当前 ${this.build} / ${this.sourceHash.slice(0,8)}。原工程保持不变，请连接原版本游戏；本版不自动迁移原生数据。`);if(!this.compiler||!this.codec)throw new Error('当前游戏缺少已验证的类型信息');}
  async worldCreate(){await this.unchanged();return newWorld(this.sourceHash,this.build);}
  async upgradeWorldEntries(w:WorldProject){await this.checkWorld(w);return w.map.objects?.length?migrateEntrances(w,this.compiler!.previewMap(w),this.codec!):w;}
  private async exampleFile(name:string){await this.unchanged();if(!this.codec)throw Error('示例需要可解析的原游戏');const recipe=JSON.parse(await fs.readFile(path.join(path.dirname(this.workerFile),'../examples',name+'.recipe.json'),'utf8'));const w=materializeExample(recipe,this.pkg,this.codec,this.sourceHash,this.build);this.compiler!.build(w);return w;}
  async worldExample(){return this.exampleFile('3d-showcase');}
  async worldStudioExample(){return this.exampleFile('studio-v07');}
  async worldRecreations(){return this.exampleFile('native-replicas');}
  async worldPrefabs(){await this.unchanged();if(!this.codec)throw new Error('机关库需要反射信息');return prefabs(this.pkg,this.codec);}
  async worldValidate(w:WorldProject):Promise<WorldIssue[]>{
    await this.checkWorld(w);const worker=await this.previewWorker();if(worker)return worker.request<WorldIssue[]>('validate',w);const issues=worldIssues(w);
    if(w.map.objects?.length)try{const f=this.compiler!.previewMap(w);for(const message of validateReferences(this.codec!,f))issues.push({severity:'error',message:'大地图：'+message});}catch(e){issues.push({severity:'error',message:'大地图：'+String(e)});}
    for(const l of w.levels){try{const f=applyProject(this.pkg,l.project,this.codec);issues.push(...mechanismIssues(this.codec!,f).map(i=>({...i,levelId:l.id,message:l.title+'：'+i.message})));if(!f.records.some(r=>r.type==='Guy'))issues.push({severity:'error',levelId:l.id,message:`${l.title}：缺少主角`});if(l.project.base?.kind==='blank'&&!f.records.some(r=>r.type==='Door'))issues.push({severity:'error',levelId:l.id,message:`${l.title}：缺少出口`});for(const error of validateReferences(this.codec!,f))issues.push({severity:'error',levelId:l.id,entityId:Number(error.match(/#(\d+)/)?.[1])||undefined,message:`${l.title}：${error}`});}catch(e){issues.push({severity:'error',levelId:l.id,message:`${l.title}：${String(e)}`});}}
    return issues;
  }
  async worldBuild(w:WorldProject){await this.checkWorld(w);await this.verifySourceHash();const b=this.compiler!.build(w),output=this.pkg.rebuild(b.changes),name=`world-${w.id}-${Date.now()}`,out=path.join(this.workspace,'exports',name+'.package');await atomicWrite(out,output);await atomicWrite(path.join(this.workspace,'exports',name+'.sstar-world.json'),JSON.stringify(w,null,2));return{path:out,hash:sha256(output)};}
  async worldDeploy(w:WorldProject,quickEntry?:string){
    await this.checkWorld(w);await this.verifySourceHash();await this.assertStopped();await this.prepare();await this.campaigns.deactivate();
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
  async worldLaunch(w:WorldProject,quickEntry?:string,initialLevel?:string,fresh=false){
    await this.assertStopped();await this.worldDeploy(w,quickEntry);
    const snapshot=path.join(this.workspace,'backups',`saves-${Date.now()}`);try{await fs.cp(this.campaigns.saves,snapshot,{recursive:true});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    if(fresh)await this.campaigns.reset(w.id,this.sourceHash);
    const dir=await this.campaigns.activate(w.id,this.sourceHash,initialLevel);
    try{
      const child=spawn(path.join(this.testRoot,'sinking_star.exe'),['-windowed','-size','1280','720'],{cwd:this.testRoot,stdio:'ignore',detached:true,windowsHide:false});
      await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
      child.once('exit',()=>{void this.campaigns.deactivate().catch(async e=>{await atomicWrite(path.join(this.workspace,'campaign-recovery-error.txt'),String(e));});});child.unref();
    }catch(e){await this.campaigns.deactivate();throw e;}
    return `已启动专用测试战役 ${path.basename(dir)}。直接在大地图选择入口，退出游戏后保留关卡完成状态。`;
  }
  async regionCapture(p:EditorProject,selection:RegionSelection){await this.checkProject(p);return captureRegion(this.codec!,applyProject(this.pkg,p,this.codec),p,selection,projectSources(p));}
  async regionPreview(bundle:RegionBundle){validateBundle(bundle);if(bundle.sourceHash!==this.sourceHash||bundle.sourceBuild!==this.build)throw Error('组合与当前游戏版本不一致');const source=parseEntities(this.pkg.get('data-common/mirror_1.entities')),file={...source,records:[]};const p:EditorProject={format:'sinking-star-project',version:3,sourceHash:this.sourceHash,sourceBuild:this.build,template:'mirror_1',name:'region_preview',operations:[{kind:'stamp',id:900*0x100000+1,bundle,position:[0,0,0],yaw:0}]};return levelView(this.pkg,'mirror_1',applyProject(this.pkg,p,this.codec,file),this.codec);}
  async runValidate(w:WorldProject,r:RunRequest){const scoped=scopedWorld(w,r);await this.checkWorld(scoped);const issues=await this.worldValidate(scoped);if(r.mode!=='world')for(const l of scoped.levels){const f=applyProject(this.pkg,l.project,this.codec);for(const e of f.records.filter(e=>e.type==='Door'))for(const field of ['target_level','switch_to_level_set']){const name=String(this.codec!.get(e,field,''));if(name&&!['intro','overworld'].includes(name)&&!scoped.levels.some(t=>[t.id,t.project.name,t.project.template,'ed_'+scoped.id+'_'+t.id].includes(name)))issues.push({severity:'error',levelId:l.id,entityId:e.id,message:l.title+'：出口依赖范围外关卡 '+name+'，请加入测试组或修改出口'});}}return issues;}
  async runLaunch(w:WorldProject,r:RunRequest){const issues=await this.runValidate(w,r);if(issues.some(i=>i.severity==='error'))throw Error(issues.filter(i=>i.severity==='error').map(i=>i.message).join('；'));const scoped=scopedWorld(w,r);if(r.mode!=='world')for(const l of scoped.levels){const f=applyProject(this.pkg,l.project,this.codec);for(const e of f.records.filter(e=>e.type==='Door')){const values:Record<string,string>={};for(const field of ['target_level','switch_to_level_set']){const name=String(this.codec!.get(e,field,'')),target=scoped.levels.find(t=>[t.id,t.project.name,t.project.template].includes(name));if(target)values[field]='ed_'+scoped.id+'_'+target.id;}if(Object.keys(values).length)l.project.operations.push({kind:'properties',id:e.id,values});}}await this.worldLaunch(scoped,undefined,r.mode==='single'?'ed_'+scoped.id+'_'+scoped.levels[0].id:undefined,r.mode!=='world');return r.mode==='single'?'已直接进入当前关卡。通关或返回主世界后进入本关测试返回区。':r.mode==='subset'?'已启动临时关卡组，仅包含 '+scoped.levels.length+' 关；在测试地图自由选择入口。':'已启动完整工程专用测试战役。';}
  async worldReset(w:WorldProject){await this.checkWorld(w);await this.assertStopped();await this.campaigns.deactivate();const archive=await this.campaigns.reset(w.id,this.sourceHash);return `本工程测试进度已重置，旧数据保留在 ${archive}`;}
}
