import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Catalog,EditorProject,EditOp,EntityView,LevelView,Vec3} from '../shared';
import './style.css';
import{StudioApp as WorldApp}from'./studio-app';

const names:Record<string,string>={Guy:'角色',Mirror:'魔镜',Rock:'石头',Door:'出口',Wall_Set:'墙体组',Marker:'标记',Switch:'开关',Gate:'门闸',Teleporter:'传送器',Gem:'宝石',Gem_Slot:'宝石插槽',Inanimate:'场景摆件',Settings:'关卡设置',Camera_Control:'相机',Sun:'太阳',Sky:'天空',Wind:'风',Fog:'雾',Ocean_Map:'水面',Light_Probe:'光照探针',Decal:'贴花'};
const glyphs:Record<string,string>={Guy:'♟',Mirror:'◈',Rock:'⬡',Door:'◎',Wall_Set:'▦',Marker:'＋',Switch:'⊙',Gate:'▥',Teleporter:'↔',Gem:'◆',Gem_Slot:'◇'};
function label(e:EntityView){return names[e.type]??e.type;}
const api=window.editor;
function App(){
  const [catalog,setCatalog]=useState<Catalog|null>(null),[project,setProject]=useState<EditorProject|null>(null),[level,setLevel]=useState<LevelView|null>(null);
  const [query,setQuery]=useState(''),[entityQuery,setEntityQuery]=useState(''),[selected,setSelected]=useState<number|null>(null);
  const [status,setStatus]=useState('正在连接本机游戏…'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
  const [undo,setUndo]=useState<EditOp[][]>([]),[redo,setRedo]=useState<EditOp[][]>([]),[showScene,setShowScene]=useState(false),[showAll,setShowAll]=useState(false);
  const [zoom,setZoom]=useState(1),[fitKey,setFitKey]=useState(0),[pos,setPos]=useState<string[]>(['0','0','0']),[yaw,setYaw]=useState('0');
  const [tab,setTab]=useState<'levels'|'entities'>('levels');
  const request=useRef(0),saved=useRef(''),current=useRef(project),previewing=useRef(false);current.current=project;
  const entity=level?.entities.find(e=>e.id===selected);
  async function task<T>(fn:()=>Promise<T>,message?:string):Promise<T|undefined>{setBusy(true);setError('');if(message)setStatus(message);try{return await fn();}catch(e){setError(String(e).replace(/^Error: Error invoking remote method '[^']+': Error: /,''));return undefined;}finally{setBusy(false);}}
  async function open(name:string,c=catalog,skipDiscard=false){
    if(!c)return;if(!skipDiscard&&dirty&&!confirm('当前工程尚未保存。放弃修改并打开其他关卡？'))return;
    await task(async()=>{
      const l=await api.openLevel(name);const p:EditorProject={format:'sinking-star-project',version:1,sourceHash:c.sourceHash,sourceBuild:c.build,template:name,name,operations:[]};
      request.current++;setLevel(l);setProject(p);saved.current=JSON.stringify(p);setDirty(false);setUndo([]);setRedo([]);setSelected(l.entities.find(e=>e.type==='Mirror'&&e.editable)?.id??l.entities.find(e=>e.editable)?.id??null);setFitKey(k=>k+1);setZoom(1);setStatus(`已打开 ${name} · ${l.entities.length} 个实体`);
    });
  }
  async function chooseGame(){
    if(dirty&&!confirm('当前工程尚未保存。放弃修改并切换游戏目录？'))return;
    await task(async()=>{const c=await api.chooseGame();if(c){setCatalog(c);setProject(null);setLevel(null);setDirty(false);await open('mirror_1',c,true);}});
  }
  useEffect(()=>{void task(async()=>{const c=await api.connect();setCatalog(c);await open('mirror_1',c);});},[]);
  useEffect(()=>{if(entity){setPos((entity.position??[0,0,0]).map(String));setYaw(String(entity.yaw));}},[entity]);
  useEffect(()=>{
    const onBefore=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',onBefore);return()=>window.removeEventListener('beforeunload',onBefore);
  },[dirty]);
  async function update(p:EditorProject,record=true){
    if(previewing.current)return;
    previewing.current=true;
    const seq=++request.current;
    try{const l=await api.preview(p);if(seq!==request.current)return;
      if(record&&project){setUndo(u=>[...u,project.operations]);setRedo([]);}setProject(p);setLevel(l);setDirty(JSON.stringify(p)!==saved.current);setError('');setStatus(`${p.name} · ${p.operations.length} 项编辑`);
    }catch(e){setError(String(e));}finally{previewing.current=false;}
  }
  function commit(op:EditOp){if(!project||busy||previewing.current)return;void update({...project,operations:[...project.operations,op]});}
  function history(back:boolean){if(!project||busy||previewing.current)return;const stack=back?undo:redo;if(!stack.length)return;
    const ops=stack[stack.length-1];if(back){setUndo(stack.slice(0,-1));setRedo(r=>[...r,project.operations]);}else{setRedo(stack.slice(0,-1));setUndo(u=>[...u,project.operations]);}void update({...project,operations:ops},false);
  }
  async function save(){if(project)await task(async()=>{const p=await api.save(project);if(p){saved.current=JSON.stringify(project);setDirty(false);setStatus('工程已保存：'+p);}});}
  function clone(){if(!entity?.cloneable||!project||!level||!entity.position)return;
    const namespace=entity.id>>>20;let id=(namespace*0x100000)+1;
    const ids=new Set(level.entities.map(e=>e.id));while(ids.has(id))id++;
    if((id>>>20)!==namespace){setError('该实体命名空间的 ID 已用尽');return;}
    commit({kind:'clone',id:entity.id,newId:id,position:[entity.position[0]+1,entity.position[1],entity.position[2]]});setSelected(id);
  }
  function remove(){if(!entity?.cloneable)return;commit({kind:'delete',id:entity.id});setSelected(null);}
  useEffect(()=>{
    function key(e:KeyboardEvent){
      if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();void save();return;}
      if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
      if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();history(!e.shiftKey);}
      else if((e.ctrlKey||e.metaKey)&&e.key==='y'){e.preventDefault();history(false);}
      else if((e.ctrlKey||e.metaKey)&&e.key==='d'){e.preventDefault();clone();}
      else if(e.key==='Delete'){e.preventDefault();remove();}
      else if(entity?.editable&&entity.position&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
        e.preventDefault();const p=[...entity.position] as Vec3;if(e.key==='ArrowUp')p[1]++;if(e.key==='ArrowDown')p[1]--;if(e.key==='ArrowRight')p[0]++;if(e.key==='ArrowLeft')p[0]--;commit({kind:'transform',id:entity.id,position:p});
      }
    }window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  });
  const filtered=catalog?.levels.filter(n=>n.toLowerCase().includes(query.toLowerCase()))??[];
  const visibleEntities=level?.entities.filter(e=>(showAll||e.editable||['Wall_Set','Marker'].includes(e.type))&&`${e.id} ${e.type} ${label(e)}`.toLowerCase().includes(entityQuery.toLowerCase()))??[];
  return <div className="app">
    <header className="topbar"><div className="brand"><span className="emblem" aria-hidden="true">✦</span><div><h1>沉星之序 <span>关卡工作台</span></h1><p>ORDER OF THE SINKING STAR / EDITOR</p></div></div><div className="connection"><i/>本机连接 <span>BUILD {catalog?.build??'—'}</span></div><button disabled={busy} onClick={()=>void chooseGame()}>选择游戏目录</button></header>
    <nav className="toolbar" aria-label="编辑工具栏"><div className="project-title"><span className="eyebrow">当前工程</span><strong>{project?.name??'尚未打开'}{dirty&&<b title="尚未保存"> ●</b>}</strong></div><div className="toolgroup"><button disabled={!project||busy} onClick={()=>void task(async()=>{if(dirty&&!confirm('放弃当前未保存修改并打开工程？'))return;const p=await api.load();if(p){const l=await api.preview(p);setProject(p);setLevel(l);saved.current=JSON.stringify(p);setDirty(false);setUndo([]);setRedo([]);setSelected(null);setFitKey(k=>k+1);setStatus('已打开编辑工程');}})}>打开工程</button><button disabled={!project||busy} onClick={()=>void save()}>保存 <kbd>Ctrl S</kbd></button><button aria-label="撤销" title="撤销 Ctrl+Z" disabled={!undo.length||busy} onClick={()=>history(true)}>↶</button><button aria-label="重做" title="重做 Ctrl+Y" disabled={!redo.length||busy} onClick={()=>history(false)}>↷</button></div><div className="toolgroup end"><button disabled={!project||busy} onClick={()=>project&&void task(async()=>{const r=await api.build(project);setStatus('关卡包与补丁已导出：'+r.path);},'正在校验源包并构建…')}>导出关卡包</button><button className="primary" disabled={!project||busy} onClick={()=>project&&void task(async()=>{setStatus(await api.deploy(project));},'正在构建测试副本，首次复制约 14 GB，请稍候…')}>◈ 部署到测试副本</button></div></nav>
    <main className="workspace">
      <aside className="library"><div className="tabs" role="tablist" aria-label="内容库"><button role="tab" aria-selected={tab==='levels'} className={tab==='levels'?'active':''} onClick={()=>setTab('levels')}>关卡库 <small>{catalog?.levels.length??0}</small></button><button role="tab" aria-selected={tab==='entities'} className={tab==='entities'?'active':''} onClick={()=>setTab('entities')}>实体</button></div>
        {tab==='levels'?<><label className="search">搜索关卡<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="名称，例如 mirror_1"/></label><div className="section-caption"><span>原始关卡模板</span><span>{filtered.length}</span></div><div className="level-list">{filtered.slice(0,150).map(n=><button key={n} className={project?.template===n?'level active':'level'} disabled={busy} onClick={()=>void open(n)}><span className="level-icon">◇</span><span>{n}</span>{project?.template===n&&<span className="active-dot">●</span>}</button>)}{filtered.length>150&&<p className="hint padded">还有 {filtered.length-150} 关，请输入名称缩小范围。</p>}{filtered.length===0&&<p className="hint padded">没有匹配的关卡。</p>}</div></>:<><label className="search">查找实体<input value={entityQuery} onChange={e=>setEntityQuery(e.target.value)} placeholder="类型 / ID"/></label><label className="check padded"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/>显示全部只读实体</label><div className="level-list">{visibleEntities.slice(0,500).map(e=><button key={e.id} className={selected===e.id?'level active':'level'} onClick={()=>setSelected(e.id)}><span className="level-icon">{glyphs[e.type]??'·'}</span><span>{label(e)}<small className="entity-id">#{e.id}</small></span><span className="lock">{e.editable?'':'只读'}</span></button>)}</div></>}
        <div className="library-footer"><span className="eyebrow">工作区</span><p>原游戏文件只读<br/>测试修改保存在独立副本</p><button onClick={()=>void api.reveal()}>打开工作文件夹 ↗</button></div>
      </aside>
      <section className="canvas-section" aria-label="关卡地图"><div className="canvas-header"><div><span className="eyebrow">LAYOUT / XY</span><h2>{project?.template??'连接游戏后打开关卡'}</h2></div><span className="badge">二维布局示意</span></div>
        <MapCanvas level={level} selected={selected} setSelected={setSelected} onMove={(id,p)=>commit({kind:'transform',id,position:p})} showScene={showScene} zoom={zoom} fitKey={fitKey}/>
        <div className="map-controls"><label className="check"><input type="checkbox" checked={showScene} onChange={e=>setShowScene(e.target.checked)}/>场景参考点</label><div className="zoom"><button aria-label="缩小" onClick={()=>setZoom(z=>Math.max(.25,z/1.25))}>−</button><span>{Math.round(zoom*100)}%</span><button aria-label="放大" onClick={()=>setZoom(z=>Math.min(5,z*1.25))}>＋</button><button onClick={()=>{setFitKey(k=>k+1);setZoom(1);}}>适应</button></div></div>
        <div className="legend"><span><b className="guy">♟</b>角色</span><span><b className="mirror">◈</b>魔镜</span><span><b className="rock">⬡</b>石头</span><span><b className="door">◎</b>出口</span><span>▦ 只读墙体锚点</span></div>
      </section>
      <aside className="inspector"><div className="inspector-title"><h2>实体属性</h2><span className="badge">{entity?.editable?'可编辑':'只读'}</span></div>{entity?<>
        <div className="entity-hero"><span className={'entity-symbol '+entity.type.toLowerCase()}>{glyphs[entity.type]??'◇'}</span><div><h3>{label(entity)}</h3><p>{entity.type} <span>#{entity.id}</span></p></div></div>
        <form onSubmit={e=>{e.preventDefault();if(entity.editable)commit({kind:'transform',id:entity.id,position:pos.map(Number) as Vec3,yaw:Number(yaw)});}}>
          <div className="section-caption">变换 <span>网格单位</span></div><div className="coords">{['X','Y','Z'].map((axis,i)=><label key={axis}>{axis}<input type="number" step="1" value={pos[i]} disabled={!entity.editable} onChange={e=>setPos(p=>p.map((v,j)=>i===j?e.target.value:v))}/></label>)}</div><label className="field">朝向（度）<input type="number" step="90" value={yaw} disabled={!entity.editable} onChange={e=>setYaw(e.target.value)}/></label><button className="wide" disabled={!entity.editable||busy} type="submit">应用变换</button>
        </form><div className="entity-actions"><button disabled={!entity.cloneable||busy} onClick={clone}>复制 <kbd>Ctrl D</kbd></button><button disabled={!entity.cloneable||busy} onClick={remove}>删除</button></div>
        <div className="details"><span className="eyebrow">模型引用</span><p>{entity.mesh||'使用默认模型'}</p><span className="eyebrow">原始属性</span><p>{entity.bytes} 字节 · 未识别字段原样保留</p></div><p className="hint">{entity.editable?'拖动实体吸附到整数网格，或使用方向键微调。复制与删除首版仅支持镜子和石头。':'此实体的属性尚未验证，当前仅显示位置参考。'}</p>
      </>:<div className="empty"><span>◇</span><h3>选择一个实体</h3><p>点击地图上的物件，或从实体列表选择。</p></div>}
        <div className="project-settings"><div className="section-caption">关卡工程</div><label className="field">导出名称<input value={project?.name??''} disabled={!project||busy} onChange={e=>{if(project){setProject({...project,name:e.target.value});setDirty(true);}}} onBlur={()=>{if(project&&!/^[a-zA-Z0-9_-]{1,100}$/.test(project.name))setError('导出名称仅允许英文字母、数字、下划线与短横线');}}/></label><p className="hint">修改名称即可从模板另存新关卡。试玩统一使用副本首关入口。</p></div>
      </aside>
    </main>
    <section className="playtest-bar"><div><span className="eyebrow">原游戏试玩</span><p>部署 → 启动 → 开始新战役<span>地形、碰撞与胜负以原游戏为准</span></p></div><button disabled={busy||!catalog} onClick={()=>void task(async()=>setStatus(await api.restore()),'正在校验并恢复副本…')}>恢复测试副本</button><button disabled={busy||!catalog} onClick={()=>void task(async()=>setStatus(await api.launch()),'正在备份存档并启动…')}>▷ 启动游戏副本</button></section>
    <footer className={error?'status error':'status'} role="status" aria-live="polite"><span className={busy?'working':'status-light'}>●</span><span>{error||status}</span><span className="status-right">{level?.entities.length??0} 实体 · {level?.entities.filter(e=>e.editable).length??0} 可编辑</span></footer>
  </div>;
}

export function MapCanvas({level,selected,setSelected,onMove,showScene,zoom,fitKey,layer,onPlace}:{level:LevelView|null;selected:number|null;setSelected:(id:number|null)=>void;onMove:(id:number,p:Vec3)=>void;showScene:boolean;zoom:number;fitKey:number;layer?:number;onPlace?:(p:Vec3)=>void}){
  const ref=useRef<SVGSVGElement>(null),[pan,setPan]=useState<[number,number]>([0,0]),[drag,setDrag]=useState<{id:number;p:Vec3}|null>(null);
  const panStart=useRef<{x:number;y:number;scale:number;pan:[number,number]}|null>(null),[bounds,setBounds]=useState({cx:9,cy:9,span:24});
  useEffect(()=>{const points=level?.entities.filter(e=>e.editable&&e.position).map(e=>e.position!)??[];
    if(points.length){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);setBounds({cx:(loX+hiX)/2,cy:(loY+hiY)/2,span:Math.max(hiX-loX+12,hiY-loY+12,18)});}else setBounds({cx:0,cy:0,span:30});setPan([0,0]);setDrag(null);
  },[fitKey,level?.name]);
  const span=bounds.span/zoom,aspect=1.12,w=span*aspect,h=span;
  const x0=bounds.cx-w/2+pan[0],y0=-bounds.cy-h/2+pan[1];
  function point(e:React.PointerEvent):[number,number]{const svg=ref.current!,p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const m=svg.getScreenCTM();if(!m)return [0,0];const q=p.matrixTransform(m.inverse());return [q.x,-q.y];}
  function move(e:React.PointerEvent){if(drag){const p=point(e);setDrag({...drag,p:[Math.round(p[0]),Math.round(p[1]),drag.p[2]]});}else if(panStart.current){const s=panStart.current;setPan([s.pan[0]+(s.x-e.clientX)*s.scale,s.pan[1]+(s.y-e.clientY)*s.scale]);}}
  const primary=level?.entities.filter(e=>e.editable||e.id===selected||['Wall_Set','Marker'].includes(e.type))??[];
  const displayed=[...primary,...(showScene?(level?.entities.filter(e=>e.type==='Inanimate'&&e.id!==selected).slice(0,10000)??[]):[])];
  return <svg ref={ref} className="map" viewBox={`${x0} ${y0} ${w} ${h}`} role="group" aria-label="二维关卡布局，Y 轴向上" onPointerDownCapture={e=>{if(onPlace){e.stopPropagation();e.preventDefault();const p=point(e);onPlace([Math.round(p[0]),Math.round(p[1]),layer??0]);}}} onPointerMove={move} onPointerUp={e=>{if(drag){const original=level?.entities.find(x=>x.id===drag.id)?.position;if(!original||drag.p.some((v,i)=>v!==original[i]))onMove(drag.id,drag.p);setDrag(null);}panStart.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{setDrag(null);panStart.current=null;}} onPointerDown={e=>{if(e.target===e.currentTarget||e.target instanceof SVGRectElement){const scale=1/(ref.current!.getScreenCTM()?.a??1);panStart.current={x:e.clientX,y:e.clientY,scale,pan};e.currentTarget.setPointerCapture(e.pointerId);}}}>
    <defs><pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#334046" strokeWidth=".016"/></pattern><pattern id="major" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#grid)"/><path d="M 5 0 L 0 0 0 5" fill="none" stroke="#4b5d64" strokeWidth=".025"/></pattern></defs>
    <rect x={x0} y={y0} width={w} height={h} fill="url(#major)"/>
    {level?.terrain?.filter(t=>t.z===(layer??0)).map((t,i)=><rect key={'terrain'+i} x={t.x-.48} y={-t.y-.48} width=".96" height=".96" fill="#253c39" stroke="#526663" strokeWidth=".014" pointerEvents="none"/>)}
    {level?.terrain?.filter(t=>t.z===(layer??0)+1).map((t,i)=><rect key={'wall'+i} x={t.x-.48} y={-t.y-.48} width=".96" height=".96" fill="#586771" stroke="#8a9da3" strokeWidth=".02" pointerEvents="none"/>)}
    {Array.from({length:Math.min(80,Math.ceil(w/5)+1)},(_,i)=>Math.ceil(x0/5)*5+i*5).map(x=><text key={'x'+x} x={x+.1} y={y0+.5} fontSize={.25} fill="#8d9da5">{x}</text>)}
    {Array.from({length:Math.min(80,Math.ceil(h/5)+1)},(_,i)=>Math.ceil(y0/5)*5+i*5).map(y=><text key={'y'+y} x={x0+.1} y={y-.1} fontSize={.25} fill="#8d9da5">{-y}</text>)}
    {displayed.filter(e=>e.position&&(layer===undefined||Math.abs(e.position[2]-layer)<.1||e.id===selected)).sort((a,b)=>Number(a.editable)-Number(b.editable)).map(e=>{
      const p=drag?.id===e.id?drag.p:e.position!,scene=e.type==='Inanimate',isSelected=selected===e.id;
      return <g key={e.id} transform={`translate(${p[0]} ${-p[1]})`} className={`map-entity ${e.type.toLowerCase()} ${isSelected?'selected':''} ${scene?'scene':''}`} tabIndex={scene?-1:0} role="button" aria-label={`${label(e)} #${e.id} X${p[0]} Y${p[1]} ${e.editable?'可编辑':'只读'}`} onKeyDown={ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();setSelected(e.id);}}} onPointerDown={ev=>{ev.stopPropagation();setSelected(e.id);if(e.editable){setDrag({id:e.id,p});ref.current!.setPointerCapture(ev.pointerId);}}}>
        <title>{label(e)} #{e.id} · ({p.join(', ')})</title>
        {scene?<circle r=".10"/>:<><rect x="-.42" y="-.42" width=".84" height=".84" rx=".12" className="entity-tile"/><text textAnchor="middle" dominantBaseline="central" fontSize=".62">{glyphs[e.type]??'◇'}</text>{isSelected&&<><rect x="-.55" y="-.55" width="1.1" height="1.1" fill="none" stroke="#e8bd73" strokeWidth=".035" rx=".15"/><text y="-.78" fontSize=".26" textAnchor="middle" className="coordinate-label">{p[0]}, {p[1]}, {p[2]}</text></>}</>}
      </g>;
    })}
    {!level&&<text x="0" y="0" fill="#a8b7bd" fontSize=".5">等待连接游戏目录</text>}
  </svg>;
}

createRoot(document.getElementById('root')!).render(<WorldApp/>);
