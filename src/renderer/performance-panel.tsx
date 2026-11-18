import React,{useEffect,useReducer,useState} from 'react';
import {Modal} from './studio-ui';
import {performanceCapture,summarizePerformance,type Phase} from './performance-capture';
import './performance-panel.css';

const names:Record<Phase,string>={
  'select.feedback':'选择到画布绘制','select.pick':'鼠标拾取','select.highlight':'选择到高亮就绪',
  'select.list':'选择到物件列表更新','select.inspector':'选择到属性栏更新',
  'drag.frame':'拖动帧间隔','drag.move':'拖动事件处理','drag.release':'松手处理','drag.commit':'物件拖动提交',
  'drag.input':'拖动输入事件','drag.paint':'拖动帧合并请求','place.preview':'更新放置虚像','place.resources':'准备放置素材',
  'frame.render':'渲染调用 CPU','frame.sceneSync':'同步场景物件','frame.terrainSync':'更新地形块',
  'preview.wait':'预览排队','preview.backend':'后台预览','preview.roundtrip':'预览往返','preview.apply':'合并预览结果',
  'preview.full':'整关预览','preview.delta':'预览差量','asset.roundtrip':'资源请求往返','asset.reuse':'复用渲染资源请求','asset.renderer':'创建渲染资源',
  'asset.disk':'磁盘缓存读取','asset.read':'读取原生资源','asset.decode':'原生资源解码','asset.cacheWrite':'写入派生缓存',
  'asset.workerBoundary':'解码线程排队与传输','asset.ipcBoundary':'资源 IPC 及调度','main.longTask':'界面线程长任务',
};
const detailNames:Record<string,string>={object:'物件',terrain:'地形',camera:'视角',mesh:'模型',texture:'贴图',pose:'姿态',material:'材质',normal:'小关',world:'大地图',
  renderer:'画布缓存',memory:'内存命中',pending:'等待已发出的请求',disk:'磁盘命中',source:'原生读取',package:'材质包',unavailable:'未拆分'};
const station=(n:number)=>n.toFixed(1);

function useCaptureState(){
  const [,refresh]=useReducer((n:number)=>n+1,0);
  useEffect(()=>performanceCapture.subscribe(refresh),[]);
  return performanceCapture;
}

export function PerformanceStatus({onReport}:{onReport:()=>void}){
  const capture=useCaptureState();
  if(capture.active)return <button type="button" className="s-perf-status active" onClick={()=>{capture.stop();onReport();}}>停止性能记录</button>;
  return capture.report?<button type="button" className="s-perf-status" onClick={onReport}>性能报告</button>:null;
}

export function PerformancePanel({onClose}:{onClose:()=>void}){
  const capture=useCaptureState(),report=capture.report;
  const [notice,setNotice]=useState('');
  const rows=report?summarizePerformance(report.samples):[];

  async function save(){
    if(!report||!window.editor.savePerformanceReport)return;
    try{if(await window.editor.savePerformanceReport(JSON.stringify(report,null,2)))setNotice('已保存性能报告');}
    catch{setNotice('保存失败，请选择可写入的位置');}
  }

  return <Modal title="性能诊断" className="s-perf-panel" onClose={onClose}>
    <div className="s-perf-body">
      <p>记录最多 30 秒。开始后照常选择、拖动和放置，再从状态栏查看结果。</p>
      {report&&<>
        <p>{station(report.durationMs/1000)} 秒 · {report.samples.length} 个样本{report.dropped>0&&' · 超出上限 '+report.dropped+' 项'}</p>
        {rows.length>0?<table><thead><tr><th scope="col">操作／阶段</th><th scope="col">样本</th><th scope="col">中位数</th><th scope="col">P95</th><th scope="col">最慢</th></tr></thead>
          <tbody>{rows.map(row=>{
            const suffix=row.key.split(' / ').slice(1).map(n=>detailNames[n]).join(' · ');
            const counted=['drag.input','drag.paint','drag.commit','preview.full','preview.delta','asset.reuse'].includes(row.phase);
            return <tr key={row.key}><th scope="row">{names[row.phase]}{suffix&&<small>{suffix}</small>}</th><td>{row.count}{counted&&<small>共 {row.totalCount} 次</small>}</td><td>{counted?'—':station(row.median)}</td><td>{counted?'—':station(row.p95)}</td><td>{counted?'—':station(row.max)}</td></tr>;
          })}</tbody></table>:<p>这段时间没有采到编辑操作，可开始新记录。</p>}
        {rows.length>0&&<p className="s-muted">耗时单位为毫秒。选择阶段从同一次输入计时，不能相加。渲染值为 CPU 调用耗时。</p>}
      </>}
    </div>
    <footer className="s-perf-actions">
      <button type="button" onClick={()=>{if(capture.active)capture.stop();else{capture.start();onClose();}}}>{capture.active?'停止记录':'开始记录'}</button>
      {report&&window.editor.savePerformanceReport&&<button type="button" onClick={()=>void save()}>导出 JSON</button>}
      {report&&<button type="button" onClick={()=>{capture.clear();setNotice('');}}>清除报告</button>}
      <small role="status">{notice}</small>
    </footer>
  </Modal>;
}
