/** Editor-only layout data. Never stored in or compiled into a game project. */
export const panelDefinitions = [
  ['scene','主画布','cube'],['levels','关卡','world'],['objects','场景物件','select'],['assets','素材与快捷槽','template'],['inspector','属性','settings'],
  ['camera','游戏镜头','eye'],['cameraRegions','原生区域与分层镜头','grid'],['topology','循环与边界','world'],['placement','放置设置','magnet'],['water','水域与水流','flow'],
  ['groups','编辑分组','folder'],['array','阵列复制','stamp'],['mechanisms','机关检查','warning'],['relations','机关关联','link'],['display','显示与选择','eye'],
  ['region','区域复制','copy'],['library','我的组合','folder'],['recovery','保存与恢复','clock'],['native','原版关卡目录','template'],
  ['validation','工程检查','check'],['settings','快捷键与鼠标','settings'],['workspace','工作区设置','folder'],['guide','操作指南','help']
] as const;
export type PanelId=typeof panelDefinitions[number][0];
export type DockZone='center'|'left'|'right'|'top'|'bottom';
export interface DockGroup {kind:'group';id:string;tabs:PanelId[];active:PanelId}
export interface DockSplit {kind:'split';id:string;axis:'row'|'column';ratio:number;first:DockNode;second:DockNode}
export type DockNode=DockGroup|DockSplit;
export interface FloatingGroup {group:DockGroup;x:number;y:number;width:number;height:number}
interface PanelHome {peer?:PanelId;zone:DockZone;index?:number;ratio?:number;floating?:Omit<FloatingGroup,'group'>}
export interface WorkspaceLayout {version:1;root:DockNode|null;floating:FloatingGroup[];hidden:PanelId[];locked:boolean;maximized:PanelId|null;homes?:Partial<Record<PanelId,PanelHome>>}
export interface SavedLayout {name:string;layout:WorkspaceLayout}
const ids=new Set<string>(panelDefinitions.map(p=>p[0]));
export const isPanel=(v:unknown):v is PanelId=>typeof v==='string'&&ids.has(v);
const fresh=()=> 'dock-'+crypto.randomUUID();
const group=(tabs:PanelId[],id=fresh()):DockGroup=>({kind:'group',id,tabs,active:tabs[0]});
const split=(axis:DockSplit['axis'],ratio:number,first:DockNode,second:DockNode):DockSplit=>({kind:'split',id:fresh(),axis,ratio,first,second});
export function defaultWorkspace(preset:'default'|'terrain'|'logic'='default',legacy?:{left?:number;right?:number;bottom?:number;leftOpen?:boolean;rightOpen?:boolean;bottomOpen?:boolean}):WorkspaceLayout {
  const left=split('column',.43,group(['levels']),group(['objects']));
  let root:DockNode=preset==='terrain'
    ?split('row',.22,split('column',.55,group(['assets']),group(['levels','objects'])),split('row',.75,group(['scene']),group(['inspector','placement'])))
    :preset==='logic'?split('row',.18,left,split('row',.64,split('column',.72,group(['scene']),group(['assets'])),split('column',.5,group(['inspector']),group(['relations','mechanisms']))))
    :split('row',Math.min(.3,Math.max(.12,(legacy?.left??220)/1366)),left,split('row',Math.max(.55,1-(legacy?.right??300)/1138),split('column',Math.max(.48,1-(legacy?.bottom??210)/650),group(['scene']),group(['assets'])),group(['inspector'])));
  let result:WorkspaceLayout={version:1,root,floating:[],hidden:panelDefinitions.map(p=>p[0]).filter(p=>!panelsIn(root).includes(p)),locked:false,maximized:null};
  if(preset==='default'&&legacy){for(const[p,open]of [['levels',legacy.leftOpen],['objects',legacy.leftOpen],['assets',legacy.bottomOpen],['inspector',legacy.rightOpen]] as const)if(open===false)result=hidePanel(result,p);}
  return result;
}
export function panelsIn(node:DockNode|null):PanelId[]{return !node?[]:node.kind==='group'?[...node.tabs]:[...panelsIn(node.first),...panelsIn(node.second)];}
export function groupsIn(node:DockNode|null):DockGroup[]{return !node?[]:node.kind==='group'?[node]:[...groupsIn(node.first),...groupsIn(node.second)];}
export function allGroups(l:WorkspaceLayout){return [...groupsIn(l.root),...l.floating.map(f=>f.group)];}
export function panelGroup(l:WorkspaceLayout,p:PanelId){return allGroups(l).find(g=>g.tabs.includes(p));}
function mapNode(node:DockNode|null,fn:(n:DockNode)=>DockNode|null):DockNode|null {if(!node)return null;let next=node;if(node.kind==='split'){const a=mapNode(node.first,fn),b=mapNode(node.second,fn);if(!a)return b;if(!b)return a;next={...node,first:a,second:b};}return fn(next);}
function without(l:WorkspaceLayout,p:PanelId):WorkspaceLayout {const prune=(n:DockNode):DockNode|null=>{if(n.kind==='split')return n;const tabs=n.tabs.filter(t=>t!==p);return tabs.length?{...n,tabs,active:tabs.includes(n.active)?n.active:tabs[0]}:null;};return {...l,root:mapNode(l.root,prune),floating:l.floating.flatMap(f=>{const g=prune(f.group);return g?[{...f,group:g as DockGroup}]:[];}),hidden:l.hidden.filter(t=>t!==p),maximized:null};}
export function activatePanel(l:WorkspaceLayout,p:PanelId):WorkspaceLayout {const fn=(n:DockNode)=>n.kind==='group'&&n.tabs.includes(p)?{...n,active:p}:n;return {...l,root:mapNode(l.root,fn),floating:l.floating.map(f=>({...f,group:fn(f.group) as DockGroup}))};}
function parentOf(n:DockNode|null,id:string):DockSplit|undefined {if(!n||n.kind==='group')return;if(n.first.id===id||n.second.id===id)return n;return parentOf(n.first,id)??parentOf(n.second,id);}
export function hidePanel(l:WorkspaceLayout,p:PanelId):WorkspaceLayout {if(p==='scene')return l;const g=panelGroup(l,p);if(!g)return l;const f=l.floating.find(f=>f.group.id===g.id),parent=parentOf(l.root,g.id);let home:PanelHome|undefined;
 if(g.tabs.length>1)home={peer:g.tabs.find(t=>t!==p),zone:'center',index:g.tabs.indexOf(p)};
 else if(f)home={zone:'center',floating:{x:f.x,y:f.y,width:f.width,height:f.height}};
 else if(parent){const first=parent.first.id===g.id;home={peer:panelsIn(first?parent.second:parent.first)[0],zone:parent.axis==='row'?(first?'left':'right'):(first?'top':'bottom'),ratio:parent.ratio};}
 return {...without(l,p),hidden:[...l.hidden.filter(t=>t!==p),p],...home?{homes:{...l.homes,[p]:home}}:{}};}
