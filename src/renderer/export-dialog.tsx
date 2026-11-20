import React,{useState} from 'react';
import {Icon,Modal} from './studio-ui';
import type {RunRequest,WorldProject} from '../shared';
import type {NativeWorldProject} from '../v08-types';

type Props={
  project:WorldProject|NativeWorldProject;current?:string;levels:{id:string;title:string}[];
  singleLevel?:boolean;
  onClose:()=>void;onDone:(path:string)=>void;onShare?:(single:boolean)=>Promise<void>;onCover?:()=>Promise<void>;onLibraryAdd?:()=>Promise<void>;
};

export function ExportDialog({project,current,levels,singleLevel,onClose,onDone,onShare,onCover,onLibraryAdd}:Props){
  const [mode,setMode]=useState<RunRequest['mode']>(current?'single':'world'),[ids,setIds]=useState<string[]>(current?[current]:[]);
  const [format,setFormat]=useState<'project'|'runtime'>('project'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function run(action:()=>Promise<void>){
    setError('');setBusy(true);
    try{await action();}catch(e){setError(String(e).replace(/^Error: Error invoking remote method '[^']+': Error: /,''));}
    finally{setBusy(false);}
  }
  async function exportDesign(){
    if(mode==='subset'&&!ids.length)throw Error('请至少勾选一关');
    const result=await window.editor.exportDesign({project,format,scope:{mode,levelIds:mode==='single'?[current!]:mode==='subset'?ids:[]}});
    if(result){onDone(result.path);onClose();}
  }
  return <Modal title="导出与分享" className="s-export-dialog" onClose={()=>{if(!busy)onClose();}}>
    {!singleLevel&&<label>范围<select aria-label="导出范围" value={mode} disabled={busy} onChange={e=>setMode(e.target.value as typeof mode)}>
      <option value="single" disabled={!current}>当前关卡</option><option value="subset">勾选关卡组</option><option value="world">整个工程</option>
    </select></label>}
    {mode==='subset'&&<div className="s-export-levels">{levels.map(level=><label key={level.id}><input type="checkbox" checked={ids.includes(level.id)} onChange={e=>setIds(old=>e.target.checked?[...old,level.id]:old.filter(id=>id!==level.id))}/>{level.title}</label>)}</div>}
    <label>输出类型<select aria-label="导出类型" disabled={busy} value={format} onChange={e=>setFormat(e.target.value as typeof format)}>
      <option value="project">{singleLevel?'可编辑单关':'可编辑工程'}</option><option value="runtime">原生运行包文件夹</option>
    </select></label>
    <p>{format==='project'?'选择位置保存，可导回编辑器继续编辑。':'选择目标目录，生成关卡包、必要资源、工程副本和校验清单。'}</p>
    {format==='runtime'&&<p className="s-muted">运行包包含完整的 levels.package。导出后可在目标目录查看本次自定义内容。</p>}
    {error&&<p role="alert" className="s-error">{error}</p>}
    <button className="primary" disabled={busy} onClick={()=>void run(exportDesign)}>{busy?'正在处理…':'选择位置并导出'}</button>
    {onShare&&<div className="s-menu-grid"><button disabled={busy||!current} onClick={()=>void run(async()=>{await onShare(true);onClose();})}><Icon name="world"/>分享当前关</button>
      {!singleLevel&&<button disabled={busy} onClick={()=>void run(async()=>{await onShare(false);onClose();})}><Icon name="world"/>分享整个工程</button>}
      {onLibraryAdd&&<button disabled={busy||!current} onClick={()=>void run(async()=>{await onLibraryAdd();onClose();})}><Icon name="cube"/>加入本机关卡库</button>}
      {onCover&&<button disabled={busy} onClick={()=>void run(async()=>{await onCover();onClose();})}><Icon name="eye"/>用当前画面设置首页封面</button>}</div>}
  </Modal>;
}
