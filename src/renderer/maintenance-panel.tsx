import React,{useState} from 'react';
import type {StorageScan} from '../v08-types';
import './v08.css';
const api=window.editor,bytes=(n:number)=>n>=2**30?(n/2**30).toFixed(2)+' GiB':(n/2**20).toFixed(1)+' MiB';

export function MaintenancePanel(){
 const[scan,setScan]=useState<StorageScan|null>(null),[selected,setSelected]=useState<string[]>([]),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 async function task(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(String(e));}finally{setBusy(false);}}
 const total=scan?.rows.filter(r=>selected.includes(r.id)).reduce((n,r)=>n+r.bytes,0)??0;
 return <section className="v08-maintenance">
 {error&&<p role="alert" className="s-error">{error}</p>}{status&&<p role="status">{status}</p>}
 <div className="v08-summary"><div><small>已扫描管理数据</small><strong>{scan?bytes(scan.total):'—'}</strong></div><div><small>可审查清理</small><strong>{scan?bytes(scan.reclaimable):'—'}</strong></div><button disabled={busy} onClick={()=>void task(async()=>{setStatus('后台统计目录和工程依赖…');setScan(await api.storageScan());setSelected([]);setStatus('扫描完成。勾选目录后检查路径和保护原因。');})}>{busy?'扫描中…':'扫描占用'}</button></div>
 <p className="s-muted">工程、恢复备份和被依赖的来源版本默认保留。清理不包含 Steam 原安装与正式存档目录。</p>
 <div className="v08-storage-list">{scan?.rows.map(r=><label className={'v08-storage-row '+(!r.eligible?'protected':'')} key={r.id}><input type="checkbox" disabled={!r.eligible||busy} checked={selected.includes(r.id)} onChange={e=>setSelected(a=>e.target.checked?[...a,r.id]:a.filter(id=>id!==r.id))}/><div><strong>{r.category}</strong><code>{r.path}</code><small>{r.reason}{r.dependencies.length?` · ${r.dependencies.length} 项工程引用`:''}</small>{r.dependencies.length>0&&<details><summary>查看依赖</summary>{r.dependencies.map(p=><code key={p}>{p}</code>)}</details>}</div><span>{bytes(r.bytes)}</span></label>)}</div>
 <button disabled={busy||!selected.length} onClick={()=>void task(async()=>{if(!scan||!confirm(`清理选中的 ${selected.length} 个目录？预计回收 ${bytes(total)}。请确认上方路径。`))return;const r=await api.storageClean(scan.token,selected);setStatus('已回收 '+bytes(r.reclaimed));setScan(await api.storageScan());setSelected([]);})}>清理选中项 · {bytes(total)}</button>
 </section>;
}
