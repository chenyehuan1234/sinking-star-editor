import {app,dialog,ipcMain,shell} from 'electron';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {HomeLibrary,imageBytes} from './home-library';
import {digest,designLevels,encodeShare,independentDesign,parseShare,retargetDesignId,singleWorld,type ShareDesign} from '../core/share';
import {nativeScene,nativeWorkbench} from '../native-project';
import {coverLimit,shareExtension,shareLimit,type ShareDraft,type SharedWork} from '../share-types';
import type {LevelImportChoice,LibraryAddResult,SceneThumbnail,ThumbnailSource} from '../home-types';
import type {WorldProject} from '../shared';
import {atomicWrite,type EditorService} from './service';
import {directoriesOverlap} from './game-installation';
import {version as editorVersion} from '../../package.json';
import {DownloadLibrary} from './download-library';
import {appendImportedLevels,fileForLibrary,fileImport,shareImport,type ImportDesign} from './level-import';
import type {ProjectWindows} from './project-windows';

const apiRoute=/^\/api\/(?:works(?:\/[a-f0-9]{32}(?:\/(?:report|cover|previews\/[\w.-]{1,100}|download))?)?|account\/(?:signup|login|logout|recover|session))(?:\?[^#]{0,1200})?$/;
export function connectUrl(value:string){
  if(!value.trim())return '';
  const url=new URL(value.trim());
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password)throw Error('请输入 HTTPS 社区地址');
  url.hash='';
  return url.toString();
}
async function limited(res:Response, limit:number){
  if(Number(res.headers.get('content-length'))>limit)throw Error('社区返回的文件超过大小上限');
  const reader=res.body?.getReader();if(!reader)return Buffer.alloc(0);
  const parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('社区返回的文件超过大小上限');parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return Buffer.concat(parts,size);
}
type PendingShare = ShareDraft & {bytes:Buffer;source:WorldProject;selected?:string};

export function registerHome(windows:ProjectWindows,library:HomeLibrary,service:()=>EditorService,backgroundGame:()=>Promise<boolean>,lastProject:string){
  const drafts=new Map<number,PendingShare>();
  const downloads=new DownloadLibrary(path.join(app.getPath('userData'),'home','downloads'));
  const picked=new Map<number,{key:string;file:string}>();
  let session='';
  const communityAddress=async()=>await library.community()||process.env.SINKING_STAR_COMMUNITY_URL||'';
  async function request(route:string,method='GET',value?:string|Buffer,contentType='application/json',meta?:string){
    if(!apiRoute.test(route)||!['GET','POST','PATCH','DELETE'].includes(method))throw Error('社区请求无效');
    const base=await communityAddress();
    if(!base)throw Error('请先填写社区地址');
    const configured=new URL(connectUrl(base)),url=new URL(route,configured);
    for(const [key,item] of configured.searchParams)if(!url.searchParams.has(key))url.searchParams.set(key,item);
    const headers:Record<string,string>={'x-sstar-desktop':'1'};
    if(session)headers.Authorization='Bearer '+session;
    if(value!==undefined)headers['Content-Type']=contentType;
    if(meta)headers['x-work-meta']=meta;
    const response=await fetch(url,{method,headers,body:value===undefined?undefined:typeof value==='string'?value:new Uint8Array(value),redirect:'error',signal:AbortSignal.timeout(30000)});
    if(response.status===401&&!route.includes('/account/login'))session='';
    if(!response.ok){const text=await limited(response,64*1024).catch(()=>Buffer.alloc(0));let error='社区请求失败（'+response.status+'）';try{error=JSON.parse(text.toString()).error??error;}catch{}throw Error(String(error));}
    return response;
  }
  async function installShare(bytes:Buffer){
    const {manifest,design}=parseShare(bytes);
    if(!await backgroundGame())throw Error(`请先连接 Steam 游戏再导入。作品使用 Build ${manifest.sourceBuild}`);
    const engine=service();
    const copy=independentDesign(design);
    if(design.format==='sinking-star-project'){copy.name=manifest.levels[0].title;if(copy.format==='sinking-star-world')copy.levels[0].title=manifest.levels[0].title;}
    if(copy.format==='sinking-star-world'){
      const adapted=await engine.adaptWorld(copy);
      for(const scene of adapted.levels){
        if(!scene.project.base&&!engine.pkg.entries.some(e=>e.name===`data-common/${scene.project.template}.entities`))throw Error('缺少原版关卡 '+scene.project.template);
        const preview=await engine.preview(scene.project);
        if(preview.replayIssues?.length)throw Error('「'+scene.title+'」'+preview.replayIssues.join('；'));
      }
      const overview=await engine.worldPreview(adapted);
      if(overview.replayIssues?.length)throw Error(overview.replayIssues.join('；'));
    }else{
      const adapted=await engine.adaptNativeWorld(copy);
      await engine.nativeIndex(adapted);
      const errors=await engine.nativeValidate(adapted);
      if(errors.some(e=>e.severity==='error'))throw Error(errors.find(e=>e.severity==='error')!.message);
    }
    const native=copy.format==='sinking-star-native-world';
    const dir=path.join(engine.workspace,'projects');
    await fs.mkdir(dir,{recursive:true});
    const real=await fs.realpath(dir);
    for(const protectedRoot of [engine.gamePath,engine.campaigns.saves,engine.testRoot])if(protectedRoot&&directoriesOverlap(real,await fs.realpath(protectedRoot).catch(()=>protectedRoot)))throw Error('请选择游戏与存档目录之外的导入位置');
    const file=path.join(real,copy.id+(native?'.sstar-native-world.json':'.sstar-world.json'));
    await atomicWrite(file,JSON.stringify(copy));
    return (await library.inspect(await library.remember(file))).row;
  }
  const handle=(name:string,fn:(host:ReturnType<ProjectWindows['homeOwner']>,...args:any[])=>unknown)=>ipcMain.handle('home:'+name,(event,...args)=>fn(windows.homeOwner(event),...args));
  const recent=()=>fs.readFile(lastProject,'utf8').then(text=>JSON.parse(text).file as string).catch(()=>undefined);
  handle('list',async()=>library.list(await recent()));
  handle('catalog',async()=>library.directories(await recent()));
  handle('levels',async(_host,key)=>{
    const {document}=await library.inspect(key);
    if(document.format==='sinking-star-native-world'&&document.version===4&&await backgroundGame()){
      const index=await service().nativeIndex(await service().adaptNativeWorld(document));
      return index.levels.filter(id=>id!=='overworld').map(id=>({id,title:id}));
    }
    return library.levels(key);
  });
  handle('addDirectory',async host=>{const choice=await dialog.showOpenDialog(host.window,{title:'添加工程目录',properties:['openDirectory']});if(choice.canceled)return false;await library.addRoot(choice.filePaths[0]);return true;});
  handle('open',(host,key,level)=>windows.openPath(host,library.file(key),level));
  function closedFile(key:string){
    const file=library.file(key);
    if(windows.isOpen(file))throw Error('请先关闭该工程的编辑标签');
    return file;
  }
  handle('renameProject',async(_host,key,title)=>{closedFile(key);await library.rename(key,title);});
  handle('removeProject',async(_host,key)=>{
    const file=closedFile(key),previous=await recent();
    const present=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(present){
      if(!present.isFile()||present.isSymbolicLink())throw Error('工程文件已移动或替换，请先刷新列表');
      await library.readFile(file);
      await shell.trashItem(file);
    }
    if(previous&&directoriesOverlap(previous,file))await atomicWrite(lastProject,JSON.stringify({}));
    await library.forget(key);
  });
  handle('feedback',(_host,kind)=>{
    if(kind!=='bug'&&kind!=='idea')throw Error('请选择问题或建议');
    const url=new URL('https://github.com/chenyehuan1234/sinking-star-editor/issues/new');
    url.searchParams.set('title',kind==='bug'?'[问题] ':'[建议] ');
    url.searchParams.set('labels',kind==='bug'?'bug':'enhancement');
    return shell.openExternal(url.toString());
  });
  handle('importFile',async host=>{
    const choice=await dialog.showOpenDialog(host.window,{title:'导入关卡或社区分享包',filters:[{name:'关卡与分享包',extensions:['json','gz']}],properties:['openFile']});
    if(choice.canceled)return null;
    const file=choice.filePaths[0];
    if(file.toLowerCase().endsWith(shareExtension)){
      if((await fs.stat(file)).size>shareLimit)throw Error('分享包超过 5 MiB');
      return installShare(await fs.readFile(file));
    }
    await library.readFile(file);
    return (await library.inspect(await library.remember(file))).row;
  });
  handle('openImported',(host,key)=>windows.openPath(host,library.file(key)));
  handle('thumbnail',(_host,key,level,source:ThumbnailSource='project')=>source==='library'?downloads.thumbnail(key):library.thumbnail(key,level));
  handle('thumbnailSave',(_host,key,level,image:SceneThumbnail,signature,source:ThumbnailSource='project')=>{
    if(source!=='library')return library.thumbnailSave(key,level,image,signature);
    imageBytes(image.image);
    return downloads.thumbnailSave(key,image,signature);
  });
  handle('preview',async(_host,key,id,source:ThumbnailSource='project')=>{
    if(!await backgroundGame())return null;
    const engine=service();
    if(source==='library'){
      const signature=await downloads.signature(key);
      const entry=shareImport(await downloads.bytes(key));
      const primary=entry.levels.find(scene=>scene.id===entry.primary);
      if(!primary)throw Error('关卡库记录缺少主关卡');
      return {level:await engine.preview(primary.project),signature};
    }
    const {document,signature}=await library.inspect(key);
    let level;
    if(document.format==='sinking-star-project')level=await engine.preview(document);
    else if(document.format==='sinking-star-world'){
      const p=await engine.adaptWorld(document);
      level=id==='world'?await engine.worldPreview(p):await engine.preview(p.levels.find(s=>s.id===id)!.project);
    }else{
      const p=await engine.adaptNativeWorld(document);
      level=id==='world'?(await engine.nativeRegion({project:p,session:p.id,revision:0,cellId:'world',overview:true})).view:await engine.preview(nativeScene(p,id)!);
    }
    return {level,cameraKey:(document.format==='sinking-star-project'?'':document.id)+':'+id,signature};
  });
  handle('communityUrl',async(_host,value)=>{
    if(value!==undefined){session='';return library.community(connectUrl(value));}
    return await library.community()||process.env.SINKING_STAR_COMMUNITY_URL||'';
  });
  handle('request',async(_host,route,method,json)=>{
    if(method&&method!=='GET'&&!/^\/api\/(account\/|works\/[a-f0-9]{32}(?:\/report)?(?:\?|$))/.test(route))throw Error('请使用专用发布入口');
    const reply=await request(route,method,json===undefined?undefined:JSON.stringify(json));
    const result=JSON.parse((await limited(reply,2_000_000)).toString());
    if(route==='/api/account/logout')session='';
    if(/^\/api\/account\/(signup|login|recover)$/.test(route)&&typeof result.token==='string'){session=result.token;delete result.token;}
    return result;
  });
  handle('image',async(_host,route)=>{
    if(!/\/(?:cover|previews\/[\w.-]+)$/.test(route))throw Error('无效的社区图片');
    const res=await request(route);
    if(res.headers.get('content-type')!=='image/webp')return null;
    return 'data:image/webp;base64,'+(await limited(res,coverLimit)).toString('base64');
  });
  handle('download',async(_host,id,level)=>{
    const metadata=await request('/api/works/'+id);
    const work=JSON.parse((await limited(metadata,2_000_000)).toString()) as SharedWork;
    if(work.localSample)throw Error('此样本可在桌面首页打开');
    const isLevel=Boolean(level)||work.manifest.scope!=='project',source=new URL(await communityAddress()).origin;
    if(isLevel){
      const cached=(await downloads.list()).find(row=>row.work===id&&row.source===source&&row.level===level&&row.version===work.version);
      if(cached&&await downloads.bytes(cached.key).catch(()=>null))return {kind:'level',item:cached};
    }
    const res=await request(`/api/works/${id}/download${level?'?level='+encodeURIComponent(level):''}`);
    const bytes=await limited(res,shareLimit);
    if(res.headers.get('x-design-sha256')!==digest(bytes))throw Error('下载校验值不匹配');
    return isLevel?{kind:'level',item:await downloads.save(bytes,work,source,level)}:{kind:'project',project:await installShare(bytes)};
  });
  handle('downloadSave',async(host,key)=>{
    const item=(await downloads.list()).find(row=>row.key===key);
    if(!item)throw Error('下载记录不存在');
    const choice=await dialog.showSaveDialog(host.window,{title:'另存关卡分享包',defaultPath:item.name.replace(/[<>:"/\\|?*]/g,'_')+shareExtension,filters:[{name:'关卡分享包',extensions:['gz']}]});
    if(choice.canceled||!choice.filePath)return null;
    const file=choice.filePath.toLowerCase().endsWith(shareExtension)?choice.filePath:choice.filePath.replace(/\.gz$/i,'')+shareExtension;
    await fs.writeFile(file,await downloads.bytes(key),{flag:'wx'});
    return file;
  });
  handle('renameLibraryItem',(_host,key,title)=>downloads.rename(key,title));
  handle('removeLibraryItem',(_host,key)=>downloads.remove(key,file=>shell.trashItem(file)));
  handle('libraryAddFile',async host=>{
    const choice=await dialog.showOpenDialog(host.window,{title:'添加到本机关卡库',filters:[{name:'关卡文件',extensions:['json','gz']}],properties:['openFile']});
    if(choice.canceled||!choice.filePaths[0])return null;
    return downloads.saveLocal(await fileForLibrary(choice.filePaths[0],editorVersion));
  });
  handle('libraryAddLevels',async(_host,key:string,ids:string[]):Promise<LibraryAddResult>=>{
    if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'))throw Error('请勾选要加入关卡库的小关');
    const {document}=await library.inspect(key),result:LibraryAddResult={saved:0,failed:[]};
    if(document.format==='sinking-star-project'){
      if(ids.some(id=>id!==document.name))throw Error('所选关卡已变化，请重新展开工程');
      await downloads.saveLocal(encodeShare(document,'level',editorVersion).bytes);
      return {saved:1,failed:[]};
    }
    if(!await backgroundGame())throw Error('请先连接 Steam 原游戏，以检查这些关卡的依赖');
    const engine=service();
    let world:WorldProject;
    if(document.format==='sinking-star-native-world'){
      const native=await engine.adaptNativeWorld(document);
      world=nativeWorkbench(native,await engine.nativeIndex(native));
    }else world=await engine.adaptWorld(document);
    const titles=new Map(designLevels(world).map(level=>[level.id,level.title]));
    for(const id of new Set(ids)){
      const title=titles.get(id)??id;
      try{
        if(!titles.has(id))throw Error('关卡已移动或删除，请刷新工程列表');
        const {bytes}=await engine.prepareShare(world,id,editorVersion);
        await downloads.saveLocal(bytes,title);
        result.saved++;
      }catch(error){result.failed.push({id,title,reason:error instanceof Error?error.message:String(error)});}
    }
    return result;
  });
  handle('openLibraryItem',async(host,key)=>{
    const bytes=await downloads.bytes(key),{manifest,design}=parseShare(bytes);
    if(design.format==='sinking-star-project'){
      windows.openLevelDraft(host,{...design,title:(await downloads.item(key)).name||manifest.levels[0].title});
      return;
    }
    const project=await installShare(bytes);
    await windows.openPath(host,library.file(project.key));
  });
  handle('libraryPlay',async(host,key:string)=>{
    const {manifest,design}=parseShare(await downloads.bytes(key));
    if(manifest.scope==='project'||design.format==='sinking-star-native-world')throw Error('请选择库中的单关或关卡组');
    const primary=manifest.levels.find(level=>level.id===manifest.primaryId)??manifest.levels.find(level=>level.title===manifest.title)??manifest.levels[0];
    if(!primary)throw Error('关卡库记录缺少主关卡');
    if(!await backgroundGame())throw Error('请先连接 Steam 原游戏再试玩');
    const snapshot=design.format==='sinking-star-project'?singleWorld(design,primary.title,primary.id):design;
    retargetDesignId(snapshot,snapshot.id,key.slice(0,12));
    const engine=service();
    return engine.exclusive(async()=>{
      const original=engine.onPlaytestProgress;
      engine.onPlaytestProgress=(message,progress)=>{
        if(!host.window.isDestroyed())host.window.webContents.send('home:libraryPlayProgress',message,progress);
      };
      try{return await engine.runLaunch(await engine.adaptWorld(snapshot),{mode:'world',levelIds:[]},undefined,primary.id);}
      finally{engine.onPlaytestProgress=original;}
    });
  });
  const hostId=(host:ReturnType<ProjectWindows['homeOwner']>)=>host.window.webContents.id;
  handle('shareDraft',host=>{const draft=drafts.get(hostId(host));if(!draft)return null;const {manifest,size,cover,previews}=draft;return {manifest,size,cover,previews};});
  handle('shareClear',host=>drafts.delete(hostId(host)));
  handle('sharePreview',async(host,level:string)=>{
    const draft=drafts.get(hostId(host));if(!draft)throw Error('请选择要分享的工程');
    if(level==='world'){
      const selected=draft.source.levels.find(row=>row.id===draft.selected);
      return selected?service().preview(selected.project):service().worldPreview(draft.source);
    }
    if(!draft.manifest.levels.some(row=>row.id===level))throw Error('该关卡不在分享范围');
    const scene=draft.source.levels.find(row=>row.id===level);
    if(!scene)throw Error('该关卡不在工程中');
    return service().preview(scene.project);
  });
  handle('shareImage',(host,level:string,image:string)=>{
    const draft=drafts.get(hostId(host));if(!draft)throw Error('请选择要分享的工程');
    imageBytes(image);
    if(level==='world')draft.cover=image;
    else if(draft.manifest.levels.some(row=>row.id===level))draft.previews[level]=image;
    else throw Error('该关卡不在分享范围');
  });
  handle('replaceImage',async(_host,id:string,level:string,image:string)=>{
    const ending=level==='world'?'cover':'previews/'+level;
    await request('/api/works/'+id+'/'+ending,'POST',imageBytes(image),'image/webp');
  });
  handle('shareSave',async host=>{
    const draft=drafts.get(hostId(host));if(!draft)throw Error('请选择要分享的关卡或工程');
    const title=draft.manifest.levels.length===1?draft.manifest.levels[0].title:draft.manifest.title;
    const choice=await dialog.showSaveDialog(host.window,{title:'保存社区分享包',defaultPath:title.replace(/[<>:"/\\|?*]/g,'_')+shareExtension,filters:[{name:'沉星之序社区分享包',extensions:['gz']}]});
    if(choice.canceled||!choice.filePath)return null;
    const file=choice.filePath.toLowerCase().endsWith(shareExtension)?choice.filePath:choice.filePath.replace(/\.gz$/i,'')+shareExtension;
    await fs.writeFile(file,draft.bytes,{flag:'wx'});
    return file;
  });
  handle('publish',async(host,input)=>{
    const draft=drafts.get(hostId(host));if(!draft)throw Error('请先准备分享包');
    const {title,description,version,id,images}=input;
    const route=id?'/api/works/'+id:'/api/works';
    const metadata=JSON.stringify({title,description,version});
    if(Buffer.byteLength(metadata)>4096)throw Error('作品说明过长');
    const result=await request(route,id?'PATCH':'POST',draft.bytes,'application/gzip',Buffer.from(metadata).toString('base64'));
    const work=JSON.parse((await limited(result,64*1024)).toString());
    if(images)try{
      if(draft.cover&&input.cover!==false)await request(`/api/works/${work.id}/cover`,'POST',imageBytes(draft.cover),'image/webp');
      const selected=input.previews??Object.keys(draft.previews);
      for(const level of selected.slice(0,12))if(draft.previews[level])await request(`/api/works/${work.id}/previews/${level}`,'POST',imageBytes(draft.previews[level]),'image/webp');
    }catch{work.warning='作品已上架，部分预览图未上传，可在作品详情中补传。';}
    drafts.delete(hostId(host));
    return work;
  });
  function editor(event:Electron.IpcMainInvokeEvent){
    const tab=windows.editor(event.sender);
    if(!tab||event.senderFrame!==event.sender.mainFrame)throw Error('无效的编辑器来源');
    return tab;
  }
  ipcMain.handle('home:downloads',event=>{
    if(windows.editor(event.sender))editor(event);else windows.homeOwner(event);
    return downloads.list();
  });
  ipcMain.handle('home:libraryAddScene',async(event,project:WorldProject,level:string)=>{
    editor(event);
    if(!project.levels.some(row=>row.id===level))throw Error('请先打开要收藏的小关');
    const {bytes}=await service().prepareShare(project,level,editorVersion);
    return downloads.saveLocal(bytes,project.levels.find(row=>row.id===level)!.title);
  });
  ipcMain.handle('home:importPick',async event=>{
    const tab=editor(event);
    const choice=await dialog.showOpenDialog(tab.owner.window,{title:'导入单关或关卡组',filters:[{name:'关卡文件',extensions:['json','gz']}],properties:['openFile']});
    if(choice.canceled||!choice.filePaths[0])return null;
    const file=choice.filePaths[0],source=await fileImport(file),key=randomUUID();
    if(!picked.has(event.sender.id))event.sender.once('destroyed',()=>picked.delete(event.sender.id));
    picked.set(event.sender.id,{key,file});
    return {choice:{kind:'file',key},title:source.title,levels:source.directory,primary:source.primary};
  });
  ipcMain.handle('home:importInto',async(event,project:WorldProject,choice:LevelImportChoice,folder?:string)=>{
    editor(event);
    const current=picked.get(event.sender.id);
    let payload:ImportDesign;
    if(choice.kind==='download'){
      const item=(await downloads.list()).find(row=>row.key===choice.key);
      if(!item)throw Error('下载记录不存在，请重新下载');
      payload=shareImport(await downloads.bytes(item.key),item.level);
    }else if(choice.kind==='file'&&current?.key===choice.key)payload=await fileImport(current.file);
    else throw Error('请重新选择要导入的关卡');
    return appendImportedLevels(service(),project,payload,folder);
  });
  ipcMain.handle('home:startScene',event=>{
    const tab=editor(event),scene=tab.startScene;
    tab.startScene=undefined;
    return {scene,singleLevel:tab.singleLevel===true};
  });
  ipcMain.handle('home:useCover',async(event,image)=>{
    const tab=editor(event);if(!tab.file)throw Error('请先保存工程，再设为首页封面');
    const key=await library.remember(tab.file),{row}=await library.inspect(key);
    await library.thumbnailSave(key,row.cover,{image});
  });
  ipcMain.handle('home:prepare',async(event,project:WorldProject,level?:string,cover?:string)=>{
    const tab=editor(event),host=tab.owner;
    if(cover)imageBytes(cover);
    const {bytes,manifest}=await service().prepareShare(project,level,editorVersion);
    const previews:Record<string,string>={};
    if(tab.file){
      const key=await library.remember(tab.file);
      const row=(await library.inspect(key)).row;
      if(!cover){
        cover=((level?await library.thumbnail(key,level).catch(()=>null):null)??await library.thumbnail(key,row.cover).catch(()=>null))?.image;
      }
      for(const row of manifest.levels){
        if(Object.keys(previews).length>=12)break;
        const image=await library.thumbnail(key,row.id).catch(()=>null);if(image)previews[row.id]=image.image;
      }
    }
    const summary={manifest,size:bytes.length,cover,previews};
    if(host.window.isDestroyed())return summary;
    const key=hostId(host);
    if(!drafts.has(key))host.window.webContents.once('destroyed',()=>drafts.delete(key));
    drafts.set(key,{...summary,bytes,source:project,selected:level});
    windows.showHome(host);
    host.window.webContents.send('home:shareDraft');
    return summary;
  });
}
