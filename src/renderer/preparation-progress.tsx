import React,{useEffect,useRef,useState} from 'react';
import type {PreparationProgress as Progress} from '../shared';
import './preparation-progress.css';

export function usePreparationProgress(onText?:(text:string)=>void){
 const [progress,setProgress]=useState<Progress|null>(null),text=useRef(onText);text.current=onText;
 useEffect(()=>window.editor.onPlaytestProgress?.((message,value)=>{text.current?.(message);setProgress(value??null);}),[]);
 return progress;
}
const phases={scan:'统计游戏文件',copy:'复制试玩副本',verify:'校验试玩资源',replace:'替换当前副本',cleanup:'清理更新临时文件'};
const bytes=(n:number)=>n>=2**30?(n/2**30).toFixed(2)+' GiB':(n/2**20).toFixed(1)+' MiB';
export function PreparationProgress({progress:p}:{progress:Progress|null}){
 if(!p)return null;
 const determinate=p.phase==='copy'&&p.totalBytes>0,percent=Math.max(0,Math.min(100,p.copiedBytes/Math.max(1,p.totalBytes)*100));
 return <section className="s-preparation-progress" aria-label="试玩副本准备进度">
  <header><strong aria-live="polite">{phases[p.phase]}</strong><span>{p.totalBytes>0&&<span>{bytes(p.copiedBytes)} / {bytes(p.totalBytes)}</span>}{determinate&&<b>{Math.floor(percent)}%</b>}</span></header>
  <progress aria-label={phases[p.phase]} max={100} value={determinate?percent:undefined}/>
  <small title={p.currentFile}>{p.phase==='copy'?`已复制 ${p.filesCopied.toLocaleString()} / ${p.totalFiles.toLocaleString()} 个文件${p.currentFile?' · '+p.currentFile.split(/[\\/]/).pop():''}`:p.phase==='scan'?'正在统计大小，暂不显示百分比':p.phase==='cleanup'?'更新完成只保留当前游戏副本，工程和存档备份保留':'校验与替换完成后自动继续试玩'}</small>
 </section>;
}
