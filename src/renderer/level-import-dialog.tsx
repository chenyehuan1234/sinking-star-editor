import React,{useEffect,useState} from 'react';
import type {DownloadedLevel,LevelImportChoice,LevelImportSource} from '../home-types';
import type {WorldProject} from '../shared';
import {searchKey} from '../level-catalog';
import {Icon,Modal} from './studio-ui';

export function LevelImportDialog({world,folder,onClose,onImport}:{world:WorldProject;folder?:string;onClose:()=>void;onImport:(choice:LevelImportChoice,group?:string)=>Promise<void>}){
  const api=window.workbenchHome!;
  const [items,setItems]=useState<DownloadedLevel[]>([]),[source,setSource]=useState<LevelImportSource|null>(null),[query,setQuery]=useState(''),[group,setGroup]=useState(folder??'');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const text=(e:unknown)=>String(e).replace(/^Error: Error invoking remote method '[^']+': Error: /,'');
  useEffect(()=>{let current=true;void api.downloads().then(rows=>{if(current)setItems(rows);}).catch(e=>{if(current)setError(text(e));}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[api]);
  async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError(text(e));}finally{setBusy(false);}}
  const visible=items.filter(item=>searchKey([item.name,item.author,...item.manifest.levels.map(level=>level.title)].join(' ')).includes(searchKey(query)));
  return <Modal title="导入关卡" className="s-import-level-dialog" onClose={()=>{if(!busy)onClose();}}>
    <div className="s-import-actions"><strong>关卡库</strong><button disabled={busy} onClick={()=>void run(async()=>{const picked=await api.importPick();if(picked)setSource(picked);})}><Icon name="folder"/>从文件导入</button></div>
    {items.length>0&&<input aria-label="搜索关卡库" placeholder="搜索名称或作者" value={query} onChange={e=>setQuery(e.target.value)}/>}
    <div className="s-import-downloads">{visible.map(item=><button type="button" key={item.key} aria-pressed={source?.choice.key===item.key} disabled={busy} onClick={()=>setSource({
      choice:{kind:'download',key:item.key},title:item.name,levels:item.manifest.levels,primary:item.level??item.manifest.primaryId??item.manifest.levels[0].id,
    })}><Icon name="cube"/><span>{item.name}<small>{item.origin==='local'?'本机关卡 · Build '+item.version:item.author+' · 社区下载 · 版本 '+item.version} · {item.manifest.levels.length} 关</small></span></button>)}</div>
    {!visible.length&&<p className="s-muted">{loading?'正在读取关卡库…':query?'找不到匹配的关卡。':'关卡库为空，可以从文件导入。'}</p>}
    {source&&<><div className="s-import-selection"><strong>{source.title}</strong><p>{source.levels.length===1?'1 个关卡':'将一起导入 '+source.levels.length+' 个关卡及其内部关联'}</p><ul>{source.levels.map(level=><li key={level.id}>{level.title}{level.id===source.primary?' · 导入后打开':''}</li>)}</ul></div>
      <label className="s-field">目标分组<select aria-label="导入目标分组" disabled={busy} value={group} onChange={e=>setGroup(e.target.value)}><option value="">未分组</option>{world.levelGroups?.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}</select></label></>}
    {error&&<p className="s-error" role="alert">{error}</p>}
    <button className="primary" disabled={!source||busy} onClick={()=>source&&void run(()=>onImport(source.choice,group||undefined))}>{busy?'正在检查并导入…':'导入到当前工程'}</button>
  </Modal>;
}
