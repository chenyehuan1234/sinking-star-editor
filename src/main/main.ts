import {nativeRegions} from '../core/native-regions';
import {nativeWorkbench,nativeDocument} from '../native-project';
import {exportDocument} from '../core/export-scope';
import type {ExportRequest} from '../export-types';
import {StorageManager} from './storage';
import {TestProfiles} from './test-profiles';
import {validateNativeWorld} from '../core/native-world';
import type {NativeWorldProject} from '../v08-types';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import{Updates}from'./updates';
import {assertPlaytestCommand} from '../playtest-policy';
import{QuickSlotStore}from'./quick-slot-store';
import{discoverInstallations,inspectInstallation,directoriesOverlap}from'./game-installation';
import{DesignStore}from'./design-store';import{validateBundle}from'../core/regions';
import {AsyncLocalStorage} from 'node:async_hooks';
import {ProjectWindows,type ProjectTab} from './project-windows';
import { app, ipcMain, dialog, shell, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { EditorService, atomicWrite } from './service';
import { validateProject } from '../core/project';
import type { Catalog,EditorProject,WorldProject } from '../shared';
import {upgradeProject,upgradeWorld} from '../core/migrate';

app.setName('沉星之序关卡编辑器');
// Separate local QA profile keeps running user sessions and preferences untouched.
if(process.env.SINKING_STAR_USER_DATA)app.setPath('userData',path.resolve(process.env.SINKING_STAR_USER_DATA));
const lock=app.requestSingleInstanceLock();if(!lock)app.quit();
let projectWindows:ProjectWindows;
if(lock)app.whenReady().then(async()=>{
  Menu.setApplicationMenu(null);
  const root=app.isPackaged?path.join(app.getPath('documents'),'SinkingStarEditor'):path.resolve(__dirname,'../..');
  const config=path.join(app.getPath('userData'),'game-path.json');
  let preferences:{gamePath?:string;workspace?:string}={};try{preferences=JSON.parse(await fs.readFile(config,'utf8'));}catch{}
  let service=new EditorService(process.env.SINKING_STAR_WORKSPACE??preferences.workspace??path.join(root,'workspace'),path.join(__dirname,'asset-worker.cjs'));
  let store=new DesignStore(service.workspace);const quickSlots=new QuickSlotStore(path.join(app.getPath('userData'),'quick-slots'));
  const persistPreferences=()=>atomicWrite(config,JSON.stringify(preferences));
  const migratedWorldPaths=new Map<string,string>();
  const adaptedPaths=new Map<string,string>();const projectPaths=new Map<string,string>(),lastProject=path.join(app.getPath('userData'),'last-project.json');
  const nativePaths=new Map<string,string>();
  const caller=new AsyncLocalStorage<ProjectTab>();
  const tab=()=>caller.getStore()!;
  const parent=()=>tab().owner.window;
  const pathKey=(id:string)=>tab().id+':'+id;
  projectWindows=new ProjectWindows(path.join(__dirname,'../renderer/index.html'),path.join(__dirname,'preload.cjs'),
    ()=>path.join(service.workspace,'projects'),closed=>{
      for(const entries of [projectPaths,nativePaths,migratedWorldPaths,adaptedPaths])
        for(const key of entries.keys())if(key.startsWith(closed.id+':'))entries.delete(key);
    });
  const rememberProject=async(w:WorldProject,file:string)=>{
    projectPaths.set(pathKey(w.id),file);
    projectWindows.recordFile(tab(),file);
    await atomicWrite(lastProject,JSON.stringify({file}));
  };
  const readWorldFile=async(file:string)=>{file=await projectWindows.fileAvailable(tab(),file);projectWindows.recordFile(tab(),file);const stat=await fs.stat(file);if(stat.size>64_000_000)throw new Error('工程文件超过 64 MB');const original=JSON.parse(await fs.readFile(file,'utf8'));if(original.format==='sinking-star-native-world'){const project=await service.adaptNativeWorld(original),index=await service.nativeIndex(project),w=nativeWorkbench(project,index,nativeRegions(service.pkg,service.codec!,await fs.readFile(path.join(service.gamePath,'data/strings/s-cn.localization'),'utf8')));if(project!==original){nativePaths.delete(pathKey(w.id));projectPaths.delete(pathKey(w.id));adaptedPaths.set(pathKey(w.id),path.resolve(file));}else if(project.version===5){nativePaths.set(pathKey(w.id),file);await rememberProject(w,file);}return w;}const w=await service.adaptWorld(original);await service.checkWorld(w);if(w===original){await rememberProject(w,file);if(w.version<4)migratedWorldPaths.set(pathKey(w.id),path.resolve(file));else migratedWorldPaths.delete(pathKey(w.id));}else{projectPaths.delete(pathKey(w.id));adaptedPaths.set(pathKey(w.id),path.resolve(file));}return service.upgradeWorldEntries(upgradeWorld(w));};
  const handle=(method:string,fn:(...args:any[])=>Promise<unknown>,exclusive=false)=>ipcMain.handle(`editor:${method}`,async(event,...args)=>{
    const source=projectWindows.editor(event.sender);
    if(!source||event.senderFrame!==event.sender.mainFrame)throw new Error('无效的编辑器来源');
    assertPlaytestCommand(method);
    return caller.run(source,()=>exclusive?service.exclusive(()=>fn(...args)):fn(...args));
  });
  const storage=()=>new StorageManager(service.workspace,app.isPackaged?(path.basename(path.dirname(app.getPath('exe')))==='win-unpacked'?path.dirname(path.dirname(path.dirname(app.getPath('exe')))):undefined):root,async()=>{if(process.platform!=='win32')return[process.execPath];const r=await promisify(execFile)('powershell.exe',['-NoProfile','-Command',"[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq '沉星之序关卡编辑器.exe' -or $_.Name -eq 'electron.exe' -or $_.Name -eq 'sinking_star.exe' -or $_.Name -eq 'SinkingStarPlaytest.exe') } | ForEach-Object { $_.ExecutablePath; if ($_.CommandLine -match '--app-path=\"([^\"]+)\"') { $Matches[1] } }) | ConvertTo-Json -Compress"],{windowsHide:true});const parsed=JSON.parse(r.stdout.trim()||'[]');return [...(Array.isArray(parsed)?parsed:[parsed]),process.execPath].filter((p):p is string=>typeof p==='string');},()=>[...projectPaths.values(),...nativePaths.values()]);
  let storageManager=storage();const profiles=()=>new TestProfiles(service.workspace);
  handle('exportDesign',async(r:ExportRequest)=>{if(!r||!['project','runtime'].includes(r.format))throw Error('导出类型无效');const document=exportDocument(r.project,r.scope);if(r.format==='project'){const suffix=document.format==='sinking-star-project'?'.sstar.json':document.format==='sinking-star-world'?'.sstar-world.json':'.sstar-native-world.json';const result=await dialog.showSaveDialog(parent(),{title:'导出可编辑工程',defaultPath:(document.name||'design').replace(/[<>:"/\\|?*]/g,'_')+suffix,filters:[{name:'编辑工程',extensions:['json']}]});if(result.canceled||!result.filePath)return null;return service.exportDesign(r,await projectWindows.fileAvailable(tab(),result.filePath));}const result=await dialog.showOpenDialog(parent(),{title:'选择原生运行包的目标目录',properties:['openDirectory','createDirectory']});if(result.canceled)return null;return service.exportDesign(r,result.filePaths[0]);},true);
  handle('storageScan',async()=>{storageManager=storage();return storageManager.inspect();});
  handle('storageClean',async(token,ids)=>{await service.assertStopped();return storageManager.clean(token,ids);},true);
  handle('playPreferences',()=>profiles().preferences());handle('playPreferencesSave',p=>profiles().setPreferences(p),true);
  handle('testLegacyProfiles',()=>profiles().legacy(service.campaigns.saves));handle('testProfileImport',id=>profiles().importLegacy(service.campaigns.saves,id),true);
  handle('testProfiles',()=>profiles().list());handle('testProfileSelect',c=>profiles().select(c));handle('testProfileCreate',(c,n)=>profiles().create(c,n),true);
  handle('testProfileChange',async(id,action,name)=>{await service.assertStopped();return profiles().change(id,action,name);},true);
  handle('nativeImpact',(p,n)=>service.nativeImpact(p,n));
  handle('nativeValidate',p=>service.nativeValidate(p));
  handle('nativeSearch',(p,q)=>service.nativeSearch(p,q));
  handle('nativeIndex',p=>service.nativeIndex(p));handle('nativeAssociations',p=>service.nativeAssociations(p));handle('nativeRegion',r=>service.nativeRegion(r));handle('nativePreviewUpdate',r=>service.nativePreviewUpdate(r,tab().id));handle('nativeBuild',p=>service.nativeBuild(p),true);handle('nativeDeploy',p=>service.nativeDeploy(p),true);
  const nativeProject=async():Promise<NativeWorldProject>=>{await service.unchanged();return{format:'sinking-star-native-world',version:4,id:randomUUID().replaceAll('-','').slice(0,12),name:'原版三层世界',sourceHash:service.sourceHash,sourceBuild:service.build,base:'overworld',edits:{},levelEdits:{},assignments:[]};};
  handle('nativeCreate',nativeProject);
  handle('nativeSave',async(p:NativeWorldProject,saveAs=false)=>{validateNativeWorld(p);let file=saveAs?undefined:nativePaths.get(pathKey(p.id));if(file){try{const previous=JSON.parse(await fs.readFile(file,'utf8'));if(previous.version===4&&p.version===5)file=undefined;}catch{}}if(!file){const r=await dialog.showSaveDialog(parent(),{defaultPath:path.join(service.workspace,'projects',p.id+(p.version===5?'.v5':'')+'.sstar-native-world.json'),filters:[{name:'原版世界 v4／v5',extensions:['json']}]});if(r.canceled||!r.filePath)return null;file=r.filePath;}file=await projectWindows.fileAvailable(tab(),file);if(adaptedPaths.get(pathKey(p.id))?.toLowerCase()===path.resolve(file).toLowerCase())throw Error('请使用新文件名另存此工程');try{const old=JSON.parse(await fs.readFile(file,'utf8'));if(old.version===4&&p.version===5)throw Error('升级工程请选择新的 v5 文件名，保留原版 v4 文件');await fs.copyFile(file,file+'.previous.bak');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}await atomicWrite(file,JSON.stringify(p,null,2));nativePaths.set(pathKey(p.id),file);if(p.version===5)await rememberProject(nativeWorkbench(p,await service.nativeIndex(p)),file);return file;},true);
  handle('nativeLoad',async()=>{const r=await dialog.showOpenDialog(parent(),{defaultPath:path.join(service.workspace,'projects'),filters:[{name:'原版世界 v4／v5',extensions:['json']}],properties:['openFile']});if(r.canceled)return null;const file=await projectWindows.fileAvailable(tab(),r.filePaths[0]);if((await fs.stat(file)).size>20_000_000)throw Error('工程超过20MB');const original=JSON.parse(await fs.readFile(file,'utf8')),p=await service.adaptNativeWorld(original);await service.nativeIndex(p);if(p===original)nativePaths.set(pathKey(p.id),file);else{nativePaths.delete(pathKey(p.id));adaptedPaths.set(pathKey(p.id),path.resolve(file));}projectWindows.recordFile(tab(),file);return p;},true);
  const updates=new Updates();handle('updateCheck',()=>updates.check());handle('updateDownload',()=>updates.fetch());handle('updateInstall',async()=>{if(projectWindows.hasDirtyProjects)throw Error('请先保存所有打开的工程');return updates.install(parent());});
  let connection:Promise<Catalog>|undefined,connectionKey='';
  const connectGame=async(selected?:string):Promise<Catalog>=>{const location=selected??preferences.gamePath;if(!location)throw Error('请先选择原游戏目录');const key=path.resolve(location).toLowerCase();if(connection&&connectionKey===key)return connection;if(connection&&projectWindows.size>1)throw Error('请先关闭其他工程标签，再切换游戏目录');
   const pending=service.exclusive(async()=>{const inspected=await inspectInstallation(location);if(!inspected.directoryValid)throw Error(inspected.reason);service.onPlaytestProgress=(text,progress)=>{const target=caller.getStore();if(target&&!target.view.webContents.isDestroyed())target.view.webContents.send('editor:playtest-progress',text,progress);else projectWindows.broadcast('editor:playtest-progress',text,progress);};const catalog=await service.connect(inspected.path);service.onRegionProgress=(job,phase)=>projectWindows.broadcast('editor:region-progress',job,phase);if(!service.codec)throw Error('无法读取原游戏类型信息，请选择完整的 Steam 版安装目录');preferences.gamePath=inspected.path;await persistPreferences();return catalog;});connection=pending;connectionKey=key;
   try{return await pending;}catch(e){if(connection===pending){connection=undefined;connectionKey='';}throw e;}
  };
  handle('discoverGames',()=>discoverInstallations(preferences.gamePath,service.workspace,Boolean(process.env.SINKING_STAR_WORKSPACE)).then(v=>({...v,pendingWorkspace:preferences.workspace&&preferences.workspace!==service.workspace?preferences.workspace:undefined})));
  handle('connect',connectGame);
  handle('chooseGame',async()=>{if(projectWindows.size>1)throw Error('请先关闭其他工程标签，再切换游戏目录');const r=await dialog.showOpenDialog(parent(),{title:'选择包含 sinking_star.exe 的原游戏文件夹',properties:['openDirectory']});if(r.canceled)return null;const catalog=await connectGame(r.filePaths[0]);projectWindows.recordFile(tab());return catalog;});
  handle('chooseWorkspace',async()=>{if(process.env.SINKING_STAR_WORKSPACE)throw Error('启动参数已指定工作区，请修改启动参数后重启');const r=await dialog.showOpenDialog(parent(),{title:'选择编辑器工作区（不会搬迁原有工程）',defaultPath:service.workspace,properties:['openDirectory','createDirectory']});if(r.canceled)return null;const chosen=await fs.realpath(r.filePaths[0]);if(directoriesOverlap(chosen,await fs.realpath(service.campaigns.saves).catch(()=>service.campaigns.saves)))throw Error('工作区不能包含正式存档目录，也不能位于正式存档目录内');if(service.gamePath){if(directoriesOverlap(service.gamePath,chosen))throw Error('工作区不能放在游戏目录内，也不能包含游戏目录');}await fs.access(chosen,fs.constants.W_OK);preferences.workspace=chosen;await persistPreferences();const pendingRestart=Boolean(service.gamePath);if(!pendingRestart){service=new EditorService(chosen,path.join(__dirname,'asset-worker.cjs'));store=new DesignStore(chosen);}return{path:chosen,pendingRestart};},true);
  handle('quickSlotsRead',async()=>{if(!service.codec)throw Error('请先连接原游戏');return quickSlots.read(service.sourceHash,service.build,service.codec);});
  handle('quickSlotsWrite',async value=>{if(!service.codec)throw Error('请先连接原游戏');return quickSlots.write(value,service.sourceHash,service.build,service.codec);});
  handle('preparationEstimate',()=>service.preparationEstimate());
  handle('cameraObject',(p,r)=>service.cameraObject(p,r));handle('viewGiverLink',(p,r)=>service.viewGiverLink(p,r));
  handle('previewUpdate',r=>service.previewUpdate(r,tab().id));handle('openLevel',n=>service.openLevel(n));handle('preview',p=>service.preview(p));
  handle('objectCatalog',()=>service.objectCatalog());handle('worldPreview',w=>service.worldPreview(w));
  handle('levelCreateBlank',(w,h)=>service.levelCreateBlank(w,h));handle('presetPreview',k=>service.presetPreview(k));handle('thumbnailRead',k=>service.thumbnailRead(k));handle('thumbnailWrite',(k,p)=>service.thumbnailWrite(k,p));
  handle('worldExample',()=>service.worldExample());
  handle('worldStudioExample',()=>service.worldStudioExample());
  handle('worldRecreations',()=>service.worldRecreations());
  handle('profileAsset',request=>service.assets!.profile(request));
  handle('savePerformanceReport',async(json:string)=>{
    if(typeof json!=='string'||json.length>4_000_000)throw Error('性能报告大小无效');
    const result=await dialog.showSaveDialog(parent(),{title:'导出性能报告',defaultPath:'sinking-star-performance.json',filters:[{name:'JSON',extensions:['json']}]});
    if(result.canceled||!result.filePath)return false;
    await atomicWrite(result.filePath,json);
    return true;
  });
  handle('meshAsset',(n,l)=>service.assets!.mesh(n,l));handle('textureAsset',(n,s)=>service.assets!.texture(n,s));handle('materialAsset',async n=>service.assets!.material(n));handle('assetStatus',async()=>service.assets!.status);
  service.onRegionProgress=(job,phase)=>projectWindows.broadcast('editor:region-progress',job,phase);
  handle('cancelRegionJob',async job=>service.cancelRegionJob(job));
  handle('worldRegionPaste',(request,job)=>service.worldRegionPaste(request,job));
  handle('worldRegionCapture',(w,scene,selection,job)=>service.worldRegionCapture(w,scene,selection,job));
  handle('regionClipboard',async b=>{
    const result=await store.clipboard(b);
    if(b)projectWindows.clipboardChanged(tab());
    return result;
  });
  handle('regionCapture',(p,selection)=>service.regionCapture(p,selection));handle('regionPreview',b=>service.regionPreview(b));
  handle('assemblyList',()=>store.assemblies());handle('assemblySave',async b=>{await service.regionPreview(b);return store.saveAssembly(b);},true);handle('assemblyRemove',id=>store.removeAssembly(id),true);
  handle('assemblyImport',async()=>{const r=await dialog.showOpenDialog(parent(),{filters:[{name:'原生组合',extensions:['json']}],properties:['openFile']});if(r.canceled)return null;const st=await fs.stat(r.filePaths[0]);if(st.size>20_000_000)throw Error('组合文件超过20MB');const b=JSON.parse(await fs.readFile(r.filePaths[0],'utf8'));validateBundle(b);await service.regionPreview(b);return store.saveAssembly(b);},true);
  handle('assemblyExport',async b=>{validateBundle(b);const r=await dialog.showSaveDialog(parent(),{defaultPath:b.name+'.sstar-assembly.json',filters:[{name:'原生组合',extensions:['json']}]});if(!r.canceled&&r.filePath)await atomicWrite(r.filePath,JSON.stringify(b,null,2));},true);
  handle('recoveryWrite',async w=>{await service.checkWorld(w);await store.saveRecovery(w,projectPaths.get(pathKey(w.id)));});handle('recoveryList',async w=>{const file=projectPaths.get(pathKey(w.id)),rows=await store.recoveries(w,file);let modified=0;if(file)modified=(await fs.stat(file)).mtimeMs;const latest=rows.find(i=>i.kind==='auto');const changed=latest?JSON.stringify(upgradeWorld(await store.restore(w,latest.id,file)))!==JSON.stringify(upgradeWorld(w)):false;return rows.map(i=>({...i,recoverable:i.id===latest?.id&&changed&&Date.parse(i.at)>modified}));});handle('recoveryRestore',async(w,id)=>{const restored=await store.restore(w,id,projectPaths.get(pathKey(w.id)));return upgradeWorld(await service.adaptWorld(restored));});
  handle('runValidate',(w,r)=>service.runValidate(w,r));handle('runPlan',(w,r)=>service.runPlan(w,r));handle('runLaunch',(w,r,c)=>service.runLaunch(w,r,c),true);handle('nativeRunPlan',(p,r)=>service.nativeRunPlan(p,r));handle('nativeRunLaunch',(p,r,c)=>service.nativeRunLaunch(p,r,c),true);
  handle('previewMesh',r=>service.assets!.preview(r));
  handle('worldCreate',()=>service.worldCreate());handle('worldValidate',w=>service.worldValidate(w));handle('worldPrefabs',()=>service.worldPrefabs());
  handle('worldSave',async(w:WorldProject,saveAs=false)=>{await service.checkWorld(w);const legacy=w.version===4?migratedWorldPaths.get(pathKey(w.id)):undefined;let file=saveAs||legacy?undefined:projectPaths.get(pathKey(w.id));if(!file){await fs.mkdir(path.join(service.workspace,'projects'),{recursive:true});const r=await dialog.showSaveDialog(parent(),{defaultPath:path.join(service.workspace,'projects',w.id+(adaptedPaths.has(pathKey(w.id))?'.build-'+service.build:'')+'.sstar-world.json'),filters:[{name:'大地图工程',extensions:['sstar-world.json']}]});if(r.canceled||!r.filePath)return null;file=r.filePath;}file=await projectWindows.fileAvailable(tab(),file);if(legacy?.toLowerCase()===path.resolve(file).toLowerCase())throw Error('请另存三维大地图，保留旧工程');if(adaptedPaths.get(pathKey(w.id))?.toLowerCase()===path.resolve(file).toLowerCase())throw Error('请为适配工程选择新文件，保留来源工程');try{const old=JSON.parse(await fs.readFile(file,'utf8'));if(old.version<3)await fs.copyFile(file,file+'.pre-v06.bak',fs.constants.COPYFILE_EXCL);}catch(e){if(!['ENOENT','EEXIST'].includes((e as NodeJS.ErrnoException).code??''))throw e;}try{const previous=JSON.parse(await fs.readFile(file,'utf8'));await store.saveRecovery(upgradeWorld(previous),file,'manual');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}const saved=upgradeWorld(w);if(!saved.native)saved.sourceEvidence={...service.evidence(saved),history:w.sourceEvidence?.history};const text=JSON.stringify(saved,null,saved.version===4?undefined:2);if(Buffer.byteLength(text)>64_000_000)throw Error('工程超过可保存的 64 MB，请缩小范围');await atomicWrite(file,text);await rememberProject(w,file);migratedWorldPaths.delete(pathKey(w.id));return file;},true);
  handle('worldStartup',async()=>{
    const current=tab();
    if(current.start==='blank')return null;
    if(current.start==='file'){try{return await readWorldFile(current.file!);}catch(e){current.file=undefined;throw e;}}
    if(current.start==='native'){const p=await nativeProject(),index=await service.nativeIndex(p);return nativeWorkbench(p,index,nativeRegions(service.pkg,service.codec!,await fs.readFile(path.join(service.gamePath,'data/strings/s-cn.localization'),'utf8')));}
    if(current.start==='studio')return service.worldStudioExample();
    if(current.start==='showcase')return service.worldExample();
    if(current.start==='recreations')return service.worldRecreations();
    let file=process.env.SINKING_STAR_OPEN_PROJECT;try{if(!file)file=JSON.parse(await fs.readFile(lastProject,'utf8')).file;}catch{}if(!file)return null;try{return await readWorldFile(file);}catch(e){throw Error('上次工程未能打开：'+String(e)+'。原文件保持不变。');}});
  handle('inspectCompatibility',async()=>{const r=await dialog.showOpenDialog(parent(),{title:'只读查看工程兼容报告',filters:[{name:'编辑工程',extensions:['json']}],properties:['openFile']});if(r.canceled)return null;const file=r.filePaths[0];if((await fs.stat(file)).size>20_000_000)throw Error('工程超过 20MB');const w=JSON.parse(await fs.readFile(file,'utf8'));const issues:string[]=[];try{if(w.format==='sinking-star-native-world')await service.adaptNativeWorld(w);else if(w.format==='sinking-star-world')await service.adaptWorld(w);else await service.adaptProject(w);}catch(e){issues.push(String(e));}return{name:String(w.name??'未知工程'),build:String(w.sourceBuild??'未知'),hash:String(w.sourceHash??''),levels:(w.format==='sinking-star-world'&&Array.isArray(w.levels)?w.levels:w.format==='sinking-star-native-world'&&Array.isArray(w.scenes)?w.scenes:[{title:w.name,project:w}]).map((l:any)=>({name:String(l.title??''),template:String(l.project?.template??''),operations:Array.isArray(l.project?.operations)?l.project.operations.length:0})),issues};});
  handle('worldLoad',async()=>{const r=await dialog.showOpenDialog(parent(),{defaultPath:path.join(service.workspace,'projects'),filters:[{name:'大地图工程',extensions:['json']}],properties:['openFile']});if(r.canceled)return null;return readWorldFile(r.filePaths[0]);},true);
  handle('worldImport',async()=>{const r=await dialog.showOpenDialog(parent(),{defaultPath:path.join(service.workspace,'projects'),filters:[{name:'旧版单关工程',extensions:['json']}],properties:['openFile']});if(r.canceled)return null;const st=await fs.stat(r.filePaths[0]);if(st.size>20_000_000)throw new Error('单关工程超过20MB');const p=await service.adaptProject(JSON.parse(await fs.readFile(r.filePaths[0],'utf8')));await service.checkProject(p);await service.preview(p);return upgradeProject(p);},true);
  handle('worldBuild',w=>service.worldBuild(w),true);handle('worldDeploy',(w,e)=>service.worldDeploy(w,e),true);handle('worldLaunch',(w,e)=>service.worldLaunch(w,e),true);
  handle('worldReset',async w=>{const r=await dialog.showMessageBox(parent(),{type:'question',message:'重置当前工程的测试进度？',detail:'仅归档并重置本工程的专用测试战役，其他战役不受影响。',buttons:['取消','归档并重置'],defaultId:0,cancelId:0});return r.response===1?service.worldReset(w):'已取消重置';},true);
  handle('save',async(p:EditorProject)=>{await service.checkProject(p);await fs.mkdir(path.join(service.workspace,'projects'),{recursive:true});const r=await dialog.showSaveDialog(parent(),{defaultPath:path.join(service.workspace,'projects',p.name+'.sstar.json'),filters:[{name:'沉星之序编辑工程',extensions:['sstar.json']}]});if(r.canceled||!r.filePath)return null;try{await fs.copyFile(r.filePath,r.filePath+'.pre-v06.bak',fs.constants.COPYFILE_EXCL);}catch(e){if(!['ENOENT','EEXIST'].includes((e as NodeJS.ErrnoException).code??''))throw e;}const file=await projectWindows.fileAvailable(tab(),r.filePath);await atomicWrite(file,JSON.stringify({...upgradeProject(p),sourceEvidence:{...service.evidence(p),history:p.sourceEvidence?.history}},null,2));return r.filePath;},true);
  handle('load',async()=>{const r=await dialog.showOpenDialog(parent(),{defaultPath:path.join(service.workspace,'projects'),filters:[{name:'编辑工程 / 补丁',extensions:['json']}],properties:['openFile']});if(r.canceled)return null;const st=await fs.stat(r.filePaths[0]);if(st.size>2_000_000)throw new Error('工程文件超过 2 MB');const p=await service.adaptProject(JSON.parse(await fs.readFile(r.filePaths[0],'utf8')));validateProject(p);await service.checkProject(p);await service.preview(p);return upgradeProject(p);},true);
  handle('build',p=>service.buildProject(p),true);handle('prepare',()=>service.prepare(),true);handle('deploy',p=>service.deploy(p),true);handle('launch',()=>service.launch(),true);handle('restore',()=>service.restore(),true);
  handle('reveal',async()=>{await fs.mkdir(service.workspace,{recursive:true});await shell.openPath(service.workspace);});
  const requestedSize=process.env.SINKING_STAR_WINDOW_SIZE?.match(/^(\d+)x(\d+)$/);
  projectWindows.start(
    requestedSize?Math.max(1050,Math.min(2560,Number(requestedSize[1]))):1480,
    requestedSize?Math.max(720,Math.min(1600,Number(requestedSize[2]))):960
  );
});
app.on('second-instance',()=>projectWindows?.focusRecent());
app.on('window-all-closed',()=>app.quit());
