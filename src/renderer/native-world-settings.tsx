import React,{useState} from 'react';
import type {WorldProject,LevelView,TopologyConfig,Vec3} from '../shared';
import type {NativeWorldIndex} from '../v08-types';
import type {SceneDisplay} from './scene-display';
import {BufferInput} from './studio-inspector';
import {WorldRange} from './world-range';
import {TopologyInspector} from './topology-inspector';
import {nativeDocument} from '../native-project';
import {VirtualList} from './virtual-list';
export function NativeWorldSettings({world,index,level,display,onDisplay,onName,onEntry,onCamera,onTopology,onFocus,onOverview}:{world:WorldProject;index:NativeWorldIndex|null;level:LevelView|null;display:SceneDisplay;onDisplay:(d:SceneDisplay)=>void;onName:(s:string)=>void;onEntry:()=>void;onCamera:()=>void;onTopology:(t:TopologyConfig|undefined)=>void;onFocus:(p:Vec3)=>void;onOverview:()=>void}) {
 const [query,setQuery]=useState(''),[hits,setHits]=useState<Awaited<ReturnType<typeof window.editor.nativeSearch>>>([]),[error,setError]=useState('');
 return <div className="s-native-summary09"><strong>完整原版世界</strong><p>{index?.recordCount.toLocaleString()} 条记录 · {index?.entryCount} 个入口 · {world.levels.length} 个场景</p><label className="s-field">工程名称<BufferInput label="工程名称" type="text" value={world.name} onCommit={onName}/></label><WorldRange presets={index?.heightRanges} value={display} onChange={onDisplay} onOverview={onOverview}/><label className="s-field">区域定位<select aria-label="大世界区域定位" defaultValue="" onChange={e=>{const c=index?.cells.find(c=>c.areaId===e.target.value);if(c)onFocus(c.center);}}><option value="">选择原版区域…</option>{Array.from(new Map(index?.cells.filter(c=>c.areaId).map(c=>[c.areaId,c.title])).entries()).map(([id,title])=><option value={id} key={id}>{title}</option>)}</select></label><form onSubmit={e=>{e.preventDefault();setError('');void window.editor.nativeSearch(nativeDocument(world),query).then(setHits).catch(e=>setError(String(e)));}}><label className="s-field">全世界物件查找<input aria-label="全世界物件查找" placeholder="名称、类型或 #编号" value={query} onChange={e=>setQuery(e.target.value)}/></label><button>查找并定位</button></form>{error&&<p>{error}</p>}{hits.length>0&&<VirtualList label="全世界查找结果" items={hits} height={140} render={h=><button onClick={()=>onFocus(h.position)}>{h.name||h.type} #{h.id} · Z{h.position[2]}</button>}/>}<button onClick={onEntry}>放置关卡入口</button><button onClick={onCamera}>打开镜头设置</button><p className="s-muted">运行方式、镜头清单与取景在镜头面板统一设置。</p><TopologyInspector level={level} config={world.native?.topology} onChange={onTopology}/><p>分组只整理左侧目录；显示高度与放置高度分别设置。双击入口进入小关。</p></div>;
}
