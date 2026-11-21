import React,{useEffect,useState} from 'react';
import type {DownloadedLevel,HomeApi,HomeDirectory,HomeProject,HomeShareSource,ThumbnailSource} from '../home-types';
import {HubModal} from './hub-modal';

const errorText=(error:unknown)=>String(error).replace(/^Error: (?:Error invoking remote method '[^']+': Error: )?/,'');

export function ShareSourcePicker({api,onClose,onPrepare}:{api:HomeApi;onClose:()=>void;onPrepare:(source:HomeShareSource)=>Promise<void>}){
  const [kind,setKind]=useState<ThumbnailSource>('project'),[key,setKey]=useState(''),[level,setLevel]=useState('');
  const [projects,setProjects]=useState<HomeProject[]>([]),[library,setLibrary]=useState<DownloadedLevel[]>([]);
  const [directories,setDirectories]=useState<Record<string,HomeDirectory>>({});
  const [loading,setLoading]=useState(true),[loadingLevels,setLoadingLevels]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let live=true;
    void Promise.all([api.catalog(),api.downloads()]).then(([catalog,items])=>{
      if(live){
        setProjects(catalog.projects.filter(row=>!row.missing));
        setDirectories(Object.fromEntries(catalog.projects.filter(row=>!row.missing&&!row.directoryPending).map(row=>[row.key,catalog.directories[row.key]])));
        setLibrary(items);
      }
    }).catch(error=>{if(live)setError(errorText(error));}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[api]);
  const project=kind==='project'?projects.find(item=>item.key===key):undefined;
  const item=kind==='library'?library.find(item=>item.key===key):undefined;
  const directory=project?directories[key]:item?.manifest;
  useEffect(()=>{
    if(!project?.directoryPending||directory)return;
    let live=true;setLoadingLevels(true);
    void api.levels(project.key).then(levels=>{
      if(live){setLoadingLevels(false);setDirectories(old=>({...old,[project.key]:{groups:[],levels}}));}
    }).catch(error=>{if(live)setError(errorText(error));}).finally(()=>{if(live)setLoadingLevels(false);});
    return()=>{live=false;};
  },[api,project,directory]);
  const groups=project?directory?.groups??[]:[],levels=(directory?.levels??[]).filter(row=>project||!row.requires?.length);
  const ungrouped=levels.filter(row=>!groups.some(group=>group.id===row.groupId));
  const librarySelection=Boolean(item&&item.manifest.scope!=='level');
  const hasScope=Boolean(project&&!project.singleLevel||librarySelection);
  async function submit(){
    if(!key||busy)return;
    setBusy(true);setError('');
    try{await onPrepare({kind,key,level:level||undefined});}
    catch(error){setError(errorText(error));setBusy(false);}
  }
  function selectItem(next:string){setKey(next);setLevel('');setLoadingLevels(false);setError('');}
  return <HubModal title="选择发布内容" onClose={()=>{if(!busy)onClose();}}>
    <form className="hub-manage-form" onSubmit={event=>{event.preventDefault();void submit();}}>
      <label>来源<select autoFocus value={kind} disabled={busy} onChange={event=>{setKind(event.target.value as ThumbnailSource);selectItem('');}}>
        <option value="project">我的工程</option><option value="library">本机关卡库</option>
      </select></label>
      <label>{kind==='project'?'工程':'关卡库条目'}<select required value={key} disabled={busy||loading} onChange={event=>selectItem(event.target.value)}>
        <option value="">{loading?'正在读取…':kind==='project'?'选择工程':'选择关卡'}</option>
        {(kind==='project'?projects:library).map(row=><option key={row.key} value={row.key}>{row.name}</option>)}
      </select></label>
      {hasScope&&<label>发布范围<select aria-label="发布范围" value={level} required={librarySelection} disabled={busy||loadingLevels} onChange={event=>setLevel(event.target.value)}>
        <option value="">{project?'完整工程':levels.length?'选择一个单关':'没有可独立发布的关卡'}</option>
        {ungrouped.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}
        {groups.map(group=>{
          const members=levels.filter(row=>row.groupId===group.id);
          return members.length>0&&<optgroup key={group.id} label={group.title}>{members.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}</optgroup>;
        })}
      </select></label>}
      {loadingLevels&&<p className="hub-muted" role="status">正在读取关卡目录…</p>}
      {error&&<p className="hub-message hub-error" role="alert">{error}</p>}
      <div className="hub-actions">
        <button className="hub-button" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button className="hub-primary" disabled={!key||busy||librarySelection&&!level}>{busy?'正在准备…':'继续'}</button>
      </div>
    </form>
  </HubModal>;
}
