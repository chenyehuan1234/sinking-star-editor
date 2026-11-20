import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {DownloadedLevel,HomeDirectory,HomeProject,LibraryAddResult} from '../home-types';
import type {ShareDraft} from '../share-types';
import type {PreparationProgress as PlayProgress} from '../shared';
import {matchDirectory,searchKey} from '../level-catalog';
import {CommunityPanel} from './community-panel';
import {GroupedLevels} from './grouped-levels';
import {HubSidebar} from './hub-sidebar';
import {HubModal} from './hub-modal';
import {PreparationProgress} from './preparation-progress';
import {ProjectCover} from './project-cover';
import {renderScenePreview,withDeadline} from './scene-preview';
import {Icon} from './studio-ui';
import './workbench-home.css';

type Page='local'|'library'|'community';
type ManageItem={scope:'project'|'library';key:string;name:string;operation:'rename'|'remove';missing?:boolean};
const pages=[['local','folder','我的工程'],['library','cube','关卡库'],['community','world','关卡社区']] as const;

export function ProjectHome({active,onAction}:{active:boolean;onAction:(command:'new'|'new-level'|'open'|'native')=>void}){
  const api=window.workbenchHome!;
  const [page,setPage]=useState<Page>('local'),[entries,setEntries]=useState<HomeProject[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [directories,setDirectories]=useState<Record<string,HomeDirectory>>({}),[downloads,setDownloads]=useState<DownloadedLevel[]>([]);
  const [opened,setOpened]=useState<string[]>([]),[searchOpened,setSearchOpened]=useState<Record<string,boolean>>({});
  const [groups,setGroups]=useState<Record<string,string[]>>({}),[query,setQuery]=useState(''),[downloadQuery,setDownloadQuery]=useState('');
  const [libraryFilter,setLibraryFilter]=useState<'local'|'community'>('local');
  const [playStatus,setPlayStatus]=useState(''),[playProgress,setPlayProgress]=useState<PlayProgress|null>(null);
  const [picking,setPicking]=useState<{key:string;ids:string[]}|null>(null);
  const [collected,setCollected]=useState<{key:string;result:LibraryAddResult}|null>(null);
  const [menu,setMenu]=useState(false),[draft,setDraft]=useState<ShareDraft|null>(null);
  const [selected,setSelected]=useState<HomeProject|null>(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
  const [manage,setManage]=useState<ManageItem|null>(null),[newName,setNewName]=useState(''),[manageError,setManageError]=useState('');
  const scroller=useRef<HTMLDivElement>(null),previousScroll=useRef<number|null>(null),generation=useRef(0);
  async function load(){
    const ticket=++generation.current;
    setLoading(true);
    try{
      const result=await api.catalog();
      if(ticket===generation.current){setEntries(result.projects);setDirectories(result.directories);setRevision(n=>n+1);}
    }catch(e){if(ticket===generation.current)setError(String(e));}
    finally{if(ticket===generation.current)setLoading(false);}
  }
  useEffect(()=>{
    if(active&&page==='local')void load();
    if(active&&page==='library')void api.downloads().then(setDownloads).catch(e=>setError(String(e)));
  },[active,page]);
  useEffect(()=>api.onShareDraft(()=>{void api.shareDraft().then(value=>{setDraft(value);if(value)setPage('community');}).catch(e=>setError(String(e)));}),[api]);
  useEffect(()=>api.onLibraryPlayProgress((message,progress)=>{setPlayStatus(message);setPlayProgress(progress??null);}),[api]);
  useLayoutEffect(()=>{
    if(!query&&page==='local'&&previousScroll.current!==null&&scroller.current){
      scroller.current.scrollTop=previousScroll.current;previousScroll.current=null;
    }
  },[query,page]);
  function changeQuery(value:string){
    if(!query.trim()&&value.trim())previousScroll.current=scroller.current?.scrollTop??0;
    setSearchOpened({});setQuery(value);
  }
  async function action(cmd:()=>Promise<void>){
    if(busy)return;setBusy(true);setError('');
    try{await cmd();}catch(e){setError(String(e).replace(/^Error: Error invoking remote method '[^']+': Error: /,''));}finally{setBusy(false);}
  }
  function expand(entry:HomeProject,value:boolean){
    if(query.trim())setSearchOpened(old=>({...old,[entry.key]:value}));
    else setOpened(old=>value?[...new Set([...old,entry.key])]:old.filter(key=>key!==entry.key));
    if(value&&entry.directoryPending)void api.levels(entry.key).then(levels=>setDirectories(old=>({...old,[entry.key]:{groups:[],levels}}))).catch(e=>setError(String(e)));
  }
  function pickLevel(key:string,id:string,checked:boolean){
    setPicking(old=>old?.key===key?{key,ids:checked?[...old.ids,id]:old.ids.filter(value=>value!==id)}:old);
  }
  async function collectLevels(key:string,ids:string[]){
    await action(async()=>{
      const result=await api.libraryAddLevels(key,ids);
      setCollected({key,result});
      setPicking(result.failed.length?{key,ids:result.failed.map(item=>item.id)}:null);
    });
  }
  function playFromLibrary(key:string){
    void action(async()=>{
      setPlayStatus('正在检查关卡…');
      try{setPlayStatus(await api.libraryPlay(key));}
      catch(error){setPlayStatus('');throw error;}
      finally{setPlayProgress(null);}
    });
  }
  async function generateSharePreview(id:string){
    const data=await withDeadline(api.sharePreview(id),22000,'读取场景超时');
    return (await renderScenePreview(data)).image;
  }
  function manageItem(scope:ManageItem['scope'],item:HomeProject|DownloadedLevel,operation:ManageItem['operation']){
    setManage({scope,key:item.key,name:item.name,operation,missing:'missing' in item&&item.missing});
    setNewName(item.name);setManageError('');
  }
  function managementButtons(scope:ManageItem['scope'],item:HomeProject|DownloadedLevel){
    return <>
      {!('missing' in item&&item.missing)&&<button type="button" className="hub-icon" aria-label={'重命名 '+item.name} title="重命名" disabled={busy} onClick={()=>manageItem(scope,item,'rename')}><Icon name="rename"/></button>}
      <button type="button" className="hub-icon hub-remove" aria-label={'删除 '+item.name} title="删除" disabled={busy} onClick={()=>manageItem(scope,item,'remove')}><Icon name="trash"/></button>
    </>;
  }
  async function submitManagement(){
    if(!manage||busy)return;
    const {scope,key,operation}=manage;
    setBusy(true);setManageError('');setError('');
    try{
      if(scope==='project'){
        if(operation==='rename')await api.renameProject(key,newName);
        else{await api.removeProject(key);setSelected(item=>item?.key===key?null:item);}
        await load();
      }else{
        if(operation==='rename')await api.renameLibraryItem(key,newName);
        else await api.removeLibraryItem(key);
        setDownloads(await api.downloads());
      }
      setManage(null);
    }catch(error){setManageError(String(error).replace(/^Error: Error invoking remote method '[^']+': Error: /,''));}
    finally{setBusy(false);}
  }
  const filtered=useMemo(()=>entries.map(entry=>({entry,match:matchDirectory(directories[entry.key]?.levels??[],directories[entry.key]?.groups,query,[entry.name])})).filter(({match})=>match.rootMatch||match.count),[entries,directories,query]);
  const matches=downloads.filter(item=>(item.origin??'community')===libraryFilter&&searchKey([item.name,item.author,item.version,...item.manifest.levels.map(level=>level.title)].join(' ')).includes(searchKey(downloadQuery)));
  return <div className="hub-shell hub-desktop" hidden={!active} ref={scroller}>
    <HubSidebar label="工作台导航" feedback={kind=>void action(()=>api.feedback(kind))}>
      {pages.map(([id,icon,label])=><button key={id} aria-current={page===id?'page':undefined} onClick={()=>{setError('');setPage(id);}}><Icon name={icon}/>{label}</button>)}
    </HubSidebar>
    {page==='community'?<CommunityPanel bridge={api} draft={draft} generatePreview={generateSharePreview} onDraftClear={()=>{setDraft(null);void api.shareClear();}} onImported={item=>{setSelected(item);setPage('local');}} onDownloads={()=>{setLibraryFilter('community');setPage('library');}}/>
    :page==='library'?<section className="hub-main" aria-labelledby="level-library-title">
      <header className="hub-header"><div><h1 id="level-library-title">关卡库</h1><p>这里保存可反复导入工程的单关和关卡组。</p></div><div className="hub-actions">
        <button className="hub-button" onClick={()=>setPage('community')}><Icon name="world"/>浏览社区</button>
        <button className="hub-primary" disabled={busy} onClick={()=>void action(async()=>{if(await api.libraryAddFile()){setDownloads(await api.downloads());setLibraryFilter('local');}})}><Icon name="plus"/>从文件添加</button>
      </div></header>
      {error&&<p className="hub-message hub-error" role="alert">{error}</p>}
      {playStatus&&<p className="hub-message" role="status">{playStatus}</p>}
      <PreparationProgress progress={playProgress}/>
      <div className="hub-filters"><div className="hub-segment" aria-label="关卡来源">{([['local','我的关卡'],['community','已下载']] as const).map(([id,label])=><button key={id} aria-pressed={libraryFilter===id} onClick={()=>setLibraryFilter(id)}>{label}</button>)}</div><label className="hub-search"><Icon name="search"/><input value={downloadQuery} onChange={e=>setDownloadQuery(e.target.value)} aria-label="搜索关卡库" placeholder="搜索关卡、作者或版本"/></label></div>
      {matches.map(item=><article key={item.key} className="hub-download-row hub-card">
        <div className="hub-library-intro">
          <ProjectCover id={item.key} level="primary" revision={0} source="library" alt={item.name}/>
          <div><strong>{item.name}</strong><small>{item.origin==='local'?'Build '+item.version:item.author+' · 版本 '+item.version} · {item.manifest.levels.length} 关</small>
          {item.manifest.levels.length>1&&<small>{item.manifest.levels.map(level=>level.title).join('、')}</small>}</div>
        </div><div className="hub-actions">
          <button className="hub-primary" title="直接在原游戏中打开这关" disabled={busy} onClick={()=>playFromLibrary(item.key)}><Icon name="play"/>试玩</button>
          <button className="hub-button" title="在编辑器中修改一份独立副本" disabled={busy} onClick={()=>void action(()=>api.openLibraryItem(item.key))}>{item.manifest.scope==='level'?'编辑单关':'编辑副本'}</button>
          <button className="hub-icon" title="另存分享包" aria-label="另存分享包" disabled={busy} onClick={()=>void action(async()=>{await api.downloadSave(item.key);})}><Icon name="export"/></button>
          {managementButtons('library',item)}
        </div></article>)}
      {!matches.length&&<div className="hub-empty"><Icon name="cube" size={30}/><h2>{downloadQuery?'找不到匹配的关卡':'这里还没有关卡'}</h2></div>}
    </section>
    :<section className="hub-main" aria-labelledby="my-projects-title">
      <header className="hub-header"><div><h1 id="my-projects-title">我的工程</h1><p>{entries.filter(entry=>!entry.missing).length} 个本地工程</p></div><div className="hub-actions">
        <button className="hub-button" onClick={()=>onAction('open')}><Icon name="folder"/>打开</button>
        <button className="hub-button" disabled={busy} onClick={()=>void action(async()=>{const item=await api.importFile();if(item){setSelected(item);await load();}})}><Icon name="import"/>导入</button>
        <button className="hub-button" onClick={()=>onAction('new-level')}><Icon name="plus"/>新建单关</button>
        <button className="hub-primary" onClick={()=>onAction('new')}><Icon name="plus"/>新建工程</button>
        <div className="hub-menu"><button className="hub-icon" aria-label="更多工程操作" title="更多工程操作" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Icon name="more"/></button>{menu&&<div className="hub-popover" onKeyDown={e=>{if(e.key==='Escape')setMenu(false);}}>
          <button onClick={()=>{setMenu(false);void action(async()=>{if(await api.addDirectory())await load();});}}><Icon name="folder"/>添加工程目录</button>
          <button onClick={()=>{setMenu(false);onAction('native');}}><Icon name="world"/>导入原版世界</button>
          <button onClick={()=>{setMenu(false);void load();}}><Icon name="refresh"/>刷新工程列表</button>
        </div>}</div>
      </div></header>
      {error&&<p className="hub-message hub-error" role="alert">{error}</p>}
      {selected&&<div className="hub-card hub-row"><strong>已导入 {selected.name}</strong><button className="hub-button" onClick={()=>void action(()=>api.openImported(selected.key))}>打开工程 <Icon name="chevron"/></button><button className="hub-icon" aria-label="关闭导入提示" onClick={()=>setSelected(null)}><Icon name="close"/></button></div>}
      <div className="hub-filters"><label className="hub-search"><Icon name="search"/><input aria-label="搜索工程、分组或关卡" placeholder="搜索工程、分组或关卡" value={query} onChange={e=>changeQuery(e.target.value)}/></label>{query&&<button className="hub-icon" aria-label="清除搜索" onClick={()=>changeQuery('')}><Icon name="close"/></button>}</div>
      {loading&&!entries.length&&<p className="hub-message" role="status">正在读取工程…</p>}
      {!loading&&!filtered.length&&<div className="hub-empty"><Icon name="folder" size={30}/><h2>{query?'找不到匹配的工程或关卡':'这里还没有工程'}</h2></div>}
      <div className="hub-projects">{filtered.map(({entry,match})=>{
        const open=query.trim()?searchOpened[entry.key]??(!match.rootMatch&&match.count>0):opened.includes(entry.key);
        const picked=picking?.key===entry.key?picking.ids:null;
        const result=collected?.key===entry.key?collected.result:null;
        return <article className="hub-project" key={entry.key}>
          <div className="hub-project-row hub-project-with-cover">
            {entry.missing?<span className="hub-cover-grid hub-cover"><Icon name="warning" size={22}/></span>:<ProjectCover id={entry.key} level={entry.cover} revision={entry.modified+revision} alt={entry.name}/>}
            <button className="hub-row-toggle" aria-expanded={open} disabled={entry.missing} onClick={()=>expand(entry,!open)}><span className="hub-project-text"><strong>{entry.name}</strong><small>{entry.missing?'工程文件已移动或删除':`${entry.directoryPending?directories[entry.key]?.levels.length||'…':entry.count} 关 · ${new Date(entry.modified).toLocaleDateString('zh-CN')}`}{query&&!match.rootMatch&&` · ${match.count} 个匹配`}</small></span><Icon name={open?'down':'chevron'} size={16}/></button>
            <div className="hub-actions hub-project-actions">
              {!entry.missing&&<button className="hub-button" onClick={()=>void action(()=>api.open(entry.key))}>{entry.singleLevel?'打开单关':'打开工程'} <Icon name="chevron" size={14}/></button>}
              {managementButtons('project',entry)}
            </div>
          </div>
          {open&&<section className="hub-levels" aria-label={`${entry.name} 的分组和关卡`}>
            {(picked||match.sections.length>0)&&<div className="hub-actions hub-collect">
              {picked?<><small>已选 {picked.length} 关 · 使用已保存版本</small>
                <button className="hub-primary" disabled={busy||!picked.length} onClick={()=>void collectLevels(entry.key,picked)}><Icon name="plus"/>{busy?'正在加入…':'加入关卡库'}</button>
                <button className="hub-button" disabled={busy} onClick={()=>setPicking(null)}>取消选关</button></>
                :<button className="hub-button" disabled={busy} onClick={()=>{setCollected(null);setPicking({key:entry.key,ids:[]});}}><Icon name="plus"/>选关加入关卡库</button>}
            </div>}
            {result&&<div className="hub-message" role="status">
              <div className="hub-actions"><span>{result.saved>0?`已收录 ${result.saved} 关`:'本次没有关卡加入'}</span>
                {result.saved>0&&<button className="hub-button" onClick={()=>{setLibraryFilter('local');setDownloadQuery('');setPage('library');}}>查看我的关卡</button>}</div>
              {result.failed.length>0&&<ul>{result.failed.map(item=><li key={item.id}>{item.title}：{item.reason}</li>)}</ul>}
            </div>}
            {match.sections.length?<GroupedLevels sections={match.sections} query={query} reveal={Boolean(query.trim()&&!match.rootMatch)} openKeys={groups[entry.key]}
              onOpenKeys={ids=>setGroups(old=>({...old,[entry.key]:ids}))} renderLevel={level=><div className="hub-level-item">
                <ProjectCover id={entry.key} level={level.id} revision={entry.modified+revision} alt={level.title}/>
                {picked?<label className="hub-level-pick"><input type="checkbox" checked={picked.includes(level.id)} disabled={busy} onChange={e=>pickLevel(entry.key,level.id,e.target.checked)}/><span title={level.title}>{level.title}</span></label>
                  :<button type="button" className="hub-level-open" onClick={()=>void action(()=>api.open(entry.key,level.id))}>{level.title}<Icon name="chevron" size={14}/></button>}
              </div>}/>:<p className="hub-muted">{entry.directoryPending?'正在读取原版目录…':'暂无小关。'}</p>}
          </section>}
        </article>;
      })}</div>
    </section>}
    {active&&manage&&<HubModal title={manage.operation==='rename'?'重命名':'删除'} onClose={()=>{if(!busy)setManage(null);}}>
      <form className="hub-manage-form" onSubmit={event=>{event.preventDefault();void submitManagement();}}>
        {manage.operation==='rename'
          ?<label>名称<input autoFocus required maxLength={100} value={newName} disabled={busy} onChange={event=>setNewName(event.target.value)}/></label>
          :<p>「{manage.name}」{manage.missing?'的记录将从首页移除。':manage.scope==='project'?'的工程文件将移到回收站。':'的本地副本将移到回收站。'}</p>}
        {manageError&&<p className="hub-message hub-error" role="alert">{manageError}</p>}
        <div className="hub-actions">
          <button type="button" className="hub-button" disabled={busy} onClick={()=>setManage(null)}>取消</button>
          <button className={manage.operation==='rename'?'hub-primary':'hub-button hub-remove'} disabled={busy||manage.operation==='rename'&&!newName.trim()}>{manage.operation==='rename'?'保存名称':'确认删除'}</button>
        </div>
      </form>
    </HubModal>}
  </div>;
}
