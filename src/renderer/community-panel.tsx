import React,{useEffect,useState} from 'react';
import type {HomeApi,HomeProject} from '../home-types';
import {shareExpandedLimit,shareExtension,shareLimit,type ShareDraft,type ShareManifest,type SharedWork} from '../share-types';
import {Icon} from './studio-ui';
import {GroupedLevels} from './grouped-levels';
import {HubSidebar} from './hub-sidebar';
import {HubModal} from './hub-modal';
import {matchDirectory} from '../level-catalog';

type Bridge=Pick<HomeApi,'request'|'image'|'download'|'publish'|'shareSave'|'shareClear'|'communityUrl'|'shareImage'|'replaceImage'>;
const directories=[['projects','folder','工程'],['library','cube','关卡库']] as const;
type Directory=(typeof directories)[number][0];
const date=(n:string)=>new Date(n).toLocaleDateString('zh-CN');
const size=(n:number)=>n>=1024*1024?`${(n/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
const label=(scope:ShareManifest['scope'])=>scope==='level'?'单关':scope==='group'?'关卡组':'完整工程';
const errorText=(e:unknown)=>String(e).replace(/^(Error: )?(Error invoking remote method '[^']+': )?(Error: )?/,'');
const meta=(value:unknown)=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));
const workUrl=(id:string)=>'/api/works/'+id;
function workCover(item:SharedWork){
  if(item.cover)return workUrl(item.id)+'/cover';
  const level=item.manifest.scope==='level'?item.manifest.levels[0]?.id:undefined;
  return level&&item.previews.includes(level)?workUrl(item.id)+'/previews/'+encodeURIComponent(level):'';
}
export function Cover({src,alt='',className='',onError,zoomable=false}:{src:string;alt?:string;className?:string;onError?:()=>void;zoomable?:boolean}){
  const [large,setLarge]=useState(false),image=src&&<img src={src} alt={alt} loading="lazy" onError={onError}/>;
  return <><span className={'hub-cover '+className}>{image?zoomable?
    <button type="button" className="hub-cover-open" aria-label={alt?'放大预览 '+alt:'放大缩略图'} title="放大缩略图" onClick={()=>setLarge(true)}>{image}</button>:image
    :<span className="hub-cover-grid" aria-hidden="true"><Icon name="cube" size={26}/></span>}</span>
    {large&&src&&<HubModal title={alt||'关卡预览'} wide onClose={()=>setLarge(false)}><img className="hub-large-preview" src={src} alt={alt}/></HubModal>}
  </>;
}
function RemoteCover({bridge,route,alt,className,missing='作者未提供预览'}:{bridge?:Bridge;route:string;alt?:string;className?:string;missing?:string}){
  const [src,setSrc]=useState(''),[visible,setVisible]=useState(false),[failed,setFailed]=useState(false),[attempt,retry]=useState(0);
  const holder=React.useRef<HTMLSpanElement>(null);
  useEffect(()=>{if(!bridge||!holder.current)return;const observer=new IntersectionObserver(rows=>{if(rows.some(row=>row.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'100px'});observer.observe(holder.current);return()=>observer.disconnect();},[bridge]);
  useEffect(()=>{let live=true;setSrc('');setFailed(false);if(bridge&&visible&&route)void bridge.image(route).then(value=>{if(live){if(value)setSrc(value);else setFailed(true);}}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[bridge,route,visible,attempt]);
  return <span ref={holder} className="hub-cover-holder hub-remote-preview">
    <Cover src={failed?'':bridge?src:route&&route+(attempt?'?retry='+attempt:'')} alt={alt} className={className} zoomable onError={()=>{setFailed(true);}}/>
    {!route&&<small className="hub-thumb-state">{missing}</small>}
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
async function webRequest(route:string,method='GET',input?:unknown){
  const response=await fetch(route,{method,headers:input===undefined?undefined:{'content-type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});
  const result=await response.json();if(!response.ok)throw Error(result.error??'社区暂时不可用');return result;
}
async function webImage(file:File){
  if(file.size>8*1024*1024)throw Error('请选择 8 MB 以内的图片');
  const image=await createImageBitmap(file);
  try{
    const scale=Math.min(1,640/image.width,360/image.height),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片转换失败')),'image/webp',.78));
  }finally{image.close();}
}

export function CommunityPanel({bridge,draft,generatePreview,onDraftClear,onImported,onDownloads}:{bridge?:Bridge;draft?:ShareDraft|null;generatePreview?:(id:string)=>Promise<string>;onDraftClear?:()=>void;onImported?:(item:HomeProject)=>void;onDownloads?:()=>void}){
  const request=bridge?.request??webRequest;
  const [address,setAddress]=useState(bridge?'':location.origin),[editingAddress,setEditingAddress]=useState(false),[url,setUrl]=useState('');
  const [query,setQuery]=useState(''),[type,setType]=useState<Directory>('projects'),[page,setPage]=useState(0),[generation,refresh]=useState(0);
  const [works,setWorks]=useState<SharedWork[]>([]),[more,setMore]=useState(false),[loaded,setLoaded]=useState(false);
  const getHash=()=>!bridge?/^#work\/([a-f0-9]{32})$/.exec(location.hash)?.[1]??'':'';
  const [workId,setWorkId]=useState(getHash),[work,setWork]=useState<SharedWork|null>(null),[expanded,setExpanded]=useState<Record<string,boolean>>({});
  const [username,setUsername]=useState(''),[auth,setAuth]=useState<''|'login'|'signup'|'recover'>(''),[recovery,setRecovery]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [publishing,setPublishing]=useState(false),[update,setUpdate]=useState<SharedWork|null>(null),[file,setFile]=useState<File|null>(null),[metadata,setMetadata]=useState<ShareManifest|null>(null);
  const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[version,setVersion]=useState('1.0'),[images,setImages]=useState(false);
  const [report,setReport]=useState(false),[imagePreview,setImagePreview]=useState('');
  const [showDownloads,setShowDownloads]=useState(false),[previewLevel,setPreviewLevel]=useState('world'),[generated,setGenerated]=useState<Record<string,string>>({});
  const [selectedImages,setSelectedImages]=useState<string[]>([]),[replacement,setReplacement]=useState('world');
  const uploadFileEpoch=React.useRef(0);
  const currentManifest=draft?.manifest??metadata;

  useEffect(()=>{if(bridge)void bridge.communityUrl().then(value=>{setAddress(value);setUrl(value);}).catch(e=>setError(errorText(e)));},[bridge]);
  useEffect(()=>{if(bridge)return;const changed=()=>setWorkId(getHash());window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[bridge]);
  useEffect(()=>{
    if(!address)return;
    let live=true;
    void request('/api/account/session').then((result:any)=>{if(live)setUsername(result.username??'');}).catch(()=>{});
    return()=>{live=false;};
  },[address,request]);
  useEffect(()=>{
    if(!address||workId)return;
    let live=true;setLoaded(false);
    const timer=setTimeout(()=>{
      const params=new URLSearchParams({q:query,type,page:String(page)});
      void request('/api/works?'+params).then((result:any)=>{if(live){setWorks(result.works);setMore(result.more);setLoaded(true);setError('');}}).catch(e=>{if(live){setError(errorText(e));setLoaded(false);}});
    },180);
    return()=>{live=false;clearTimeout(timer);};
  },[address,request,query,type,page,workId,generation,username]);
  useEffect(()=>{
    if(!address||!workId)return;
    let live=true;setReplacement('world');
    void request(workUrl(workId)).then(value=>{if(live)setWork(value as SharedWork);}).catch(e=>{if(live)setError(errorText(e));});
    return()=>{live=false;};
  },[address,request,workId,generation,username]);
  useEffect(()=>{if(draft){setPublishing(true);setTitle(draft.manifest.scope==='project'?draft.manifest.title:draft.manifest.levels[0]?.title??draft.manifest.title);setPreviewLevel('world');setGenerated({});setSelectedImages([]);}},[draft]);
  useEffect(()=>()=>{if(imagePreview)URL.revokeObjectURL(imagePreview);},[imagePreview]);

  async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  function show(id:string){setWork(null);setWorkId(id);setError('');setReport(false);if(!bridge)location.hash=id?'work/'+id:'';}
  function selectDirectory(next:Directory){
    if(workId)show('');
    if(next===type)return;
    setType(next);setPage(0);setExpanded({});
  }
  function startPublish(existing?:SharedWork){setUpdate(existing??null);setTitle(existing?.title??(currentManifest?.levels.length===1?currentManifest.levels[0].title:currentManifest?.title)??'');setDescription(existing?.description??'');setVersion(existing?'':'1.0');setPublishing(true);setError('');setNotice('');}
  function closePublish(){setPublishing(false);setUpdate(null);setMetadata(null);setFile(null);setImagePreview('');setImages(false);setSelectedImages([]);if(draft)onDraftClear?.();}
  async function upload(image:File,id:string,level='world'){
    const bytes=await webImage(image);
    if(bridge){
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('读取图片失败'));reader.readAsDataURL(bytes);});
      await bridge.replaceImage(id,level,data);return;
    }
    const suffix=level==='world'?'cover':'previews/'+level,response=await fetch(workUrl(id)+'/'+suffix,{method:'POST',headers:{'content-type':'image/webp'},body:bytes});
    if(!response.ok)throw Error((await response.json()).error??'预览图上传失败');
  }
  function selectImage(id:string,checked:boolean){
    setSelectedImages(old=>{
      if(!checked)return old.filter(value=>value!==id);
      if(id!=='world'&&old.filter(value=>value!=='world').length>=12)return old;
      return [...new Set([...old,id])];
    });
  }
  async function generateImage(){
    if(!bridge||!generatePreview)return;
    const id=previewLevel,image=await generatePreview(id);
    await bridge.shareImage(id,image);
    setGenerated(old=>({...old,[id]:image}));
  }
  function download(id:string,level?:string){
    if(!bridge)return;
    void run(async()=>{
      const result=await bridge.download(id,level);
      if(result.kind==='project'){setShowDownloads(false);onImported?.(result.project);}
      else{setNotice('「'+result.item.name+'」已存入本机关卡库，可从其他工程导入。');setShowDownloads(true);}
    });
  }
  function downloadAction(item:SharedWork,level?:string){
    if(item.localSample)return null;
    const target=level?item.manifest.levels.find(l=>l.id===level):undefined;
    const text=target?.requires?.length?'下载所需关卡组':target?'下载此关':item.manifest.scope==='level'?'下载关卡':item.manifest.scope==='group'?'下载关卡组':'下载完整工程';
    const route=workUrl(item.id)+'/download'+(level?'?level='+encodeURIComponent(level):'');
    return bridge?<button className={level?'hub-button':'hub-primary'} disabled={busy} onClick={()=>download(item.id,level)}><Icon name="import"/>{text}</button>:<a className={level?'hub-button':'hub-primary'} href={route} download><Icon name="import"/>{text}</a>;
  }
  const draftImages=draft?{...draft.previews,...draft.cover?{world:draft.cover}:{},...generated}:{};
  const directory=(item:SharedWork,inSearch=false)=>{
    const match=matchDirectory(item.manifest.levels,item.manifest.groups,inSearch?query:'',[item.title,item.manifest.title,item.author,item.description]);
    return <GroupedLevels sections={match.sections} query={inSearch?query:''} reveal={inSearch&&!match.rootMatch} renderLevel={level=><div className="hub-level-row">
      <RemoteCover bridge={bridge} route={item.previews.includes(level.id)?workUrl(item.id)+'/previews/'+level.id:''} missing={item.localSample?'样本暂无预览':'作者未提供预览'}/>
      <div><strong>{level.title}</strong>{level.requires?.length?<small>还需 {level.requires.map(id=>item.manifest.levels.find(l=>l.id===id)?.title??id).join('、')}</small>:null}</div>{downloadAction(item,level.id)}
    </div>}/>;
  };
  const activeDirectory=workId&&work?.id===workId?(work.manifest.scope==='project'?'projects':'library'):type;
  const directoryTabs=bridge&&<div className="hub-segment" aria-label="社区浏览目录">
    {directories.map(([id,,title])=><button key={id} type="button" aria-pressed={activeDirectory===id} onClick={()=>selectDirectory(id)}>{title}</button>)}
  </div>;

  return <>
    {!bridge&&<HubSidebar label="社区导航">
      {directories.map(([id,icon,title])=><button key={id} type="button" aria-current={id===activeDirectory?'page':undefined} onClick={()=>selectDirectory(id)}><Icon name={icon}/>社区{title}</button>)}
    </HubSidebar>}
    <section className="hub-main" aria-labelledby="community-title">
    <header className="hub-header"><div><h1 id="community-title">关卡社区</h1></div><div className="hub-actions">
      {bridge&&<button className="hub-icon" title="社区地址" aria-label="社区地址" onClick={()=>setEditingAddress(v=>!v)}><Icon name="settings"/></button>}
      {address&&(username?<button className="hub-button" onClick={()=>void run(async()=>{await request('/api/account/logout','POST');setUsername('');setNotice('已退出登录。');})}><Icon name="user"/>{username} · 退出</button>:<button className="hub-button" onClick={()=>{setAuth('login');setRecovery('');}}><Icon name="user"/>登录</button>)}
      {address&&<button className="hub-primary" onClick={()=>startPublish()}><Icon name="export"/>发布作品</button>}
    </div></header>
    {bridge&&(!address||editingAddress)&&<form className="hub-form hub-card" onSubmit={e=>{e.preventDefault();void run(async()=>{setAddress(await bridge.communityUrl(url));setUsername('');setEditingAddress(false);});}}>
      <label>社区地址<input required type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label><button className="hub-primary">连接社区</button>
    </form>}
    {error&&<p className="hub-message hub-error" role="alert">{error}</p>}
    {notice&&<div className="hub-message hub-row" role="status"><span>{notice}</span>{showDownloads&&onDownloads&&<button type="button" className="hub-button" onClick={onDownloads}>查看本机关卡库</button>}</div>}
    {(recovery||auth)&&<section className="hub-card hub-dialog" aria-label="作者账号">
      <div className="hub-row"><h2>{recovery?'保存恢复码':auth==='signup'?'注册作者账号':auth==='recover'?'恢复账号':'作者登录'}</h2><button className="hub-icon" aria-label="关闭账号面板" onClick={()=>{setAuth('');setRecovery('');}}><Icon name="close"/></button></div>
      {recovery?<><p>请复制并妥善保存。恢复密码后会生成新的恢复码。</p><input readOnly value={recovery} aria-label="一次性恢复码" onFocus={e=>e.currentTarget.select()}/></>:<form className="hub-form" onSubmit={e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(e.currentTarget));const endpoint=auth;void run(async()=>{const result=await request('/api/account/'+endpoint,'POST',fields) as {username:string;recovery?:string};setUsername(result.username);setRecovery(result.recovery??'');setAuth('');});}}>
        <label>用户名<input name="username" required minLength={2} maxLength={32} autoComplete="username"/></label>
        {auth==='recover'&&<label>恢复码<input name="recovery" required maxLength={24} autoComplete="off"/></label>}
        <label>{auth==='recover'?'新密码':'密码'}<input name="password" type="password" minLength={10} maxLength={128} autoComplete={auth==='login'?'current-password':'new-password'} required/></label>
        <div className="hub-actions"><button className="hub-primary" disabled={busy}>{auth==='signup'?'注册':auth==='recover'?'重设密码':'登录'}</button><button className="hub-button" type="button" onClick={()=>setAuth(auth==='login'?'signup':'login')}>{auth==='login'?'注册':'返回登录'}</button>{auth==='login'&&<button className="hub-button" type="button" onClick={()=>setAuth('recover')}>恢复账号</button>}</div>
      </form>}
    </section>}
    {publishing&&<section className="hub-card hub-dialog" aria-label="发布作品"><div className="hub-row"><h2>{update?'发布新版本':'发布作品'}</h2><button className="hub-icon" aria-label="关闭发布面板" onClick={closePublish}><Icon name="close"/></button></div>
      {bridge&&!draft?<p>在编辑器的「导出与分享」窗口选择「分享当前关」或「分享整个工程」，即可生成发布预览。</p>:<form className="hub-form" onSubmit={e=>{e.preventDefault();const cover=new FormData(e.currentTarget).get('cover');void run(async()=>{
        if(!username)throw Error('请先登录作者账号');
        if(!address)throw Error('请先连接社区');
        let result:{id:string;warning?:string};
        if(bridge){result=await bridge.publish({title,description,version,id:update?.id,images,cover:selectedImages.includes('world'),previews:selectedImages.filter(id=>id!=='world')});}
        else{
          if(!file||!metadata)throw Error('请先选择社区分享包');
          const res=await fetch(update?workUrl(update.id):'/api/works',{method:update?'PATCH':'POST',headers:{'content-type':'application/gzip','x-work-meta':meta({title,description,version})},body:file});
          const reply=await res.json();if(!res.ok)throw Error(reply.error);result=reply;
          if(cover instanceof File&&cover.size)try{await upload(cover,result.id);}catch{result.warning='作品已上架，封面上传失败，可在详情中补传。';}
        }
        setNotice(result.warning??'作品已上架。');setType(currentManifest?.scope==='project'?'projects':'library');setPage(0);closePublish();show(result.id);refresh(n=>n+1);
      });}}>
        {!bridge&&<label>社区分享包<input type="file" required accept=".gz" onChange={e=>{const next=e.target.files?.[0],ticket=++uploadFileEpoch.current;setFile(null);setMetadata(null);if(next)void readPreview(next).then(v=>{if(ticket!==uploadFileEpoch.current)return;setFile(next);setMetadata(v);if(!title)setTitle(v.levels.length===1?v.levels[0]?.title??v.title:v.title);}).catch(err=>{if(ticket===uploadFileEpoch.current)setError(errorText(err));});}}/></label>}
        {currentManifest&&<div className="hub-preview-note"><b>{label(currentManifest.scope)} · {currentManifest.levels.length} 关</b><span>Build {currentManifest.sourceBuild} · {size(draft?.size??file?.size??0)}</span><span>{currentManifest.levels.slice(0,8).map(l=>l.title).join('、')}{currentManifest.levels.length>8?' …':''}</span></div>}
        <label>作品名称<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>简介<textarea maxLength={800} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <label>作品版本<input required maxLength={40} value={version} onChange={e=>setVersion(e.target.value)}/></label>
        {draft&&<fieldset className="hub-image-choice"><legend>生成并选择预览</legend>
          <div className="hub-actions"><select aria-label="要生成的预览" value={previewLevel} onChange={e=>setPreviewLevel(e.target.value)}><option value="world">作品封面</option>{draft.manifest.levels.map(level=><option key={level.id} value={level.id}>{level.title}</option>)}</select><button type="button" className="hub-button" disabled={busy} onClick={()=>void run(generateImage)}>生成预览</button></div>
          <label><input type="checkbox" checked={images} onChange={e=>setImages(e.target.checked)}/>公开选中的图片</label>
          <div className="hub-image-tray">{Object.entries(draftImages).map(([id,src])=><label key={id} className="hub-preview-choice"><Cover src={src}/><span><input type="checkbox" aria-label={id==='world'?'选择作品封面':'选择 '+draft.manifest.levels.find(l=>l.id===id)?.title} checked={selectedImages.includes(id)} disabled={!images||(!selectedImages.includes(id)&&id!=='world'&&selectedImages.filter(key=>key!=='world').length>=12)} onChange={e=>selectImage(id,e.target.checked)}/>{id==='world'?'作品封面':draft.manifest.levels.find(l=>l.id===id)?.title}</span></label>)}</div>
        </fieldset>}
        {!bridge&&<label>封面（可选）<input name="cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setImagePreview(e.target.files?.[0]?URL.createObjectURL(e.target.files[0]):'')}/>{imagePreview&&<Cover src={imagePreview} alt="即将公开的封面"/>}</label>}
        <div className="hub-actions"><button className="hub-primary" disabled={!address||busy||!currentManifest}>确认发布</button>{bridge&&draft&&<button type="button" className="hub-button" disabled={busy} onClick={()=>void run(async()=>{if(await bridge.shareSave())setNotice('分享包已保存。');})}>保存分享包</button>}</div>
      </form>}
    </section>}
    {address&&workId&&<><div className="hub-actions"><button className="hub-button" onClick={()=>selectDirectory(activeDirectory)}>‹ 返回作品列表</button>{directoryTabs}</div>{work?.id===workId?<article className="hub-work hub-card">
      <div className="hub-detail-intro"><RemoteCover bridge={bridge} route={workCover(work)} className="hub-detail-cover" alt={work.title}/>
      <div className="hub-detail-copy"><h2>{work.title}</h2><p className="hub-muted">{work.localSample?'本机样本 · Steam 原版目录':work.author+' · '+date(work.created)+' 发布 · 版本 '+work.version}</p>
      <p className="hub-description">{work.description||'作者未填写简介。'}</p>
      <p className="hub-muted">{label(work.manifest.scope)} · {work.manifest.levels.length} 关 · 游戏 Build {work.manifest.sourceBuild}{!work.localSample&&(' · 编辑器 '+work.manifest.editorVersion+' · '+size(work.size))}</p>
      {!work.localSample&&<div className="hub-actions">{downloadAction(work)}{work.owner&&<><button className="hub-button" onClick={()=>startPublish(work)}>发布新版本</button><button className="hub-button" disabled={busy} onClick={()=>{if(confirm('下架此作品？'))void run(async()=>{await request(workUrl(work.id),'DELETE');show('');setNotice('作品已下架。');});}}>下架</button></>}<button className="hub-button" onClick={()=>setReport(v=>!v)}>举报</button></div>}</div></div>
      {work.owner&&<form className="hub-form" onSubmit={e=>{e.preventDefault();const image=new FormData(e.currentTarget).get('image');if(image instanceof File&&image.size)void run(async()=>{await upload(image,work.id,replacement);refresh(n=>n+1);setNotice('预览图已更新。');});}}>
        <label>补传或更换预览<select value={replacement} onChange={e=>setReplacement(e.target.value)}><option value="world">作品封面</option>{work.manifest.levels.map(level=><option key={level.id} value={level.id}>{level.title}</option>)}</select></label>
        <label>图片文件<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required/></label><button className="hub-button" disabled={busy}>上传预览</button></form>}
      {report&&<form className="hub-form" onSubmit={e=>{e.preventDefault();const reason=new FormData(e.currentTarget).get('reason');void run(async()=>{await request(workUrl(work.id)+'/report','POST',{reason});setReport(false);setNotice('举报已提交。');});}}><label>举报理由<textarea name="reason" required maxLength={500}/></label><button className="hub-button" disabled={busy}>提交举报</button></form>}
      {work.manifest.scope!=='level'&&<section><h3>分组和关卡</h3>{directory(work)}</section>}
    </article>:!error&&<p className="hub-message">正在加载作品…</p>}</>}
    {address&&!workId&&<><div className="hub-filters">
      {directoryTabs}
      <label className="hub-search"><Icon name="search"/><input aria-label="搜索社区作品" placeholder={type==='projects'?'搜索工程、分组、关卡或作者':'搜索关卡、关卡组或作者'} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);setExpanded({});}}/></label></div>
      <div className="hub-projects">{works.map(item=>{
        const match=matchDirectory(item.manifest.levels,item.manifest.groups,query,[item.title,item.manifest.title,item.author,item.description]);
        const open=expanded[item.id]??Boolean(query.trim()&&!match.rootMatch&&match.count);
        return <article className="hub-project" key={item.id}><div className="hub-project-row hub-project-with-cover">
          <RemoteCover bridge={bridge} route={workCover(item)}/>
          <button type="button" className="hub-row-toggle" aria-expanded={open} onClick={()=>setExpanded(old=>({...old,[item.id]:!open}))}><span className="hub-project-text"><strong>{item.title}</strong><small>{item.author} · {label(item.manifest.scope)} · {item.manifest.levels.length} 关{query&&!match.rootMatch&&' · '+match.count+' 个匹配'}</small></span><Icon name={open?'down':'chevron'} size={16}/></button>
          <button className="hub-button" onClick={()=>show(item.id)}>查看详情 <Icon name="chevron" size={14}/></button></div>
          {open&&<div className="hub-levels">{directory(item,true)}</div>}
        </article>;
      })}</div>
      {loaded&&!works.length&&<div className="hub-empty"><Icon name={type==='library'?'cube':'world'} size={28}/><h2>{query?'找不到匹配的作品':type==='projects'?'暂无社区工程':'暂无单关或关卡组'}</h2>{query&&<button className="hub-button" onClick={()=>setQuery('')}>清除搜索</button>}</div>}
      {!loaded&&!error&&<p className="hub-message" role="status">正在读取作品…</p>}
      {(page>0||more)&&<div className="hub-actions hub-pagination"><button className="hub-button" disabled={!page} onClick={()=>setPage(n=>n-1)}>上一页</button><span>{page+1}</span><button className="hub-button" disabled={!more} onClick={()=>setPage(n=>n+1)}>下一页</button></div>}
    </>}
    </section>
  </>;
}