export function showPanel(l:WorkspaceLayout,p:PanelId):WorkspaceLayout {if(panelGroup(l,p))return activatePanel({...l,maximized:null},p);const home=l.homes?.[p];if(home?.floating)return floatPanel(l,p,home.floating);const previous=home?.peer&&panelGroup(l,home.peer),target=previous||panelGroup(l,p==='assets'?'scene':'inspector')||panelGroup(l,'scene')||allGroups(l)[0];if(!target)return {...without(l,p),root:group([p])};let next=movePanel(l,p,target.id,previous?home!.zone:p==='assets'?'bottom':p==='levels'||p==='objects'?'left':'center',previous?home?.index:undefined);if(previous&&home?.ratio){const g=panelGroup(next,p),parent=g&&parentOf(next.root,g.id);if(parent)next=resizeSplit(next,parent.id,home.ratio);}return next;}
export function movePanel(l:WorkspaceLayout,p:PanelId,targetId:string,zone:DockZone,index?:number):WorkspaceLayout {
  if(l.locked)return l;
  const target=allGroups(l).find(g=>g.id===targetId);if(!target)return l;
  if(target.tabs.length===1&&target.tabs[0]===p)return activatePanel(l,p);
  const next=without(l,p),insert=(n:DockNode):DockNode=>{if(n.id!==targetId||n.kind!=='group')return n;if(zone==='center'){const tabs=[...n.tabs];tabs.splice(Math.min(tabs.length,Math.max(0,index??tabs.length)),0,p);return {...n,tabs,active:p};}const first=zone==='left'||zone==='top',pane=group([p]);return split(zone==='left'||zone==='right'?'row':'column',first?.35:.65,first?pane:n,first?n:pane);};
  const floatTarget=next.floating.find(f=>f.group.id===targetId);
  if(floatTarget&&zone!=='center')return l;
  return {...next,root:mapNode(next.root,insert),floating:next.floating.map(f=>({...f,group:insert(f.group) as DockGroup}))};
}
export function floatPanel(l:WorkspaceLayout,p:PanelId,rect?:Partial<Omit<FloatingGroup,'group'>>):WorkspaceLayout {if(l.locked)return l;return {...without(l,p),floating:[...without(l,p).floating,{group:group([p]),x:70,y:50,width:p==='guide'?850:440,height:440,...rect}]};}
export function dockPanel(l:WorkspaceLayout,p:PanelId):WorkspaceLayout {if(l.locked)return l;const target=groupsIn(l.root)[0];return target?movePanel(l,p,target.id,'center'):{...without(l,p),root:group([p])};}
export function resizeSplit(l:WorkspaceLayout,id:string,ratio:number):WorkspaceLayout {if(l.locked||!Number.isFinite(ratio))return l;return {...l,root:mapNode(l.root,n=>n.kind==='split'&&n.id===id?{...n,ratio:Math.min(.92,Math.max(.08,ratio))}:n)};}
export function fitFloating(f:FloatingGroup,w:number,h:number):FloatingGroup {const width=Math.min(Math.max(240,f.width),Math.max(1,w)),height=Math.min(Math.max(150,f.height),Math.max(1,h));return {...f,width,height,x:Math.max(0,Math.min(f.x,w-width)),y:Math.max(0,Math.min(f.y,h-height))};}
/** Reject corrupt, duplicate or overly nested data; new panels start hidden on upgrade. */
export function readWorkspace(value:unknown):WorkspaceLayout|null {try{
  if(!value||typeof value!=='object')return null;const v=value as WorkspaceLayout;if(v.version!==1||!Array.isArray(v.floating)||v.floating.length>panelDefinitions.length||!Array.isArray(v.hidden))return null;
  const seen=new Set<PanelId>(),nodeIds=new Set<string>();const take=(p:unknown)=>{if(!isPanel(p)||seen.has(p))throw Error('panel');seen.add(p);return p;};
  const node=(n:DockNode,depth=0):DockNode=>{if(!n||depth>48||typeof n.id!=='string'||n.id.length>100||nodeIds.has(n.id))throw Error('node');nodeIds.add(n.id);if(n.kind==='group'){if(!Array.isArray(n.tabs)||!n.tabs.length||!n.tabs.includes(n.active))throw Error('tabs');return {...n,tabs:n.tabs.map(take)};}if(n.kind!=='split'||!['row','column'].includes(n.axis)||!Number.isFinite(n.ratio)||n.ratio<.08||n.ratio>.92)throw Error('split');return {...n,first:node(n.first,depth+1),second:node(n.second,depth+1)};};
  const root=v.root===null?null:node(v.root);const floating=v.floating.map(f=>{if(!f||![f.x,f.y,f.width,f.height].every(Number.isFinite)||f.width<1||f.height<1)throw Error('float');const g=node(f.group);if(g.kind!=='group')throw Error('float group');return {...f,group:g};});
  const hidden=v.hidden.map(take);if(!seen.has('scene')||hidden.includes('scene'))return null;for(const[p]of panelDefinitions)if(!seen.has(p))hidden.push(p);
  const homes:Partial<Record<PanelId,PanelHome>>={};if(v.homes&&typeof v.homes==='object')for(const[p,h]of Object.entries(v.homes)){if(!isPanel(p)||!h||!['center','left','right','top','bottom'].includes(h.zone)||h.peer!==undefined&&(!isPanel(h.peer)||h.peer===p)||h.ratio!==undefined&&(!Number.isFinite(h.ratio)||h.ratio<.08||h.ratio>.92)||h.index!==undefined&&(!Number.isInteger(h.index)||h.index<0||h.index>panelDefinitions.length))continue;if(h.floating&&(![h.floating.x,h.floating.y,h.floating.width,h.floating.height].every(Number.isFinite)||h.floating.width<1||h.floating.height<1))continue;homes[p]=h;}
  return {version:1,root,floating,hidden,locked:v.locked===true,maximized:isPanel(v.maximized)&&!hidden.includes(v.maximized)?v.maximized:null,...Object.keys(homes).length?{homes}:{}};
}catch{return null;}}
