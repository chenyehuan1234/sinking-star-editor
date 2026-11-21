import {app,dialog,ipcMain,net,session,shell} from 'electron';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {HomeLibrary,imageBytes} from './home-library';
import {digest,designLevels,encodeShare,independentDesign,parseShare,previewScene,retargetDesignId,shareLevel,singleWorld,type ShareDesign} from '../core/share';
import {nativeScene,nativeWorkbench} from '../native-project';
import {coverLimit,fullImageLimit,scenePreviewLimit,shareExtension,shareLimit,type CommunityImage,type CommunityPreviewSource,type ShareDraft,type SharedWork} from '../share-types';
import type {CommunitySignIn,HomeShareSource,LevelImportChoice,LibraryAddResult,SceneThumbnail,ThumbnailSource} from '../home-types';
import type {WorldProject} from '../shared';
import {atomicWrite,type EditorService} from './service';
import {directoriesOverlap} from './game-installation';
import {version as editorVersion} from '../../package.json';
import {DownloadLibrary} from './download-library';
import {appendImportedLevels,fileForLibrary,fileImport,shareImport,type ImportDesign} from './level-import';
import type {ProjectWindows} from './project-windows';
import {CommunityAuthor,CommunityHttpError} from './community-author';
import {CommunityCache} from './community-cache';
import {CommunityConnectionError,communityDeadline,communityTimeout} from '../community-network';

const apiRoute=/^\/api\/(?:works(?:\/[a-f0-9]{32}(?:\/(?:report|cover|previews\/[\w.-]{1,100}|download))?)?|account\/(?:signup|login|logout|recover|session))(?:\?[^#]{0,1200})?$/;
const defaultCommunity='https://sinking-star-community-preview.lingxiao-clubhub.workers.dev';
const minute=60_000,day=24*60*minute,mib=1024*1024;
class CommunityResponseTooLarge extends Error {}
type RequestBudget={limit?:number;signal?:AbortSignal};
const offlineCacheAllowed=(error:unknown)=>error instanceof CommunityConnectionError||
  error instanceof CommunityHttpError&&(error.status===429||error.status>=500);
const communityImageKey=(route:string,version:string='')=>JSON.stringify([route,version]);
function connectUrl(value:string){
  const url=new URL(value.trim());
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password)throw Error('社区地址配置无效');
  url.hash='';
  return url;
}
async function limited(res:Response, limit:number){
  if(Number(res.headers.get('content-length'))>limit){
    void res.body?.cancel().catch(()=>{});
    throw new CommunityResponseTooLarge('社区返回的文件超过大小上限');
  }
  const reader=res.body?.getReader();if(!reader)return Buffer.alloc(0);
  const parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new CommunityResponseTooLarge('社区返回的文件超过大小上限');parts.push(value);}}
  finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
  return Buffer.concat(parts,size);
}
type PendingShare = ShareDraft & {bytes:Buffer;source:WorldProject;selected?:string};

