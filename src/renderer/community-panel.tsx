import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {CommunityRead,HomeApi,HomeProject} from '../home-types';
import {shareExpandedLimit,shareExtension,shareLimit,tagLength,tagLimit,type CommunitySort,type CommunityImage,type ShareDraft,type ShareManifest,type SharedWork} from '../share-types';
import {Icon} from './studio-ui';
import {GroupedLevels,type LevelSection} from './grouped-levels';
import {HubSidebar} from './hub-sidebar';
import {HubModal} from './hub-modal';
import {matchDirectory} from '../level-catalog';
import {asDataUrl,communityImage,imageUploadBody} from './community-images';
import {ImageViewer} from './image-viewer';
import type {LevelView} from '../shared';
import {CommunityConnectionError,communityDeadline,communityTimeout} from '../community-network';

type Bridge=Pick<HomeApi,'request'|'browse'|'image'|'download'|'publish'|'shareSave'|'authorSignIn'|'authorRecovery'|'shareImage'|'replaceImage'|'publishedPreview'|'thumbnailSource'>;
type CommunityList={works:SharedWork[];more:boolean};
type CommunityNotice={text:string;target?:'projects'|'library'|{id:string}};
const recentPages=new Map<string,CommunityRead>();
let pagesRevision=0;
function rememberPage(key:string,result:CommunityRead){
  recentPages.delete(key);
  recentPages.set(key,result);
  if(recentPages.size>24)recentPages.delete(recentPages.keys().next().value!);
}
function clearPages(){recentPages.clear();pagesRevision++;}
const directories=[['projects','folder','工程'],['library','cube','单关']] as const;
type Directory=(typeof directories)[number][0];
const date=(n:string)=>new Date(n).toLocaleDateString('zh-CN');
const size=(n:number)=>n>=1024*1024?`${(n/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
const label=(scope:ShareManifest['scope'])=>scope==='level'?'单关':scope==='group'?'关卡组':'完整工程';
const errorText=(e:unknown)=>String(e).replace(/^(Error: )?(Error invoking remote method '[^']+': )?(Error: )?/,'');
const meta=(value:unknown)=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));
const workUrl=(id:string)=>'/api/works/'+id;
function parseTags(value:string){
  const tags=value.split(/[,，、\n]/).map(tag=>tag.trim()).filter(Boolean);
  if(tags.length>tagLimit||tags.some(tag=>tag.length>tagLength))throw Error(`最多 ${tagLimit} 个标签，每个不超过 ${tagLength} 字。`);
  return tags;
}
const vpnHint=(error:string)=>/无法连接关卡社区|连接关卡社区超时|fetch failed|failed to fetch|networkerror|load failed/i.test(error);
const primaryLevel=(work:SharedWork)=>work.manifest.primaryId??work.manifest.levels[0]?.id??'';
function workCover(item:SharedWork){
  if(item.cover)return workUrl(item.id)+'/cover';
  const primary=item.manifest.primaryId??item.manifest.levels[0]?.id;
  const level=primary&&item.previews.includes(primary)?primary:item.previews[0];
  return level?workUrl(item.id)+'/previews/'+encodeURIComponent(level):'';
}
const suggestedTags=['入门','普通','困难','专家','推箱子','光学','机关','探索'];
function TagEditor({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const tags=value.split(/[,，、]/).map(tag=>tag.trim()).filter(Boolean);
  function toggle(tag:string){
    const next=tags.includes(tag)?tags.filter(item=>item!==tag):[...new Set([...tags,tag])];
    onChange(next.join('，'));
  }
  return <div className="hub-tag-editor">
    <div className="hub-tags" aria-label="可选标签">
      {suggestedTags.map(tag=><button type="button" key={tag} aria-pressed={tags.includes(tag)} disabled={tags.length>=tagLimit&&!tags.includes(tag)} onClick={()=>toggle(tag)}>{tag}</button>)}
    </div>
    <input name="tags" aria-label="作品标签" value={value} onChange={e=>onChange(e.target.value)} maxLength={(tagLength+1)*tagLimit} placeholder="自定义标签，用逗号分隔"/>
  </div>;
}
export function Cover({src,alt='',className='',onError,zoomable=false,loadFull}:{src:string;alt?:string;className?:string;onError?:()=>void;zoomable?:boolean;loadFull?:()=>Promise<string|null>}){
  const [large,setLarge]=useState(false),image=src&&<img src={src} alt={alt} loading="lazy" onError={onError}/>;
  return <><span className={'hub-cover '+className}>{image?zoomable?
    <button type="button" className="hub-cover-open" aria-label={alt?'放大预览 '+alt:'放大缩略图'} title="放大缩略图" onClick={()=>setLarge(true)}>{image}</button>:image
    :<span className="hub-cover-grid" aria-hidden="true"><Icon name="cube" size={26}/></span>}</span>
    {large&&src&&<ImageViewer src={src} loadFull={loadFull} title={alt||'关卡预览'} close={()=>setLarge(false)}/>}
  </>;
}
function RemoteCover({bridge,route,alt,className,version,imageRevision,fullPreview}:{bridge?:Bridge;route:string;alt?:string;className?:string;version?:string;imageRevision:number;fullPreview?:boolean}){
  const [src,setSrc]=useState(''),[visible,setVisible]=useState(false),[failed,setFailed]=useState(false),[attempt,retry]=useState(0);
  const holder=React.useRef<HTMLSpanElement>(null);
  useEffect(()=>{if(!bridge||!holder.current)return;const observer=new IntersectionObserver(rows=>{if(rows.some(row=>row.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'100px'});observer.observe(holder.current);return()=>observer.disconnect();},[bridge]);
  useEffect(()=>{
    let live=true;setSrc('');setFailed(false);
    if(bridge&&route&&visible)void bridge.image(route,version,attempt>0||imageRevision>0)
      .then(image=>{if(live){setSrc(image??'');setFailed(!image);}}).catch(()=>{if(live)setFailed(true);});
    return()=>{live=false;};
  },[bridge,route,visible,attempt,version,imageRevision]);
  async function loadFull(){
    const fullRoute=route+'?size=full';
    if(bridge)return bridge.image(fullRoute,version);
    return communityDeadline(communityTimeout,async signal=>{
      const response=await fetch(fullRoute,{signal});
      return response.ok&&response.headers.get('content-type')==='image/webp'?asDataUrl(await response.blob()):null;
    });
  }
  return <span ref={holder} className="hub-cover-holder hub-remote-preview">
    <Cover src={failed?'':bridge?src:route&&route+(attempt?'?retry='+attempt:'')} alt={alt} className={className} zoomable
      loadFull={route&&fullPreview?loadFull:undefined}
      onError={()=>setFailed(true)}/>
    {failed&&<button type="button" className="hub-thumb-state" onClick={()=>{setFailed(false);retry(n=>n+1);}}>加载失败 · 重试</button>}
  </span>;
}
async function readPreview(file:File){
  if(file.size>shareLimit||!file.name.toLowerCase().endsWith(shareExtension))throw Error('选择 5 MiB 以内的社区分享包');
  const reader=file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks:Uint8Array[]=[];let total=0;
  try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>shareExpandedLimit)throw Error('解压大小超过 64 MiB');chunks.push(part.value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const decoded=new TextDecoder().decode(await new Blob(chunks as BlobPart[]).arrayBuffer()),{manifest}=JSON.parse(decoded);
  if(manifest?.format!=='sstar-share'||manifest.version!==1||!Array.isArray(manifest.levels))throw Error('无法识别分享包');
  return manifest as ShareManifest;
}
function webJson(route:string,init:RequestInit){
  return communityDeadline(communityTimeout,async signal=>{
    let response:Response,body:string;
    try{
      response=await fetch(route,{...init,signal});
      body=await response.text();
    }catch(error){
      signal.throwIfAborted();
      throw new CommunityConnectionError('无法连接关卡社区，请检查网络后重试。',{cause:error});
    }
    let result;
    try{result=JSON.parse(body);}catch(error){if(response.ok)throw error;}
    if(!response.ok)throw Error(result?.error??'社区暂时不可用');
    return result;
  });
}
function webRequest(route:string,method='GET',input?:unknown){
  return webJson(route,{method,headers:input===undefined?undefined:{'content-type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});
}
export function CommunityPanel({bridge,mine=false,visible=true,draft,generatePreview,onDraftClear,onImported,onDownloaded,onProjects,onDownloads,onChooseSource,onPublishBusy,connectionOffline,onConnectionChange,renderLive,onTemporaryPlay,playBusy,playback,renderGroupThumbnail}:{bridge?:Bridge;mine?:boolean;visible?:boolean;draft?:ShareDraft|null;generatePreview?:(id:string,compact:boolean,draftId:string)=>Promise<string|CommunityImage>;onDraftClear?:(id:string)=>void;onImported?:(item:HomeProject)=>void;onDownloaded?:()=>void;onProjects?:()=>void;onDownloads?:()=>void;onChooseSource?:()=>void;onPublishBusy?:(busy:boolean)=>void;connectionOffline?:boolean;onConnectionChange?:(online:boolean)=>void;onTemporaryPlay?:(id:string,level?:string)=>void;playBusy?:boolean;playback?:React.ReactNode;renderGroupThumbnail?:(level:LevelView)=>string;renderLive?:(props:{id:string;title:string;load:()=>Promise<LevelView|null>;close:()=>void;fallback:React.ReactNode})=>React.ReactNode}){
  const request=bridge?.request??webRequest;
  const [query,setQuery]=useState(''),[type,setType]=useState<Directory>('projects'),[page,setPage]=useState(0),[generation,refresh]=useState(0);
  const [tag,setTag]=useState(''),[sort,setSort]=useState<CommunitySort>('newest'),[editingInfo,setEditingInfo]=useState(false);
  const [tagInput,setTagInput]=useState(''),[editingTags,setEditingTags]=useState(''),[previewProgress,setPreviewProgress]=useState('');
  const getHash=()=>!bridge?/^#work\/([a-f0-9]{32})$/.exec(location.hash)?.[1]??'':'';
  const [three,setThree]=useState<{item:SharedWork;level:string;route:string}|null>(null);
  const [workId,setWorkId]=useState(getHash),[expanded,setExpanded]=useState<Record<string,boolean>>({});
  const [openGroups,setOpenGroups]=useState<Record<string,string[]>>({});
  const [thumbnailStatus,setThumbnailStatus]=useState<Record<string,string>>({});
  const thumbnailJobs=useRef(new Map<string,{cancelled:boolean;work:string}>());
  const thumbnailQueue=useRef(Promise.resolve());
  const [username,setUsername]=useState(''),[auth,setAuth]=useState<''|'login'|'signup'|'recover'|'device'|'device-recover'|'legacy'|'account'>(''),[recovery,setRecovery]=useState('');
  const [tasks,setTasks]=useState<ReadonlySet<string>>(()=>new Set()),[error,setError]=useState(''),[notice,setNotice]=useState<CommunityNotice|null>(null);
  const running=useRef(new Set<string>());
  const busy=tasks.has('action'),draftBusy=tasks.has('draft');
  const downloadCount=[...tasks].filter(key=>key.startsWith('download:')).length;
  const [readError,setReadError]=useState<{key:string;text:string}|null>(null);
  const [readResult,setReadResult]=useState<{key:string;revision:number;value:CommunityRead}|null>(null);
  const [checking,setChecking]=useState(false),[reviewPublication,setReviewPublication]=useState(false);
  const [imageRevision,changeImages]=useState(0);
  const [publishing,setPublishing]=useState(false),[update,setUpdate]=useState<SharedWork|null>(null),[file,setFile]=useState<File|null>(null),[metadata,setMetadata]=useState<ShareManifest|null>(null);
  const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[version,setVersion]=useState('1.0'),[images,setImages]=useState(false);
  const [report,setReport]=useState(false),[imagePreview,setImagePreview]=useState('');
  const [previewLevel,setPreviewLevel]=useState('world'),[generated,setGenerated]=useState<Record<string,string>>({});
  const [selectedImages,setSelectedImages]=useState<string[]>([]),[replacement,setReplacement]=useState('world');
  const uploadFileEpoch=React.useRef(0);
  const forceRoute=React.useRef('');
  const currentManifest=draft?.manifest??metadata;
  const params=new URLSearchParams({q:query.trim(),type,sort,page:String(page)});
  if(mine)params.set('mine','1');
  if(tag)params.set('tag',tag);
  const route=workId?workUrl(workId):'/api/works?'+params;
  const currentView=useRef({visible,route,draftId:draft?.id});
  useLayoutEffect(()=>{currentView.current={visible,route,draftId:draft?.id};},[visible,route,draft?.id]);
  const ownList=mine&&!workId;
  useEffect(()=>{
    setThree(null);
    return()=>{for(const job of thumbnailJobs.current.values())job.cancelled=true;thumbnailJobs.current.clear();};
  },[route,visible,mine]);
  const readKey=JSON.stringify([bridge&&!ownList?'':username,route]);
  const read=readResult?.key===readKey?readResult.value:recentPages.get(readKey);
  const catalog=!workId?read?.data as CommunityList|undefined:undefined;
  const works=catalog?.works??[],more=Boolean(catalog?.more),loaded=Boolean(catalog);
  const detail=workId?read?.data as SharedWork|undefined:undefined;
  const work=detail&&bridge?{...detail,owner:Boolean(username&&detail.author===username&&!detail.localSample)}:detail;
  const connectionError=readError?.key===readKey?readError.text:'';

  useEffect(()=>{
    if(!bridge)return;
    setWorkId('');setPage(0);setQuery('');setTag('');setExpanded({});setReadError(null);setEditingInfo(false);
  },[bridge,mine]);
  useEffect(()=>{if(bridge)return;const changed=()=>setWorkId(getHash());window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[bridge]);
  useEffect(()=>{
    if(!visible)return;
    let live=true;
    void request('/api/account/session').then((result:any)=>{if(live)setUsername(result.username??'');}).catch(()=>{});
    return()=>{live=false;};
  },[request,generation,visible]);
  useEffect(()=>{
    if(!visible||ownList&&!username){setChecking(false);return;}
    let live=true;
    const revision=pagesRevision;
    setChecking(forceRoute.current===route);
    setReadError(null);
    const apply=(value:CommunityRead)=>{
      if(!live||revision!==pagesRevision)return;
      if(value.stale)onConnectionChange?.(false);
      else if(value.checked){
        onConnectionChange?.(true);
        setError(previous=>vpnHint(previous)?'':previous);
      }
      const result=ownList?{...value,data:{...value.data as CommunityList,works:(value.data as CommunityList).works.filter(item=>item.owner)}}:value;
      rememberPage(readKey,result);
      setReadResult({key:readKey,revision,value:result});
    };
    const timer=setTimeout(async()=>{
      const force=forceRoute.current===route;
      if(force)forceRoute.current='';
      try{
        if(bridge&&!recentPages.has(readKey)){
          const local=await bridge.browse(route,false,true).catch(()=>null);
          if(local)apply(local);
          if(!live)return;
        }
        const result=bridge?await bridge.browse(route,force):{data:await webRequest(route),stale:false,checked:true as const};
        if(result)apply(result);
      }catch(error){
        if(!live||revision!==pagesRevision)return;
        recentPages.delete(readKey);
        setReadResult(null);
        const message=errorText(error);
        if(vpnHint(message))onConnectionChange?.(false);
        setReadError({key:readKey,text:message});
      }finally{if(live)setChecking(false);}
    },!workId&&query.trim()&&!recentPages.has(readKey)&&forceRoute.current!==route?180:0);
    return()=>{live=false;clearTimeout(timer);};
  },[bridge,route,readKey,generation,workId,ownList,onConnectionChange,visible]);
  useEffect(()=>setReplacement('world'),[workId]);
  useEffect(()=>{if(draft){
    const {manifest}=draft;
    setPublishing(true);setTitle(update?.title??(manifest.scope==='project'?manifest.title:manifest.levels.find(level=>level.id===manifest.primaryId)?.title??manifest.levels[0]?.title??manifest.title));
    setReviewPublication(false);setPreviewLevel('world');setGenerated({});setImages(true);setSelectedImages(['world',...manifest.scope==='level'?Object.keys(draft.previews):[]]);
  }},[draft]);
  useEffect(()=>()=>{if(imagePreview)URL.revokeObjectURL(imagePreview);},[imagePreview]);

  async function run(fn:()=>Promise<void>,key='action'){
    if(running.current.has(key))return;
    running.current.add(key);setTasks(new Set(running.current));setError('');
    if(key==='draft')onPublishBusy?.(true);
    try{await fn();}catch(e){
      const message=errorText(e);
      if(vpnHint(message))onConnectionChange?.(false);
      if(key==='draft'&&message.includes('重新发布前'))setReviewPublication(true);
      setError(message);
    }
    finally{
      running.current.delete(key);setTasks(new Set(running.current));
      if(key==='draft'){setPreviewProgress('');onPublishBusy?.(false);}
    }
  }
  function show(id:string){setWorkId(id);setError('');setReport(false);setEditingInfo(false);if(!bridge)location.hash=id?'work/'+id:'';}
  function refreshPage(){forceRoute.current=route;refresh(n=>n+1);}
  function refreshAfterChange(){clearPages();refresh(n=>n+1);}
  function selectDirectory(next:Directory){
    if(workId)show('');
    if(next===type)return;
    setType(next);setPage(0);setExpanded({});
  }
  function filterTag(next:string,directory:Directory){
    show('');setType(directory);setTag(next);setQuery('');setPage(0);setExpanded({});
  }
  function startPublish(existing?:SharedWork){
    setUpdate(existing??null);setTitle(existing?.title??'');setDescription(existing?.description??'');setTagInput(existing?.tags?.join('，')??'');setVersion(existing?'':'1.0');setError('');setNotice(null);
    if(bridge){onChooseSource?.();return;}
    setPublishing(true);
  }
  function logout(){void run(async()=>{await request('/api/account/logout','POST');clearPages();setUsername('');setAuth('');setRecovery('');if(mine)show('');refresh(n=>n+1);setNotice({text:'已退出登录。'});});}
  function closePublish(){setPublishing(false);setUpdate(null);setMetadata(null);setFile(null);setImagePreview('');setImages(false);setSelectedImages([]);setTagInput('');setReviewPublication(false);if(draft)onDraftClear?.(draft.id);}
  async function upload(image:File,id:string,level='world',version?:string,fullPreview=false){
    if(bridge){
      await bridge.replaceImage(id,level,await communityImage(image),version,fullPreview);return;
    }
    const bytes=await imageUploadBody(image,fullPreview);
    const suffix=level==='world'?'cover':'previews/'+level;
    await webJson(workUrl(id)+'/'+suffix+(fullPreview?'?size=full':''),{method:'POST',headers:{'content-type':bytes.type},body:bytes});
  }
  function selectImage(id:string,checked:boolean){
    setSelectedImages(old=>{
      if(!checked)return old.filter(value=>value!==id);
      return [...new Set([...old,id])];
    });
  }
  async function generateImage(){
    if(!bridge||!generatePreview||!draft)return;
    const id=previewLevel,image=await generatePreview(id,false,draft.id);
    await bridge.shareImage(id,image,draft.id);
    setGenerated(old=>({...old,[id]:typeof image==='string'?image:image.thumbnail}));
    selectImage(id,true);
  }
  function download(id:string,level?:string){
    if(!bridge)return;
    void run(async()=>{
      const result=await bridge.download(id,level);
      onConnectionChange?.(true);
      if(result.kind==='project'){
        onImported?.(result.project);
        setNotice({text:'「'+result.project.name+'」已下载到我的工程。',target:'projects'});
      }else{
        onDownloaded?.();
        setNotice({text:'「'+result.item.name+'」已存入本机关卡库，可从其他工程导入。',target:'library'});
      }
    },'download:'+id+':'+(level??''));
  }
  function downloadAction(item:SharedWork,level?:string){
    if(item.localSample)return null;
    const target=level?item.manifest.levels.find(l=>l.id===level):undefined;
    const text=target?.requires?.length?'下载所需关卡组':target?'下载此关':item.manifest.scope==='level'?'下载关卡':item.manifest.scope==='group'?'下载关卡组':'下载完整工程';
    const route=workUrl(item.id)+'/download'+(level?'?level='+encodeURIComponent(level):'');
    return bridge?<button className="hub-icon" title={text} aria-label={text} disabled={tasks.has('download:'+item.id+':'+(level??''))} onClick={()=>download(item.id,level)}><Icon name="import"/></button>:<a className="hub-icon" href={route} title={text} aria-label={text} download><Icon name="import"/></a>;
  }
  function tagsFor(item:SharedWork){
    return Boolean(item.tags?.length)&&<div className="hub-tags" aria-label="作品标签">{item.tags!.map(value=><button type="button" key={value} onClick={()=>filterTag(value,item.manifest.scope==='level'?'library':'projects')}>{value}</button>)}</div>;
  }
  function thumbnail(item:SharedWork,level?:string,className?:string){
    const route=level?item.previews.includes(level)?workUrl(item.id)+'/previews/'+encodeURIComponent(level):'':workCover(item);
    return <RemoteCover bridge={bridge} route={route} alt={level?item.manifest.levels.find(row=>row.id===level)?.title:item.title}
      version={item.version} className={className} imageRevision={imageRevision} fullPreview={item.fullImagePreview}/>;
  }
  function playAction(item:SharedWork,level?:string){
    if(!onTemporaryPlay||item.localSample)return null;
    const name=item.manifest.levels.find(stage=>stage.id===level)?.title??item.title;
    return <button className="hub-icon" type="button" title="临时试玩" aria-label={'临时试玩 '+name} disabled={playBusy} onClick={()=>onTemporaryPlay(item.id,level)}><Icon name="play"/></button>;
  }
  const groupKey=(item:SharedWork,group:LevelSection)=>JSON.stringify([item.id,item.version,group.id]);
  function toggleGroupThumbnails(item:SharedWork,group:LevelSection,open:boolean){
    if(!bridge||!renderGroupThumbnail||!(item.owner||username===item.author)||!visible||item.localSample)return;
    const key=groupKey(item,group);
    const existing=thumbnailJobs.current.get(key);
    if(!open){
      if(existing)existing.cancelled=true;
      thumbnailJobs.current.delete(key);
      return;
    }
    if(existing||group.levels.every(level=>item.previews.includes(level.id)))return;
    const job={cancelled:false,work:item.id};
    thumbnailJobs.current.set(key,job);
    const status=(message:string)=>{if(!job.cancelled)setThumbnailStatus(old=>({...old,[key]:message}));};
    status('等待补图…');
    thumbnailQueue.current=thumbnailQueue.current.then(async()=>{
      if(job.cancelled)return;
      let uploaded=0,skipped=0;
      try{
        const current=await bridge.request(workUrl(item.id)) as SharedWork;
        if(!current.owner||current.version!==item.version||current.manifest.sha256!==item.manifest.sha256)throw Error('作品已更新，请刷新后重试');
        const uploadedIds=new Set(current.previews);
        const missing=group.levels.filter(level=>!uploadedIds.has(level.id));
        for(const level of missing){
          if(job.cancelled)return;
          status(`正在补图 ${uploaded+skipped+1} / ${missing.length}`);
          let image:string;
          try{
            const scene=await bridge.thumbnailSource(item.id,item.version,item.manifest.sha256,level.id);
            if(job.cancelled)return;
            image=renderGroupThumbnail(scene);
          }catch(error){
            if(/Steam|社区|网络|超时/.test(errorText(error)))throw error;
            skipped++;
            continue;
          }
          await bridge.replaceImage(item.id,level.id,image,item.version);
          uploaded++;
          const update=(row:SharedWork)=>row.id===item.id&&row.version===item.version&&!row.previews.includes(level.id)
            ?{...row,previews:[...row.previews,level.id]}:row;
          setReadResult(previous=>{
            if(previous?.key!==readKey)return previous;
            const data=route.startsWith('/api/works?')
              ?{...previous.value.data as CommunityList,works:(previous.value.data as CommunityList).works.map(update)}
              :update(previous.value.data as SharedWork);
            return {...previous,value:{...previous.value,data}};
          });
        }
        status(skipped?`已补传 ${uploaded} 张，${skipped} 张生成失败。重新展开此组可重试。`:'');
      }catch(error){status(errorText(error)+'。重新展开此组可重试。');}
      finally{
        if(thumbnailJobs.current.get(key)===job)thumbnailJobs.current.delete(key);
        if(uploaded&&currentView.current.visible&&currentView.current.route===route)refreshAfterChange();
      }
    }).catch(()=>{});
  }
  function previewAction(item:SharedWork,level=primaryLevel(item)){
    if(!renderLive||!bridge||item.localSample||!level)return null;
    const title=item.manifest.levels.find(stage=>stage.id===level)?.title??item.title;
    return <button type="button" className="hub-icon" title="3D 预览" aria-label={'3D 预览 '+title} aria-haspopup="dialog" onClick={()=>setThree({item,level,route})}><Icon name="cube"/></button>;
  }
  function activePreview(){
    if(!visible||!bridge||!renderLive||!three||three.route!==route)return null;
    const {item,level}=three,stage=item.manifest.levels.find(stage=>stage.id===level);
    const source=item.scenePreview?'scene':item.manifest.scope==='level'?'standalone':stage&&!stage.requires?.length?'stage':'local';
    return renderLive({id:`${item.id}:${level}:${item.manifest.sha256}`,title:stage?.title??item.title,
      load:()=>bridge.publishedPreview(item.id,item.version,level,item.manifest.sha256,source),fallback:thumbnail(item,item.previews.includes(level)?level:undefined),close:()=>setThree(null)});
  }
  const draftImages:Record<string,string>=draft?{...draft.previews,...draft.cover?{world:draft.cover}:{},...generated}:{};
  const directory=(item:SharedWork,inSearch=false)=>{
    const match=matchDirectory(item.manifest.levels,item.manifest.groups,inSearch?query:'',[item.title,item.manifest.title,item.author,item.description,...item.tags??[]]);
    return <GroupedLevels sections={match.sections} query={inSearch?query:''} reveal={inSearch&&!match.rootMatch}
      openKeys={openGroups[item.id]??[]} onOpenKeys={keys=>setOpenGroups(old=>({...old,[item.id]:keys}))}
      onSectionToggle={(group,open)=>toggleGroupThumbnails(item,group,open)}
      sectionStatus={group=>thumbnailStatus[groupKey(item,group)]&&<small role="status">{thumbnailStatus[groupKey(item,group)]}</small>}
      renderLevel={level=><div className="hub-level-row">
      {thumbnail(item,level.id)}
      <div><strong>{level.title}</strong>{level.requires?.length?<small>还需 {level.requires.map(id=>item.manifest.levels.find(l=>l.id===id)?.title??id).join('、')}</small>:null}</div><div className="hub-actions">{previewAction(item,level.id)}{downloadAction(item,level.id)}{inSearch&&playAction(item,level.id)}</div>
    </div>}/>;
  };
  const activeDirectory=workId&&work?.id===workId?(work.manifest.scope==='level'?'library':'projects'):type;
  const publishOpen=publishing&&(!bridge||Boolean(draft));
  const publishedId=typeof notice?.target==='object'?notice.target.id:undefined;
  const actionError=error&&<p className="hub-message hub-error" role="alert">{error}{vpnHint(error)&&' 如果当前网络无法访问社区，请连接 VPN 后重试。'}</p>;
  const directoryTabs=bridge&&<div className="hub-segment" aria-label={mine?'已发布类型':'社区浏览类型'}>
    {directories.map(([id,,title])=><button key={id} type="button" aria-pressed={activeDirectory===id} onClick={()=>selectDirectory(id)}>{title}</button>)}
  </div>;

  return <>
    {!bridge&&<HubSidebar label="社区导航">
      {directories.map(([id,icon,title])=><button key={id} type="button" aria-current={id===activeDirectory?'page':undefined} onClick={()=>selectDirectory(id)}><Icon name={icon}/>社区{title}</button>)}
    </HubSidebar>}
    <section className="hub-main" hidden={!visible} aria-labelledby="community-title">
    <header className="hub-header"><div><h1 id="community-title">{mine?'我的发布':'关卡社区'}</h1></div><div className="hub-actions">
      {(!ownList||username)&&<button className="hub-icon" title="刷新社区" aria-label="刷新社区" disabled={checking} onClick={refreshPage}><Icon name="refresh"/></button>}
      {username?<button className="hub-button" onClick={bridge?()=>{setAuth('account');setRecovery('');}:logout}><Icon name="user"/>{username}{!bridge&&' · 退出'}</button>:<button className="hub-button" onClick={()=>{setAuth(bridge?'device':'login');setRecovery('');}}><Icon name="user"/>登录</button>}
      <button className="hub-primary" disabled={draftBusy||Boolean(draft)} onClick={()=>startPublish()}><Icon name="export"/>发布作品</button>
    </div></header>
    {checking&&<p className="hub-message" role="status">正在重新连接社区…</p>}
    {connectionError&&<div className="hub-message hub-error hub-row" role="alert"><span>{connectionError}{vpnHint(connectionError)&&' 如果当前网络无法访问社区，请连接 VPN 后重试。'}</span><button className="hub-button" disabled={checking} onClick={refreshPage}>重试</button></div>}
    {read?.stale&&<p className="hub-message" role="status">社区暂时无法刷新，正在显示本地缓存。如果当前网络无法访问社区，可以连接 VPN 后刷新。</p>}
    {connectionOffline&&!connectionError&&!read?.stale&&!vpnHint(error)&&<p className="hub-message" role="status">上次连接社区失败，可以连接 VPN 后刷新。</p>}
    {!publishOpen&&actionError}
    {downloadCount>0&&<p className="hub-message" role="status">{downloadCount===1?'正在下载作品…':`正在下载 ${downloadCount} 项作品…`}</p>}
    {notice&&<div className="hub-message hub-row" role="status"><span>{notice.text}</span>
      {notice.target==='library'&&onDownloads&&<button type="button" className="hub-button" onClick={onDownloads}>查看本机关卡库</button>}
      {notice.target==='projects'&&onProjects&&<button type="button" className="hub-button" onClick={onProjects}>查看我的工程</button>}
      {publishedId&&publishedId!==workId&&<button type="button" className="hub-button" onClick={()=>show(publishedId)}>查看作品</button>}
    </div>}
    {visible&&bridge&&auth&&<HubModal title={auth==='account'?'作者账号':auth==='device-recover'?'恢复作者账号':'作者登录'} onClose={()=>{setAuth('');setRecovery('');}}>
      {auth==='account'?<div className="hub-manage-form">
        <p>{username}</p>
        {recovery&&<label>一次性恢复码<input readOnly value={recovery} onFocus={e=>e.currentTarget.select()}/><small>请妥善保存，用于在新设备恢复作品管理权。</small></label>}
        {error&&<p className="hub-message hub-error" role="alert">{error}</p>}
        <div className="hub-actions"><button className="hub-button" disabled={busy} onClick={()=>void run(async()=>{const code=await bridge.authorRecovery();if(!code)throw Error('本机未保存恢复码。');setRecovery(code);})}>查看恢复码</button><button className="hub-button" disabled={busy} onClick={logout}>退出登录</button></div>
      </div>:<form className="hub-manage-form" onSubmit={e=>{
        e.preventDefault();
        const values=new FormData(e.currentTarget),name=String(values.get('username')??'');
        const input=auth==='device-recover'?{mode:'recover' as const,username:name,recovery:String(values.get('recovery')??'')}:auth==='legacy'?{mode:'legacy' as const,username:name,password:String(values.get('password')??'')}:{mode:'device' as const,username:name};
        void run(async()=>{setUsername((await bridge.authorSignIn(input)).username);setAuth('');});
      }}>
        <label>用户名<input name="username" autoFocus required minLength={2} maxLength={32} autoComplete="username"/></label>
        {auth==='device-recover'&&<label>恢复码<input name="recovery" required maxLength={24} autoComplete="off"/></label>}
        {auth==='legacy'&&<label>原账号密码<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="current-password"/></label>}
        {error&&<p className="hub-message hub-error" role="alert">{error}</p>}
        <div className="hub-actions">
          {auth==='device'?<><button type="button" className="hub-button" onClick={()=>{setError('');setAuth('legacy');}}>使用旧密码</button><button type="button" className="hub-button" onClick={()=>{setError('');setAuth('device-recover');}}>使用恢复码</button></>:<button type="button" className="hub-button" onClick={()=>{setError('');setAuth('device');}}>返回</button>}
          <button className="hub-primary" disabled={busy}>{auth==='device-recover'?'恢复并登录':'登录'}</button>
        </div>
      </form>}
    </HubModal>}
    {!bridge&&(recovery||auth)&&<section className="hub-card hub-dialog" aria-label="作者账号">
      <div className="hub-row"><h2>{recovery?'保存恢复码':auth==='signup'?'注册作者账号':auth==='recover'?'恢复账号':'作者登录'}</h2><button className="hub-icon" aria-label="关闭账号面板" onClick={()=>{setAuth('');setRecovery('');}}><Icon name="close"/></button></div>
      {recovery?<><p>请复制并妥善保存。恢复密码后会生成新的恢复码。</p><input readOnly value={recovery} aria-label="一次性恢复码" onFocus={e=>e.currentTarget.select()}/></>:<form className="hub-form" onSubmit={e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(e.currentTarget));const endpoint=auth;void run(async()=>{const result=await request('/api/account/'+endpoint,'POST',fields) as {username:string;recovery?:string};setUsername(result.username);setRecovery(result.recovery??'');setAuth('');});}}>
        <label>用户名<input name="username" required minLength={2} maxLength={32} autoComplete="username"/></label>
        {auth==='recover'&&<label>恢复码<input name="recovery" required maxLength={24} autoComplete="off"/></label>}
        <label>{auth==='recover'?'新密码':'密码'}<input name="password" type="password" minLength={10} maxLength={128} autoComplete={auth==='login'?'current-password':'new-password'} required/></label>
        <div className="hub-actions"><button className="hub-primary" disabled={busy}>{auth==='signup'?'注册':auth==='recover'?'重设密码':'登录'}</button><button className="hub-button" type="button" onClick={()=>setAuth(auth==='login'?'signup':'login')}>{auth==='login'?'注册':'返回登录'}</button>{auth==='login'&&<button className="hub-button" type="button" onClick={()=>setAuth('recover')}>恢复账号</button>}</div>
      </form>}
    </section>}
    {publishOpen&&<section className="hub-card hub-dialog" aria-label="发布作品"><div className="hub-row"><h2>{update?'发布新版本':'发布作品'}</h2><button className="hub-icon" aria-label="关闭发布面板" disabled={draftBusy} onClick={closePublish}><Icon name="close"/></button></div>
      <form className="hub-form" onSubmit={e=>{e.preventDefault();const cover=new FormData(e.currentTarget).get('cover');void run(async()=>{
        if(!username){setAuth(bridge?'device':'login');return;}
        const tags=parseTags(tagInput);
        let result:{id:string;warning?:string;fullImagePreview?:boolean};
        if(bridge&&draft){
          const customCover=cover instanceof File&&cover.size>0;
          const attachCover=customCover||images&&selectedImages.includes('world');
          let noThumbnail=false;
          if(customCover)await bridge.shareImage('world',await communityImage(cover),draft.id);
          else if(attachCover&&!draft?.fullImages?.world&&!generated.world){
            try{
              const primary=currentManifest?.primaryId??currentManifest?.levels[0]?.id;
              const thumbnail=await generatePreview?.('world',false,draft.id)??draftImages.world??(primary?draftImages[primary]:undefined);
              if(!thumbnail)throw Error('没有可用的缩略图');
              await bridge.shareImage('world',thumbnail,draft.id);
            }catch{noThumbnail=true;}
          }
          const previews=new Set(images?selectedImages.filter(id=>id!=='world'&&(draft.manifest.scope==='level'||Object.hasOwn(generated,id))):[]);
          // Complete projects publish their cover first. Opening a group runs its own image queue.
          const missing=draft.manifest.scope==='level'?draft.manifest.levels.filter(level=>!draftImages[level.id]):[];
          if(images&&generatePreview){
            for(const [index,level] of missing.entries()){
              setPreviewProgress(`正在生成关卡缩略图 ${index+1} / ${missing.length}`);
              try{
                if(currentView.current.draftId!==draft.id)throw Error('发布草稿已切换，请重新确认。');
                await bridge.shareImage(level.id,await generatePreview(level.id,true,draft.id),draft.id);
                previews.add(level.id);
              }catch{noThumbnail=true;}
            }
          }
          setPreviewProgress('正在发布作品和关卡缩略图…');
          setReviewPublication(false);
          result=await bridge.publish({title,description,version,tags,id:update?.id,draftId:draft.id,images:images||customCover,cover:attachCover,previews:[...previews]});
          if(noThumbnail&&!result.warning)result.warning='作品已上架，部分缩略图生成失败，可在作品详情补传。';
        }
        else{
          if(!file||!metadata)throw Error('请先选择社区分享包');
          result=await webJson(update?workUrl(update.id):'/api/works',{method:update?'PATCH':'POST',headers:{'content-type':'application/gzip','x-work-meta':meta({title,description,version,tags})},body:file});
          if(cover instanceof File&&cover.size)try{await upload(cover,result.id,'world',undefined,result.fullImagePreview===true);}catch{result.warning='作品已上架，封面上传失败，可在详情中补传。';}
        }
        onConnectionChange?.(!result.warning?.includes('VPN'));
        setNotice({text:result.warning??'作品已上架。',target:{id:result.id}});
        const sameDraft=currentView.current.draftId===draft?.id;
        if(sameDraft){
          closePublish();
          if(currentView.current.visible&&currentView.current.route===route){setType(currentManifest?.scope==='project'?'projects':'library');setPage(0);show(result.id);}
        }
        refreshAfterChange();
      },'draft');}}>
        {!bridge&&<label>社区分享包<input type="file" required accept=".gz" onChange={e=>{const next=e.target.files?.[0],ticket=++uploadFileEpoch.current;setFile(null);setMetadata(null);if(next)void readPreview(next).then(v=>{if(ticket!==uploadFileEpoch.current)return;setFile(next);setMetadata(v);if(!title)setTitle(v.levels.length===1?v.levels[0]?.title??v.title:v.title);}).catch(err=>{if(ticket===uploadFileEpoch.current)setError(errorText(err));});}}/></label>}
        {currentManifest&&<div className="hub-preview-note"><b>{label(currentManifest.scope)} · {currentManifest.levels.length} 关</b><span>Build {currentManifest.sourceBuild} · {size(draft?.size??file?.size??0)}</span><span>{currentManifest.levels.slice(0,8).map(l=>l.title).join('、')}{currentManifest.levels.length>8?' …':''}</span></div>}
        <label>作品名称<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>简介<textarea maxLength={800} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <TagEditor value={tagInput} onChange={setTagInput}/>
        <label>作品版本<input required maxLength={40} value={version} onChange={e=>setVersion(e.target.value)}/></label>
        {draft&&<fieldset className="hub-image-choice"><legend>生成并选择预览</legend>
          <div className="hub-actions"><select aria-label="要生成的预览" value={previewLevel} onChange={e=>setPreviewLevel(e.target.value)}><option value="world">作品封面</option>{draft.manifest.levels.map(level=><option key={level.id} value={level.id}>{level.title}</option>)}</select><button type="button" className="hub-button" disabled={draftBusy} onClick={()=>void run(generateImage,'draft')}>生成预览</button></div>
          <label className="hub-image-enabled"><input type="checkbox" checked={images} onChange={e=>setImages(e.target.checked)}/>公开选中的图片</label>
          {Object.keys(draftImages).length>0&&<div className="hub-image-tray">{Object.entries(draftImages).filter(([id])=>id==='world'||draft.manifest.scope==='level'||Object.hasOwn(generated,id)).map(([id,src])=><label key={id} className="hub-preview-choice">
            <Cover src={src}/>
            <span className="hub-preview-toggle"><input type="checkbox" aria-label={id==='world'?'选择作品封面':'选择 '+draft.manifest.levels.find(l=>l.id===id)?.title} checked={selectedImages.includes(id)} disabled={!images||draftBusy} onChange={e=>selectImage(id,e.target.checked)}/><span>{id==='world'?'作品封面':draft.manifest.levels.find(l=>l.id===id)?.title}</span></span>
          </label>)}</div>}
        </fieldset>}
        <label>{bridge?'自定义封面（可选，默认使用场景缩略图）':'封面（可选）'}<input name="cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setImagePreview(e.target.files?.[0]?URL.createObjectURL(e.target.files[0]):'')}/>{imagePreview&&<Cover src={imagePreview} alt="即将公开的封面"/>}</label>
        {previewProgress&&<p className="hub-message" role="status">{previewProgress}</p>}
        {actionError}
        {reviewPublication&&!vpnHint(error)&&<p className="hub-message" role="status">重新发布前，请先查看「我的发布」确认作品状态。</p>}
        <div className="hub-actions"><button className="hub-primary" disabled={draftBusy||!currentManifest}>{bridge&&!username?'登录后发布':'确认发布'}</button>{bridge&&draft&&<button type="button" className="hub-button" disabled={draftBusy} onClick={()=>void run(async()=>{if(await bridge.shareSave(draft.id))setNotice({text:'分享包已保存。'});},'draft')}>保存分享包</button>}</div>
      </form>
    </section>}
    {playback}
    {activePreview()}
    {workId&&<><div className="hub-actions"><button className="hub-button" onClick={()=>mine?show(''):selectDirectory(activeDirectory)}>{mine?'‹ 返回我的发布':'‹ 返回作品列表'}</button>{directoryTabs}</div>{work?.id===workId?<article className="hub-work hub-card">
      <div className="hub-detail-intro">{thumbnail(work,undefined,'hub-detail-cover')}
      <div className="hub-detail-copy"><h2>{work.title}</h2><p className="hub-muted">{work.localSample?'本机样本 · Steam 原版目录':work.author+' · '+date(work.created)+' 发布 · 版本 '+work.version}</p>
      <p className="hub-description">{work.description||'作者未填写简介。'}</p>
      {tagsFor(work)}
      <p className="hub-muted">{label(work.manifest.scope)} · {work.manifest.levels.length} 关 · 游戏 Build {work.manifest.sourceBuild}{!work.localSample&&(' · 编辑器 '+work.manifest.editorVersion+' · '+size(work.size))}</p>
      {!work.localSample&&<div className="hub-actions">{previewAction(work)}{downloadAction(work)}{work.owner&&<>{bridge&&<button className="hub-icon" title="修改作品信息" aria-label="修改作品信息" onClick={()=>{setError('');setEditingTags(work.tags?.join('，')??'');setEditingInfo(true);}}><Icon name="rename"/></button>}<button className="hub-icon" title="发布新版本" aria-label="发布新版本" disabled={draftBusy||Boolean(draft)} onClick={()=>startPublish(work)}><Icon name="export"/></button><button className="hub-icon hub-remove" title="下架" aria-label="下架" disabled={busy} onClick={()=>{if(confirm('下架此作品？'))void run(async()=>{await request(workUrl(work.id),'DELETE');if(currentView.current.visible&&currentView.current.route===route)show('');setNotice({text:'作品已下架。'});refreshAfterChange();});}}><Icon name="trash"/></button></>}{!work.owner&&<button className="hub-icon" title="举报" aria-label="举报" onClick={()=>setReport(v=>!v)}><Icon name="warning"/></button>}</div>}</div></div>
      {visible&&work.owner&&editingInfo&&<HubModal title="修改作品信息" onClose={()=>setEditingInfo(false)}>
        <form className="hub-manage-form" onSubmit={event=>{
          event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));
          void run(async()=>{await request(workUrl(work.id),'PATCH',{title:data.title,description:data.description,tags:parseTags(String(data.tags??''))});if(currentView.current.route===route)setEditingInfo(false);setNotice({text:'作品信息已更新。'});refreshAfterChange();});
        }}>
          <label>作品名称<input name="title" autoFocus required maxLength={100} defaultValue={work.title}/></label>
          <label>简介<textarea name="description" maxLength={800} defaultValue={work.description}/></label>
          <TagEditor value={editingTags} onChange={setEditingTags}/>
          {error&&<p className="hub-message hub-error" role="alert">{error}</p>}
          <div className="hub-actions"><button type="button" className="hub-button" onClick={()=>setEditingInfo(false)}>关闭</button><button className="hub-primary" disabled={busy}>保存修改</button></div>
        </form>
      </HubModal>}
      {bridge&&work.owner&&work.manifest.scope==='project'&&work.manifest.levels.length>work.previews.length&&<small className="hub-muted">展开关卡组后补传这一组缺少的缩略图。</small>}
      {work.owner&&<form className="hub-form" onSubmit={e=>{e.preventDefault();const image=new FormData(e.currentTarget).get('image');if(image instanceof File&&image.size)void run(async()=>{await upload(image,work.id,replacement,work.version,work.fullImagePreview===true);changeImages(n=>n+1);refreshAfterChange();setNotice({text:'预览图已更新。'});});}}>
        <label>补传或更换预览<select value={replacement} onChange={e=>setReplacement(e.target.value)}><option value="world">作品封面</option>{work.manifest.levels.map(level=><option key={level.id} value={level.id}>{level.title}</option>)}</select></label>
        <label>图片文件<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required/></label><button className="hub-button" disabled={busy}>上传预览</button></form>}
      {report&&<form className="hub-form" onSubmit={e=>{e.preventDefault();const reason=new FormData(e.currentTarget).get('reason');void run(async()=>{await request(workUrl(work.id)+'/report','POST',{reason});if(currentView.current.route===route)setReport(false);setNotice({text:'举报已提交。'});});}}><label>举报理由<textarea name="reason" required maxLength={500}/></label><button className="hub-button" disabled={busy}>提交举报</button></form>}
      {work.manifest.scope!=='level'&&<section><h3>分组和关卡</h3>{directory(work)}</section>}
    </article>:!connectionError&&<p className="hub-message">正在加载作品…</p>}</>}
    {!workId&&<><div className="hub-filters">
      {directoryTabs}
      <label className="hub-search"><Icon name="search"/><input aria-label="搜索社区作品" placeholder={mine?'搜索自己的作品':type==='projects'?'搜索工程、关卡、作者或标签':'搜索关卡、作者或标签'} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);setExpanded({});}}/></label>
      <label className="hub-sort"><Icon name="clock"/><select aria-label="按时间排序" value={sort} onChange={e=>{setSort(e.target.value as CommunitySort);setPage(0);setExpanded({});}}><option value="newest">最新发布</option><option value="oldest">最早发布</option><option value="updated">最近更新</option></select></label>
      {tag&&<button className="hub-button" title="清除标签筛选" aria-label={'清除标签筛选 '+tag} onClick={()=>{setTag('');setPage(0);}}>{tag}<Icon name="close" size={14}/></button>}</div>
      <div className="hub-projects">{works.map(item=>{
        const match=matchDirectory(item.manifest.levels,item.manifest.groups,query,[item.title,item.manifest.title,item.author,item.description,...item.tags??[]]);
        const grouped=item.manifest.scope!=='level';
        const open=grouped&&(expanded[item.id]??Boolean(query.trim()&&!match.rootMatch&&match.count));
        return <article className="hub-project" key={item.id}><div className="hub-project-row hub-project-with-cover">
          {thumbnail(item)}
          <div className="hub-work-summary">
            <button type="button" className="hub-row-toggle" aria-expanded={grouped?open:undefined} onClick={()=>{
              if(!grouped){show(item.id);return;}
              if(open){
                for(const [key,job] of thumbnailJobs.current)if(job.work===item.id){job.cancelled=true;thumbnailJobs.current.delete(key);}
                setOpenGroups(old=>({...old,[item.id]:[]}));
              }
              setExpanded(old=>({...old,[item.id]:!open}));
            }}><span className="hub-project-text"><strong>{item.title}</strong><small>{item.author} · {label(item.manifest.scope)}{grouped&&` · ${item.manifest.levels.length} 关`} · {date(sort==='updated'?item.updated:item.created)}{query&&!match.rootMatch&&' · '+match.count+' 个匹配'}</small></span>{grouped&&<Icon name={open?'down':'chevron'} size={16}/>}</button>
            {tagsFor(item)}
          </div>
          <div className="hub-actions hub-community-row-actions">
            {!grouped&&previewAction(item)}{!grouped&&downloadAction(item)}{playAction(item)}
            <button className="hub-icon" title={mine?'管理作品':'查看详情'} aria-label={mine?'管理作品':'查看详情'} onClick={()=>show(item.id)}><Icon name={mine?'settings':'chevron'}/></button>
          </div></div>
          {open&&<div className="hub-levels">{directory(item,true)}</div>}
        </article>;
      })}</div>
      {loaded&&!works.length&&<div className="hub-empty"><Icon name={type==='library'?'cube':'world'} size={28}/><h2>{query||tag?'找不到匹配的作品':mine?(type==='projects'?'你还没有发布工程':'你还没有发布单关'):type==='projects'?'暂无社区工程':'暂无单关'}</h2>{(query||tag)&&<button className="hub-button" onClick={()=>{setQuery('');setTag('');setPage(0);}}>清除筛选</button>}</div>}
      {mine&&!username?<p className="hub-message">登录后即可查看和管理自己发布的作品。</p>:!loaded&&!connectionError&&<p className="hub-message" role="status">正在读取作品…</p>}
      {(page>0||more)&&<div className="hub-actions hub-pagination"><button className="hub-button" disabled={!page} onClick={()=>setPage(n=>n-1)}>上一页</button><span>{page+1}</span><button className="hub-button" disabled={!more} onClick={()=>setPage(n=>n+1)}>下一页</button></div>}
    </>}
    </section>
  </>;
}