export function registerHome(windows:ProjectWindows,library:HomeLibrary,service:()=>EditorService,backgroundGame:()=>Promise<boolean>,lastProject:string){
  const drafts=new Map<number,PendingShare>();
  const downloads=new DownloadLibrary(path.join(app.getPath('userData'),'home','downloads'));
  const picked=new Map<number,{key:string;file:string}>();
  const address=process.env.SINKING_STAR_COMMUNITY_URL?.trim()||defaultCommunity;
  let community:URL|undefined;
  try{community=connectUrl(address);}catch{/* A development override must not prevent offline startup. */}
  const cacheRoot=path.join(app.getPath('userData'),'home','community-cache-v1',digest(community?.href??address).slice(0,24));
  const catalogs=new CommunityCache(path.join(cacheRoot,'lists'),{freshMs:5*minute,keepMs:7*day,diskBytes:12*mib,entries:96});
  const details=new CommunityCache(path.join(cacheRoot,'details'),{freshMs:5*minute,keepMs:7*day,diskBytes:12*mib,entries:160});
  const images=new CommunityCache(path.join(cacheRoot,'images'),{freshMs:day,keepMs:30*day,diskBytes:96*mib,entries:1024});
  const sceneDesigns=new CommunityCache(path.join(cacheRoot,'scenes'),{freshMs:90*day,keepMs:90*day,diskBytes:50*mib,entries:2048});
  const credentialFile=path.join(app.getPath('userData'),'home','community-author-'+digest(Buffer.from(community?.origin??address)).slice(0,24)+'.bin');
  const author=new CommunityAuthor(credentialFile,async(action,fields,token,signal)=>{
    const reply=await send('/api/account/'+action,'POST',fields===undefined?undefined:JSON.stringify(fields),'application/json',undefined,token,{limit:64*1024,signal});
    return JSON.parse(reply.bytes.toString());
  });
  async function send(route:string,method:string,value?:string|Buffer,contentType='application/json',meta?:string,token?:string,budget:RequestBudget={}){
    if(!apiRoute.test(route)||!['GET','POST','PATCH','DELETE'].includes(method))throw Error('社区请求无效');
    if(!community)throw Error('社区地址配置无效。');
    const url=new URL(route,community);
    for(const [key,item] of community.searchParams)if(!url.searchParams.has(key))url.searchParams.set(key,item);
    const headers:Record<string,string>={'x-sstar-desktop':'1'};
    if(token)headers.Authorization='Bearer '+token;
    if(value!==undefined)headers['Content-Type']=contentType;
    if(meta)headers['x-work-meta']=meta;
    return communityDeadline(communityTimeout,async signal=>{
      let response:Response,bytes:Buffer;
      try{
        response=await net.fetch(url.toString(),{method,headers,cache:'no-store',credentials:'omit',body:value===undefined?undefined:typeof value==='string'?value:new Uint8Array(value),redirect:'error',signal});
        bytes=await limited(response,response.ok?budget.limit??2_000_000:64*1024);
      }catch(error){
        signal.throwIfAborted();
        if(error instanceof CommunityResponseTooLarge)throw error;
        throw new CommunityConnectionError('无法连接关卡社区，请检查网络后重试。',{cause:error});
      }
      if(!response.ok){let error='社区请求失败（'+response.status+'）';try{error=JSON.parse(bytes.toString()).error??error;}catch{}throw new CommunityHttpError(response.status,String(error));}
      return {headers:response.headers,bytes};
    },budget.signal);
  }
  async function request(route:string,method='GET',value?:string|Buffer,contentType?:string,meta?:string,budget:RequestBudget={}){
    const ownCatalog=route.startsWith('/api/works?')&&new URLSearchParams(route.split('?',2)[1]).get('mine')==='1';
    return communityDeadline(communityTimeout,async signal=>{
      const session=ownCatalog||method!=='GET'&&!route.endsWith('/report')?await author.restore(signal):author.current();
      return send(route,method,value,contentType,meta,session?.token,{...budget,signal}).catch(error=>{
        if(error instanceof CommunityHttpError&&error.status===401)author.forget(session?.token);
        throw error;
      });
    },budget.signal);
  }
  async function browse(route:string,refresh:boolean,localOnly:boolean){
    if(typeof route!=='string'||!/^\/api\/works(?:\?[^#]{0,1200}|\/[a-f0-9]{32})?$/.test(route))throw Error('社区浏览地址无效');
    const url=new URL(route,defaultCommunity);
    url.searchParams.sort();
    const list=url.pathname==='/api/works',mine=list&&url.searchParams.get('mine')==='1',endpoint=url.pathname+url.search;
    async function reloadProxy(signal:AbortSignal){
      if(refresh&&!localOnly)await session.defaultSession.forceReloadProxyConfig().catch(()=>{});
      signal.throwIfAborted();
    }
    const account=mine?await communityDeadline(communityTimeout,async signal=>{
      await reloadProxy(signal);
      return author.restore(signal);
    }):undefined;
    if(mine&&!account)throw Error('请登录后查看自己的作品');
    const key=account?JSON.stringify([account.username,endpoint]):endpoint;
    const cache=list?catalogs:details;
    if(localOnly){
      const bytes=await cache.peek(key,!mine);
      if(!bytes)return null;
      try{return {data:JSON.parse(bytes.toString()),stale:false};}catch{return null;}
    }
    const load=()=>communityDeadline(communityTimeout,async signal=>{
      if(!mine)await reloadProxy(signal);
      const {bytes}=await send(endpoint,'GET',undefined,undefined,undefined,account?.token,{signal});
      const data=JSON.parse(bytes.toString());
      if(list?!Array.isArray(data?.works):data?.id!==url.pathname.split('/').at(-1))throw Error('无法识别社区返回的数据');
      return bytes;
    });
    const options={refresh,persist:!mine,canUseStale:offlineCacheAllowed};
    const entry=await cache.get(key,load,options);
    try{return {data:JSON.parse(entry.bytes!.toString()),stale:entry.stale,checked:entry.checked};}
    catch{
      await cache.invalidate(key);
      const recovered=await cache.get(key,load,{...options,refresh:true});
      return {data:JSON.parse(recovered.bytes!.toString()),stale:recovered.stale,checked:recovered.checked};
    }
  }
  async function invalidateWork(id:string){
    await Promise.all([catalogs.invalidate(),details.invalidate('/api/works/'+id)]);
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
  async function worldForShare(document:WorldProject|Extract<ShareDesign,{format:'sinking-star-native-world'}>){
    if(!await backgroundGame())throw Error('请先连接 Steam 原游戏，以检查关卡依赖。');
    const engine=service();
    if(document.format==='sinking-star-world')return engine.adaptWorld(document);
    const native=await engine.adaptNativeWorld(document);
    return nativeWorkbench(native,await engine.nativeIndex(native));
  }
  async function projectImages(projectKey:string,manifest:ShareDraft['manifest'],coverId:string,cover?:string){
    const thumbnail=(id:string)=>library.thumbnail(projectKey,id).catch(()=>null);
    if(!cover)cover=(await thumbnail(coverId))?.image;
    const files=await Promise.all(manifest.levels.slice(0,12).map(async row=>[row.id,(await thumbnail(row.id))?.image] as const));
    const previews=Object.fromEntries(files.filter((entry):entry is readonly [string,string]=>Boolean(entry[1])));
    return {cover,previews};
  }
  function storeDraft(host:ReturnType<ProjectWindows['homeOwner']>,bundle:{bytes:Buffer;manifest:ShareDraft['manifest']},source:WorldProject,selected?:string,images:Pick<ShareDraft,'cover'|'previews'|'fullImages'>={previews:{}}){
    if(bundle.manifest.scope==='group')throw Error('这关依赖其他关卡。请选择可独立游玩的单关，或发布原来的完整工程。');
    const summary={id:randomUUID(),manifest:bundle.manifest,size:bundle.bytes.length,...images};
    if(!host.window.isDestroyed()){
      const id=hostId(host);
      if(!drafts.has(id))host.window.webContents.once('destroyed',()=>drafts.delete(id));
      drafts.set(id,{...summary,bytes:bundle.bytes,source,selected});
    }
    return summary;
  }
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
      const stage=entry.levels.find(scene=>scene.id===(id==='primary'?entry.primary:id));
      if(!stage)throw Error('关卡库中没有找到此关卡');
      return {level:await engine.preview(await engine.adaptProject(stage.project)),signature};
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
  handle('authorSignIn',(_host,input:CommunitySignIn)=>author.signIn(input));
  handle('authorRecovery',()=>author.recovery());
  handle('browse',(_host,route:string,refresh=false,localOnly=false)=>browse(route,refresh===true,localOnly===true));
  handle('request',async(_host,route,method,json)=>{
    if(route==='/api/account/session'&&(!method||method==='GET'))return {username:(await communityDeadline(communityTimeout,signal=>author.restore(signal)))?.username??null};
    if(route==='/api/account/logout'&&method==='POST')return author.logout();
    if(!route.startsWith('/api/works')||method&&method!=='GET'&&!/^\/api\/works\/[a-f0-9]{32}(?:\/report)?$/.test(route))throw Error('请使用专用社区操作入口');
    const reply=await request(route,method,json===undefined?undefined:JSON.stringify(json));
    if(method==='PATCH'||method==='DELETE')await invalidateWork(route.split('/')[3]);
    return JSON.parse(reply.bytes.toString());
  });
  handle('image',async(_host,route:string,version?:string,refresh=false)=>{
    if(!/^\/api\/works\/[a-f0-9]{32}\/(?:cover|previews\/[\w.-]{1,100})(?:\?size=full)?$/.test(route)||version!==undefined&&(typeof version!=='string'||version.length>40))throw Error('无效的社区图片');
    const entry=await images.get(communityImageKey(route,version),async()=>{
      const res=await send(route,'GET',undefined,undefined,undefined,undefined,{limit:route.endsWith('?size=full')?fullImageLimit:coverLimit});
      return res.headers.get('content-type')==='image/webp'?res.bytes:null;
    },{refresh:refresh===true,canUseStale:offlineCacheAllowed});
    return entry.bytes?'data:image/webp;base64,'+entry.bytes.toString('base64'):null;
  });
  handle('saveImage',async(host,image:string,title='关卡预览')=>{
    const bytes=imageBytes(image,fullImageLimit);
    const name=typeof title==='string'?title.replace(/[^\p{L}\p{N} _.-]/gu,'_').slice(0,80):'关卡预览';
    const choice=await dialog.showSaveDialog(host.window,{title:'保存预览图片',defaultPath:(name||'关卡预览')+'.webp',filters:[{name:'WebP 图片',extensions:['webp']}]});
    if(choice.canceled||!choice.filePath)return false;
    await atomicWrite(choice.filePath,bytes);
    return true;
  });
  handle('download',async(_host,id,level)=>{
    const {work,source,isLevel,cached,bytes}=await communityDeadline(communityTimeout,async signal=>{
      const metadata=await request('/api/works/'+id,'GET',undefined,undefined,undefined,{signal});
      const work=JSON.parse(metadata.bytes.toString()) as SharedWork;
      if(work.localSample)throw Error('此样本可在桌面首页打开');
      const isLevel=Boolean(level)||work.manifest.scope!=='project',source=community!.origin;
      if(isLevel){
        const cached=(await downloads.list()).find(row=>row.work===id&&row.source===source&&row.level===level&&row.version===work.version);
        if(cached&&await downloads.bytes(cached.key).catch(()=>null))return {work,source,isLevel,cached};
      }
      const res=await request(`/api/works/${id}/download${level?'?level='+encodeURIComponent(level):''}`,'GET',undefined,undefined,undefined,{limit:shareLimit,signal});
      if(res.headers.get('x-design-sha256')!==digest(res.bytes))throw Error('下载校验值不匹配');
      return {work,source,isLevel,bytes:res.bytes};
    });
    if(cached)return {kind:'level',item:cached};
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
    const world=await worldForShare(document);
    const engine=service();
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
  function shareDraft(host:ReturnType<ProjectWindows['homeOwner']>,id?:string){
    const draft=drafts.get(hostId(host));
    if(!draft)throw Error('请先准备分享包');
    if(id!==undefined&&id!==draft.id)throw Error('发布草稿已切换，请重新确认要发布的作品。');
    return draft;
  }
  handle('prepareShareFrom',async(host,choice:HomeShareSource)=>{
    if(choice.kind==='project'){
      const {document,row}=await library.inspect(choice.key);
      if(document.format==='sinking-star-project'){
        if(choice.level&&choice.level!==document.name)throw Error('关卡已变化，请刷新工程列表。');
        const bundle=encodeShare(document,'level',editorVersion);
        return storeDraft(host,bundle,singleWorld(document),document.name,await projectImages(choice.key,bundle.manifest,row.cover));
      }
      const source=await worldForShare(document);
      const bundle=await service().prepareShare(source,choice.level,editorVersion);
      return storeDraft(host,bundle,source,choice.level,await projectImages(choice.key,bundle.manifest,choice.level??row.cover));
    }
    if(choice.kind!=='library')throw Error('作品来源无效。');
    const bytes=await downloads.bytes(choice.key);
    const {manifest,design}=parseShare(bytes);
    if(choice.level&&!manifest.levels.some(row=>row.id===choice.level))throw Error('关卡已变化，请刷新关卡库。');
    const bundle=choice.level&&manifest.scope!=='level'?shareLevel(design,manifest,choice.level):{bytes,manifest};
    const selected=bundle.manifest.primaryId??bundle.manifest.levels[0].id;
    const selectedDesign=bundle.bytes!==bytes&&bundle.manifest.scope==='level'?parseShare(bundle.bytes).design:design;
    const source=selectedDesign.format==='sinking-star-project'?singleWorld(selectedDesign,bundle.manifest.levels[0].title,selected):
      selectedDesign.format==='sinking-star-world'?selectedDesign:await worldForShare(selectedDesign);
    const thumbnail=(!choice.level||choice.level===(manifest.primaryId??manifest.levels[0].id))?await downloads.thumbnail(choice.key):null;
    return storeDraft(host,bundle,source,selected,{cover:thumbnail?.image,previews:{}});
  });
  handle('shareDraft',host=>{const draft=drafts.get(hostId(host));if(!draft)return null;const {id,manifest,size,cover,previews,fullImages}=draft;return {id,manifest,size,cover,previews,fullImages};});
  handle('shareClear',(host,id?:string)=>{const key=hostId(host);if(id===undefined||drafts.get(key)?.id===id)drafts.delete(key);});
  handle('publishedThumbnail',async(_host,id:string,version:string,level:string,image?:string)=>{
    if(!/^[a-f0-9]{32}$/.test(id)||typeof version!=='string'||version.length>40||typeof level!=='string'||level.length>100)throw Error('预览来源无效');
    const key=JSON.stringify(['generated',id,version,level]);
    if(image!==undefined){await images.store(key,imageBytes(image));return null;}
    const bytes=await images.peek(key);
    return bytes?'data:image/webp;base64,'+bytes.toString('base64'):null;
  });
  handle('publishedPreview',async(_host,id:string,version:string,level:string,content?:string,source:CommunityPreviewSource='scene')=>{
    if(!/^[a-f0-9]{32}$/.test(id)||typeof version!=='string'||version.length>40||typeof level!=='string'||!/^[-\w.]{1,100}$/.test(level)||
      content!==undefined&&!/^[a-f0-9]{64}$/.test(content)||!['scene','standalone','stage','local'].includes(source))throw Error('预览来源无效');
    if(!await backgroundGame())throw Error('连接 Steam 游戏后可查看实时 3D');
    const engine=service();
    const local=(await downloads.list()).filter(item=>item.work===id&&item.version===version&&item.source===community?.origin&&item.manifest.levels.some(row=>row.id===level));
    for(const item of local){
      const bytes=await downloads.bytes(item.key).catch(()=>null);
      if(!bytes)continue;
      const {design,manifest}=parseShare(bytes),scene=previewScene(design,manifest,level);
      if(scene)return engine.preview(await engine.adaptProject(scene));
    }
    const key=JSON.stringify([id,content??version,level]);
    const entry=await sceneDesigns.get(key,async()=>{
      if(source==='local')throw Error('当前社区接口只能在线预览可独立下载的单关。这一关有依赖，可下载到关卡库预览。');
      const route='/api/works/'+id;
      return communityDeadline(communityTimeout,async signal=>{
        const query=(source==='scene'?'preview=1&':'')+'level='+encodeURIComponent(level);
        const reply=await request(route+'/download?'+query,'GET',undefined,undefined,undefined,{limit:scenePreviewLimit,signal}).catch(error=>{
          if(error instanceof CommunityResponseTooLarge)throw Error('关卡预览超过 512 KiB，可下载到关卡库预览');
          throw error;
        });
        if(reply.headers.get('x-design-sha256')!==digest(reply.bytes))throw Error('关卡预览文件校验失败');
        const {manifest}=parseShare(reply.bytes);
        if(manifest.scope!=='level')throw Error('此关需要其他关卡，可下载到关卡库预览');
        if(source==='scene'){
          if(reply.headers.get('x-sstar-scene-preview')!=='1')throw Error('社区服务暂未开放实时 3D 预览，请刷新作品详情');
          if(content&&reply.headers.get('x-sstar-work-content')!==content)throw Error('作品已更新，请刷新后再试');
        }else if(source==='standalone'){
          if(content&&manifest.sha256!==content)throw Error('作品已更新，请刷新后再试');
        }else{
          const current=await request(route,'GET',undefined,undefined,undefined,{signal});
          const work=JSON.parse(current.bytes.toString()) as SharedWork;
          if(manifest.levels[0]?.id!==level||work.version!==version||work.manifest.sha256!==content)throw Error('作品已更新，请刷新后再试');
        }
        return reply.bytes;
      });
    },{canUseStale:offlineCacheAllowed});
    if(!entry.bytes)throw Error('没有可用的关卡预览');
    const {design}=parseShare(entry.bytes);
    if(design.format!=='sinking-star-project')throw Error('预览文件不是单关');
    return engine.preview(await engine.adaptProject(design));
  });
  handle('sharePreview',async(host,level:string,id?:string)=>{
    const draft=shareDraft(host,id);
    if(!await backgroundGame())throw Error('请先连接 Steam 原游戏，再生成场景预览。');
    const engine=service();
    if(level==='world'){
      const selected=draft.source.levels.find(row=>row.id===draft.selected);
      return selected?engine.preview(await engine.adaptProject(selected.project)):engine.worldPreview(draft.source);
    }
    if(!draft.manifest.levels.some(row=>row.id===level))throw Error('该关卡不在分享范围');
    const scene=draft.source.levels.find(row=>row.id===level);
    if(!scene)throw Error('该关卡不在工程中');
    return engine.preview(await engine.adaptProject(scene.project));
  });
  function readImage(image:string|CommunityImage){
    return {thumbnail:imageBytes(typeof image==='string'?image:image.thumbnail),full:typeof image!=='string'&&image.full?imageBytes(image.full,fullImageLimit):undefined};
  }
  async function uploadImage(route:string,image:string|CommunityImage,fullPreview:boolean,signal?:AbortSignal){
    const {thumbnail,full}=readImage(image);
    if(!full||!fullPreview)return request(route,'POST',thumbnail,'image/webp',undefined,{limit:64*1024,signal});
    const size=Buffer.alloc(4);size.writeUInt32BE(thumbnail.length);
    return request(route+'?size=full','POST',Buffer.concat([size,thumbnail,full]),'application/octet-stream',undefined,{limit:64*1024,signal});
  }
  handle('shareImage',(host,level:string,image:string|CommunityImage,id?:string)=>{
    const draft=shareDraft(host,id);
    readImage(image);
    const thumbnail=typeof image==='string'?image:image.thumbnail;
    if(level==='world')draft.cover=thumbnail;
    else if(draft.manifest.levels.some(row=>row.id===level))draft.previews[level]=thumbnail;
    else throw Error('关卡不在分享范围');
    const full=typeof image==='string'?undefined:image.full;
    if(full)(draft.fullImages??={})[level]=full;
    else if(draft.fullImages)delete draft.fullImages[level];
  });
  handle('replaceImage',async(_host,id:string,level:string,image:string|CommunityImage,version?:string,fullPreview=false)=>{
    const ending=level==='world'?'cover':'previews/'+level;
    const route='/api/works/'+id+'/'+ending;
    await uploadImage(route,image,fullPreview===true);
    await images.invalidate(communityImageKey(route,version));
    await images.invalidate(communityImageKey(route+'?size=full',version));
    await invalidateWork(id);
  });
  handle('shareSave',async(host,id?:string)=>{
    const draft=shareDraft(host,id);
    const title=draft.manifest.levels.length===1?draft.manifest.levels[0].title:draft.manifest.title;
    const choice=await dialog.showSaveDialog(host.window,{title:'保存社区分享包',defaultPath:title.replace(/[<>:"/\\|?*]/g,'_')+shareExtension,filters:[{name:'沉星之序社区分享包',extensions:['gz']}]});
    if(choice.canceled||!choice.filePath)return null;
    const file=choice.filePath.toLowerCase().endsWith(shareExtension)?choice.filePath:choice.filePath.replace(/\.gz$/i,'')+shareExtension;
    await fs.writeFile(file,draft.bytes,{flag:'wx'});
    return file;
  });
  handle('publish',async(host,input)=>{
    const draft=shareDraft(host,input.draftId);
    const {title,description,version,id,images,tags}=input;
    const route=id?'/api/works/'+id:'/api/works';
    const metadata=JSON.stringify({title,description,version,tags});
    if(Buffer.byteLength(metadata)>4096)throw Error('作品说明过长');
    let work:(SharedWork&{warning?:string})|undefined;
    try{await communityDeadline(communityTimeout,async signal=>{
      const result=await request(route,id?'PATCH':'POST',draft.bytes,'application/gzip',Buffer.from(metadata).toString('base64'),{limit:64*1024,signal});
      signal.throwIfAborted();
      work=JSON.parse(result.bytes.toString()) as SharedWork;
      if(!images)return;
      const workId=work.id;
      const upload=(suffix:string,level:string,thumbnail:string)=>uploadImage(`/api/works/${workId}/${suffix}`,{thumbnail,full:draft.fullImages?.[level]},work?.fullImagePreview===true,signal);
      if(draft.cover&&input.cover!==false)await upload('cover','world',draft.cover);
      const selection=Array.isArray(input.previews)?new Set<string>(input.previews):null;
      const selected=draft.manifest.levels.filter(level=>draft.previews[level.id]&&(!selection||selection.has(level.id)));
      for(let start=0;start<selected.length;start+=4){
        signal.throwIfAborted();
        const results=await Promise.allSettled(selected.slice(start,start+4).map(level=>upload('previews/'+level.id,level.id,draft.previews[level.id])));
        const failure=results.find(result=>result.status==='rejected');
        if(failure)throw failure.reason;
      }
    });}catch(error){
      if(!work){
        if(error instanceof CommunityConnectionError)throw new CommunityConnectionError(error.message+' 重新发布前，请先刷新「我的发布」确认作品状态。',{cause:error});
        throw error;
      }
      work.warning=error instanceof CommunityConnectionError
        ?'作品已上架，部分预览图因网络问题未上传。连接 VPN 后可在详情中补传。'
        :'作品已上架，部分预览图未上传，可在作品详情中补传。';
    }
    if(!work)throw Error('社区未确认发布结果');
    await invalidateWork(work.id);
    if(drafts.get(hostId(host))===draft)drafts.delete(hostId(host));
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
  ipcMain.handle('home:prepare',async(event,project:WorldProject,level?:string,image?:string|CommunityImage)=>{
    const tab=editor(event),host=tab.owner;
    if(image)readImage(image);
    const cover=typeof image==='string'?image:image?.thumbnail;
    const bundle=await service().prepareShare(project,level,editorVersion);
    let images:Pick<ShareDraft,'cover'|'previews'|'fullImages'>={cover,previews:{}};
    if(tab.file){
      const key=await library.remember(tab.file);
      const row=(await library.inspect(key)).row;
      images=await projectImages(key,bundle.manifest,level??row.cover,cover);
    }
    if(typeof image==='object'&&image.full)images.fullImages={world:image.full};
    const summary=storeDraft(host,bundle,project,level,images);
    if(host.window.isDestroyed())return summary;
    windows.showHome(host);
    host.window.webContents.send('home:shareDraft');
    return summary;
  });
}
