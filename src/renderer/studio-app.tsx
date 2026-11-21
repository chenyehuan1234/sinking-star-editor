import {PerformancePanel,PerformanceStatus} from './performance-panel';
import {performanceCapture as perf,type Ticket} from './performance-capture';
import {useLayoutEffect} from 'react';
import {PreparationProgress,usePreparationProgress} from './preparation-progress';
import {currentInputGroup} from '../live-input';
import './level-features.css';
import {TimingControls,RoomPowerControls} from './level-settings-controls';
import type {LevelSetting,LevelSettings} from '../level-settings';
import {terrainFaceColor,terrainPlacementFaces,validTerrainColor,type TerrainPalette,type TerrainFacePaint,type TerrainPlacementKind} from '../terrain-paint';
import {UnifiedCameraPanel} from './unified-camera-panel';
import {ChannelPanel,type ChannelMember,type ChannelProposal} from './channel-panel';
import {AssociationPicker} from './association-picker';
import {sceneProject} from '../scene-project';
import {WorldEntryInspector} from './world-entry-inspector';
import type {ReferenceControls} from './reference-controls';
import {freezerTargetTypes,isFreezerCondition,levelAssociationTargets,nativeValue,objectName,type AssociationTarget,type IndexedAssociation} from '../association';
import {screenLayout} from '../camera-layout';
import {RectanglePickerProvider} from './rectangle-picker';
import {PointPickerProvider} from './point-picker';
import {entityLabel} from './entity-label';
import {defaultSceneryVisibility,sceneryCategories,type SceneryVisibility} from './scene-display';
import {NativeWorldSettings} from './native-world-settings';
import {WorldRange} from './world-range';
import {mapSpawn,upgradeSpatialWorld,worldContains,worldTerrain,worldVerticalBounds,worldVoxels,worldXYLimit} from '../world-space';
import {regionCorners} from '../region-placement';
import {RegionPasteDialog} from './region-paste-dialog';
import {LevelDirectory} from './level-directory';
import {createWorkbenchApi} from './native-session';
import {nativeDocument} from '../native-project';
import type {NativeWorldIndex} from '../v08-types';
import {restoreSceneDisplay} from './scene-display';
import './alpha4.css';
import {resolveGate,configureGate,decodeGateKey} from '../gate-config';
import './alpha3.css';
import {ExportDialog} from './export-dialog';
import {LevelImportDialog} from './level-import-dialog';
import {PlayButton} from './play-button';
import {ValidationPanel} from './validation-panel';

import {MaintenancePanel} from './maintenance-panel';
import {NativeWorldWorkspace} from './native-world-workspace';
import {PLAYTEST_SUSPENSION} from '../playtest-policy';
import{UpdateDialog}from'./update-dialog';
import './studio-v0713.css';
import{WaterPanel}from'./water-panel';import{waterEditCells,type WaterBrush}from'../water-edit';
import{DockWorkspace,type WorkspaceHandle}from'./dock-workspace';import{isPanel,type PanelId}from'../workspace-layout';
import{adoptionReason}from'../camera-framing';
import{useQuickSlots}from'./use-quick-slots';import{QuickBar}from'./quick-bar';import{ordinarySlotType,type QuickSlot,type SlotHabits}from'../quick-slots';import{defaultTerrainPreferences,validateTerrainPreferences,type TerrainPreferences}from'../terrain-edit';
import{rememberedView}from'../ui-memory';
import {PreviewSession} from './preview-session';
import {VirtualList} from './virtual-list';
import {OrganizationPanel} from './organization-panel';
import {ArrayPanel} from './array-panel';
import {CommandPalette} from './command-palette';
import {executeCommand} from './commands';
import {arrayOperations,type ArraySpec} from '../batch-edit';
import {removeWorldLevel,reservedEntityIds,nextEntityId,operationTargets,entityKey,entryKey,organizeOperations,removeMembers,copyGroups,type EditorMetadata,type ObjectKey} from '../editor-organization';
import {terrainTouchesLocked,objectLocked,keyLocked,keyVisible} from './scene-display';
import './studio-v079.css';
import{channelLinkOperations,ordinaryChannelObject}from'../placement-edit';
import{TopologyInspector}from'./topology-inspector';
import{mergeTopologyChange}from'../topology-changes';
import{SetupScreen,WorkspaceSettings}from'./setup';
import{mergeCameraChange}from'../camera-changes';
import{cameraOwnedIds}from'../camera-regions';
import{CameraRegionsPanel}from'./camera-regions-panel';import type{CameraObjectRequest}from'../shared';
import{optimisticTransforms,optimisticPropertyDraft,retainSceneBuffers}from'../scene-updates';
import{Guide}from'./guide';
import{NativeLevelPicker}from'./native-level-picker';
import{PROFILE_FIELDS}from'../profile-metadata';
import{useCommands,useInputPreferences,SettingsPanel,shortcut,preference,setPreference,commandDefinitions}from'./commands';import{commandScopes,placementProfile,type PlacementPreferences}from'../input-config';import{PlacementTools,MechanismPanel}from'./placement-tools';
import{DisplayPanel,RelationsPanel,RegionPanel,AssemblyPanel,RecoveryPanel,RunPicker}from'./studio-tools';import{relationsFor,defaultDisplay,categoryOf,canModify,type SceneDisplay}from'./scene-display';import type{RegionBundle,RecoveryItem,AssemblyItem,RunRequest}from'../shared';
import React,{useEffect,useMemo,useRef,useState}from'react';
import type{CameraConfig,TopologyConfig,Catalog,EditOp,EditorProject,EntityView,LevelView,Vec3,WorldProject,WorldIssue,WorldLevel}from'../shared';import type{ObjectCatalog,ObjectPreset}from'../catalog-types';
import{upgradeProject,upgradeWorld}from'../core/migrate';import{StudioViewport,designObject,type Placement}from'./studio-viewport';import{AssetLibrary,recordRecentPlacement,readPref,writePref}from'./asset-library';import{StudioInspector,BufferInput}from'./studio-inspector';import{Icon,IconButton,Modal,typeLabel}from'./studio-ui';
import './studio.css';import './studio-v07.css';
import{designVisible,nativeQuaternion}from'../editor-math';
const clone=<T,>(v:T):T=>structuredClone(v),uid=(prefix:string)=>prefix+'_'+crypto.randomUUID().replaceAll('-','').slice(0,10);
type Frame={world:WorldProject;view:string;gameplay?:number};
export function StudioApp(props:{onViewportProbe?:(state:any)=>void}={}){return <RectanglePickerProvider><PointPickerProvider><StudioWorkbench {...props}/></PointPickerProvider></RectanglePickerProvider>;}
function StudioWorkbench(_props:{onViewportProbe?:(state:any)=>void}={}){
 const [singleLevel,setSingleLevel]=useState(false);
 const bridge=useRef(createWorkbenchApi(window.editor)).current,api=bridge.api;const nativeOpen=false;const[nativeIndex,setNativeIndex]=useState<NativeWorldIndex|null>(null);const[rangeTick,setRangeTick]=useState(0),[streamLoading,setStreamLoading]=useState(false);const rangeKey=useRef('');const viewport=useRef<any>(null);
 const[compatibilityReport,setCompatibilityReport]=useState<Awaited<ReturnType<typeof api.inspectCompatibility>>>(null);
 const[theme,setTheme]=useState(()=>readPref<string>('theme0713','dark')),[simple,setSimple]=useState(()=>readPref('simple0713',!readPref('dockWorkspace',null)));
 useEffect(()=>{document.documentElement.dataset.theme=theme;writePref('theme0713',theme);window.dispatchEvent(new Event('sstar:theme'));},[theme]);
 useEffect(()=>{document.documentElement.dataset.simple=String(simple);writePref('simple0713',simple);},[simple]);

  const[catalog,setCatalog]=useState<Catalog|null>(null),[objects,setObjects]=useState<ObjectCatalog|null>(null),[world,setWorld]=useState<WorldProject|null>(null),[view,setView]=useState('world'),[level,setLevel]=useState<LevelView|null>(null),[selection,setSelection]=useState<number[]>([]),[entryId,setEntryId]=useState<string|null>(null),[placing,setPlacing]=useState<Placement|null>(null),[tool,setTool]=useState('select'),[layer,setLayer]=useState(0),[continuous,setContinuous]=useState(true),[brush,setBrush]=useState(1),[design,setDesign]=useState(()=>readPref('designView05',true)),[fit,setFit]=useState(0),[draft,setDraft]=useState<EditOp[]>([]),[strokeCells,setStrokeCells]=useState<{x:number;y:number;z:number;solid:boolean}[]>([]);

  const launchPending=useRef(false);const[status,setStatus]=useState('连接原游戏…'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[issues,setIssues]=useState<WorldIssue[]>([]),[issueOpen,setIssueOpen]=useState(false),[dirty,setDirty]=useState(false),[revision,setRevision]=useState(0),[dialog,setDialog]=useState(''),[renaming,setRenaming]=useState(''),[context,setContext]=useState<{id:string;x:number;y:number}|null>(null),[quick,setQuick]=useState(''),[hover,setHover]=useState<Vec3>([0,0,0]),[picking,setPicking]=useState<{field:string;ids:number[];advanced?:boolean}|null>(null),[entityQuery,setEntityQuery]=useState('');const[entityCategory,setEntityCategory]=useState('all'),[validationState,setValidationState]=useState<'idle'|'checking'|'ready'|'failed'>('idle');
  const preparationProgress=usePreparationProgress(setStatus);
  const[waterBrush,setWaterBrush]=useState<WaterBrush>(()=>{const v=readPref<Partial<WaterBrush>>('waterBrush',{});return{id:0,mode:['flow','still','water','hole'].includes(v.mode??'')?v.mode!:'flow',direction:[1,2,3,4].includes(v.direction??0)?v.direction!:1,shape:v.shape==='rectangle'?'rectangle':'stroke',showArrows:readPref<boolean>("allWaterFlow097",true)};});const pendingWater=useRef<number|null>(null),waterViewKey=useRef('');
  const[relationScope,setRelationScope]=useState<import('./relation-visuals').RelationScope>('selected');
  const[paletteOpen,setPaletteOpen]=useState(false),[arrayPreview,setArrayPreview]=useState<Vec3[]>([]),[overlapMode,setOverlapMode]=useState(false);const [selectedEntries,setSelectedEntries]=useState<string[]>([]);
  const previewSession=useRef(new PreviewSession(api)),preparedPreview=useRef(new WeakMap<WorldProject,{view:string;level:LevelView}>()),savedWorld=useRef<WorldProject|null>(null),gameplayIds=useRef(new WeakMap<WorldProject,number>()),gameplaySequence=useRef(0),editEpoch=useRef(0);const[sceneRevision,setSceneRevision]=useState(0);
  const[guideOpen,setGuideOpen]=useState(false),[guideFocus,setGuideFocus]=useState(0);const guideReturn=useRef<HTMLElement|null>(null);
  function openGuide(){window.dispatchEvent(new Event('sstar:cancel-gesture'));if(!guideOpen)guideReturn.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setGuideOpen(true);setGuideFocus(v=>v+1);}
  function closeGuide(){setGuideOpen(false);requestAnimationFrame(()=>{if(guideReturn.current?.isConnected)guideReturn.current.focus();});}
  useCommands(id=>{if(id==='help'||id==='helpSearch'){openGuide();return true;}if(nativeOpen)return guideOpen;if(id==='palette'){window.dispatchEvent(new Event('sstar:cancel-gesture'));setPaletteOpen(true);return true;}if(paletteOpen)return true;return guideOpen;},100);
  const[dockedGuideReading,setDockedGuideReading]=useState<import('./guide').GuideReading|undefined>(),[dockedGuideKey,setDockedGuideKey]=useState(0),[visiblePanels,setVisiblePanels]=useState<PanelId[]>([]);const workspace=useRef<WorkspaceHandle>(null),[layoutMenuHost,setLayoutMenuHost]=useState<HTMLDivElement|null>(null);const workshopValue=useRef('');
  function setWorkshop(next:React.SetStateAction<string>){let value=typeof next==='function'?next(workshopValue.current):next;if(value==='cameraRegions'){value='camera';setCameraRegionsMode(true);}workshopValue.current=value;setWorkshopState(value);if(isPanel(value))workspace.current?.show(value);else if(!value)workspace.current?.show('inspector');}
  const[loadedView,setLoadedView]=useState('');
  const[heightMode,setHeightMode]=useState<'surface'|'locked'>(()=>readPref('heightMode','surface')),[entryPrototype,setEntryPrototype]=useState<ObjectPreset|null>(null);
  const [regionBox,setRegionBox]=useState<{min:Vec3;max:Vec3}|null>(null),[allCopyHeights,setAllCopyHeights]=useState(false);
  const activeRegionJob=useRef<string|null>(null);
  const [regionProgress,setRegionProgress]=useState('');
  const [regionPaste,setRegionPaste]=useState<{at:Vec3;yaw:number;bundle:RegionBundle}|null>(null);
  const[workshop,setWorkshopState]=useState(''),[display,setDisplay]=useState<SceneDisplay>(defaultDisplay),[clipboard,setClipboard]=useState<RegionBundle|null>(null),[copyRange,setCopyRange]=useState<[number,number]>([0,0]),[assemblies,setAssemblies]=useState<AssemblyItem[]>([]),[recoveries,setRecoveries]=useState<RecoveryItem[]>([]),[runMode,setRunMode]=useState<RunRequest['mode']>('world'),[runIds,setRunIds]=useState<string[]>([]);
  const inputPreferences=useInputPreferences();
  const[placementPrefs,setPlacementState]=useState<PlacementPreferences>(()=>({...preference('placement',placementProfile('mechanism')),continuous:true})),[sampling,setSampling]=useState(false),[cameraId,setCameraId]=useState(0),[cameraRoom,setCameraRoom]=useState<[number,number]>([0,0]),[cameraEdit,setCameraEdit]=useState(false),[cameraEditSource,setCameraEditSource]=useState<'camera'|'screen'>('camera'),[cameraDraft,setCameraDraft]=useState<CameraConfig|null>(null),[cameraLayoutDraft,setCameraLayoutDraft]=useState<import('../editor-organization').CameraPlan|undefined>(),[workplaneRequest,setWorkplaneRequest]=useState(0);const temporaryDisplay=useRef<SceneDisplay|null>(null),pendingIssue=useRef<{issue:WorldIssue;reveal:boolean}|null>(null);
  function setPlacementPrefs(value:PlacementPreferences){setPlacementState(value);setContinuous(value.continuous);setPreference('placement',value);setPreference('placementProfile:'+value.profile,value);}
  const placementMemory=useRef<Partial<Record<PlacementPreferences['profile'],{placing?:Placement;tool:string;prefs:PlacementPreferences}>>>({});
  const sampleCache=useRef(new WeakMap<EntityView,Map<string,RegionBundle>>());
  useEffect(()=>{if(['floor','wall'].includes(tool))placementMemory.current.terrain={tool,prefs:placementPrefs};else if(placing)placementMemory.current[placementPrefs.profile]={placing:{...placing,drag:false},tool:'select',prefs:placementPrefs};},[placing,tool,placementPrefs]);
  function changePlacementMode(profile:PlacementPreferences['profile']){const previous=placementMemory.current[profile];cancel();setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);setPlacementPrefs({...previous?.prefs??preference('placementProfile:'+profile,placementProfile(profile)),profile,continuous:true});if(profile==='terrain'){setSelection([]);setTool(previous?.tool==='wall'?'wall':'floor');setStatus('地形矩形 · 中键取样机关即可切换');}else if(previous?.placing){setPlacing({...previous.placing,drag:false});setStatus('继续放置上次物件 · 中键取样地形即可切换');}else setStatus('从素材栏选择物件，或在画布中键单击取样');}
  function sampleTerrain(cell:Vec3,normal:Vec3,color=terrainFaceColor(level?.terrain??[],cell,normal,palette)){cancel();setCameraEdit(false);setSelection([]);setPlacementPrefs({...preference('placementProfile:terrain',placementProfile('terrain')),continuous:true});const kind=normal[2]?'floor':'wall';changeTerrainPlacement(kind,color);setTerrainPaintColor(color);setLayer(cell[2]+(normal[2]?1:0));setTool(kind);setStatus('已取样'+(kind==='floor'?'地板':'墙体')+'与颜色 '+color.toUpperCase()+' · 拖出矩形继续铺设');}
  function useEditorTool(next:string){setCameraRegionsMode(false);sampleEpoch.current++;setSampling(false);setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);if(['floor','wall','erase'].includes(next)){setPlacing(null);setPicking(null);setSelection([]);setPlacementPrefs({...preference('placementProfile:terrain',placementProfile('terrain')),continuous:true});}setTool(next);}
  const[terrainPrefs,setTerrainState]=useState<TerrainPreferences>(()=>{try{return validateTerrainPreferences(readPref('terrain0710',{...defaultTerrainPreferences(),plane:readPref('terrainPlane075','auto')}));}catch{return defaultTerrainPreferences();}});
  function setTerrainPrefs(v:TerrainPreferences){try{const valid=validateTerrainPreferences(v);window.dispatchEvent(new Event('sstar:cancel-gesture'));setTerrainState(valid);writePref('terrain0710',valid);}catch(e){setError(String(e));}}
  const quickSlots=useQuickSlots({catalog,context:(world?.id??'')+':'+view,world:view==='world'&&!world?.native,layer,habits:{placement:placementPrefs,heightMode,yaw:placing?.yaw??0,terrain:terrainPrefs},matches:(s,i)=>!cameraEdit&&!sampling&&(s.kind==='terrain'?tool===s.tool&&!placing:placing?.slot===i),capture:captureSlot,use:(s,i,z)=>{cancel();setSelection([]);setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);setPlacementPrefs(clone(s.habits.placement));setHeightMode(s.habits.heightMode);setLayer(z);setTerrainState(clone(s.habits.terrain));if(s.kind==='terrain')setTool(s.tool);else{setTool('select');setPlacing({key:'quick:'+i+':'+uid('preview'),bundle:clone(s.bundle),yaw:s.habits.yaw,slot:i});}setStatus('快捷槽 '+(i+1)+' · '+s.name+' · 右键或 Esc 取消');},error:setError});
  async function captureSlot(presetKey?:string):Promise<QuickSlot>{if(view==='world'&&!world?.native&&!['floor','wall','erase'].includes(tool))throw Error('请进入小关后保存物件快捷槽');const targetView=view;await parameterQueue.current;if(currentView.current!==targetView)throw Error('已切换关卡，快捷槽保存已取消');const sourceProject=targetView==='world'&&current.current?.native?{format:'sinking-star-project' as const,version:3 as const,sourceHash:current.current.sourceHash,sourceBuild:current.current.sourceBuild,template:'overworld',name:'overworld',operations:current.current.map.objects??[]}:current.current?.levels.find(l=>l.id===targetView)?.project;const habits:SlotHabits={placement:clone(placementPrefs),heightMode,yaw:placing?.yaw??0,terrain:clone(terrainPrefs)};const slotKey=presetKey??placing?.key??'',preset=objects?(resolveGate(objects,slotKey)??objects.presets.find(p=>p.key===slotKey)):undefined;if(preset?.type==='Wall_Set'||!presetKey&&['floor','wall','erase'].includes(tool)){cancel();return{kind:'terrain',name:tool==='erase'?'地形擦除':tool==='floor'?'地面':'墙体',tool:tool==='erase'?'erase':tool==='floor'?'floor':'wall',habits:{...habits,yaw:0,placement:{...habits.placement,profile:'terrain',associations:'independent'}}};}
   let bundle:RegionBundle,type:string,name:string,key:string|undefined;if(preset){if(!preset.parsed||preset.placement!=='single'||!ordinarySlotType(preset.type))throw Error('此对象请使用专用工具或我的组合');type=preset.type;name=preset.label;key=preset.key;bundle=await api.regionCapture({format:'sinking-star-project',version:3,sourceHash:catalog!.sourceHash,sourceBuild:catalog!.build,template:preset.template,name:'quick_slot',operations:preset.placementValues?[{kind:'properties',id:preset.sourceId,values:preset.placementValues},{kind:'transform',id:preset.sourceId,yaw:preset.placementYaw??0}]:[]},{ids:[preset.sourceId],single:true,associations:'independent',...(preset.placementValues?{copyPolicy:'preserve' as const}:{})});}else if(placing?.bundle){bundle=clone(placing.bundle);if(bundle.records.length!==1||bundle.terrain.length)throw Error('多物件组合请使用我的组合');type=bundle.records[0].type;name=typeLabel(type);}else{if(selection.length!==1||!selectedLevel)throw Error('请先取样、选择一件物品，或启用地形工具');const e=level?.entities.find(e=>e.id===selection[0]);if(!e||!canModify(e,display,layer)||!ordinarySlotType(e.type)||protectedCameraIds.has(e.id))throw Error('此对象不能保存到普通快捷槽');type=e.type;name=String(e.nativeProperties?.find(p=>p.field.name==='entity_name')?.value||typeLabel(e.type));key=objects?.presets.find(p=>p.type===e.type&&p.mesh===e.mesh)?.key;bundle=await api.regionCapture(sourceProject??selectedLevel.project,{ids:[e.id],single:true,associations:'independent',copyPolicy:'preserve'});habits.yaw=0;}
   if(!ordinarySlotType(type))throw Error('此对象请使用专用工具');cancel();return{kind:'object',name,type,presetKey:key,bundle:{...bundle,copyPolicy:'preserve',origin:undefined},habits:{...habits,placement:{...habits.placement,profile:'mechanism',associations:'independent'}}};}
  const wasDirty=useRef(false);const recoveryClock=useRef(Date.now()),dirtyRef=useRef(false),recoveryInFlight=useRef(false);dirtyRef.current=dirty;
  const terrainPreset=useRef<string|null>(null);const sampleEpoch=useRef(0);const[cameraRegionId,setCameraRegionId]=useState(0),[cameraRegionsMode,setCameraRegionsMode]=useState(false),[cameraProbing,setCameraProbing]=useState(false),[cameraProbe,setCameraProbe]=useState<Vec3|null>(null);const parameterQueue=useRef(Promise.resolve());const [pendingTransforms,setPendingTransforms]=useState<EditOp[]>([]);const pendingRef=useRef<EditOp[]>([]);
  function clearPending(){pendingRef.current=[];setPendingTransforms([]);}
  const levelDrag=useRef<{id:string;x:number;y:number;moved:boolean}|null>(null);
  const current=useRef(world),currentView=useRef(view),saved=useRef(''),history=useRef<{undo:Frame[];redo:Frame[]}>({undo:[],redo:[]}),working=useRef(false),previewSeq=useRef(0),stroke=useRef<{before:WorldProject;worldDraft?:WorldProject;cells:Map<string,{x:number;y:number;z:number;solid:boolean}>}|null>(null);current.current=world;currentView.current=view;
  const protectedCameraIds=useMemo(()=>cameraOwnedIds(level),[level]);
  const native=Boolean(world?.native),nativeWorld=native&&view==='world';const selectedLevel=world?.levels.find(l=>l.id===view),editingProject=useMemo(()=>world?sceneProject(world,view):undefined,[world,view]),selected=useMemo(()=>{const ids=new Set(selection);return level?.entities.filter(e=>ids.has(e.id))??[];},[level,selection]),entry=world?.map.entries.find(e=>e.id===entryId);
  const entryKeysByEntity=useMemo(()=>new Map(Object.entries(level?.managedEntryIds??{}).map(([key,id])=>[id,key])),[level?.managedEntryIds]);
  const selectedWater=level?.waters?.find(w=>w.id===waterBrush.id),waterEntity=level?.entities.find(e=>e.id===waterBrush.id);
  const waterReason=!selectedWater?'先选择或新建一片水域':!waterEntity?.editable?'水域不能独立解析':!canModify(waterEntity,display,layer)?'水域已隐藏、锁定或不在当前显示高度':selectedWater.kind===1?'该水域仅阻挡玩家，请在属性中改为普通水域':selectedWater.error??'';
  function changeWaterBrush(v:Partial<WaterBrush>){window.dispatchEvent(new Event('sstar:cancel-gesture'));if(v.id!==undefined)pendingWater.current=null;setWaterBrush(b=>({...b,...v}));}
  useEffect(()=>{const{id,...prefs}=waterBrush;writePref('waterBrush',prefs);writePref('allWaterFlow097',waterBrush.showArrows);},[waterBrush.mode,waterBrush.direction,waterBrush.shape,waterBrush.showArrows]);
  function waterTool(){if(waterReason){setError(waterReason);return;}cancel();setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);setTool('water');setWorkshop('water');setStatus('水域编辑 · 左键绘制，右键拖动旋转 · 右键单击／Esc 退出');}
  function createWater(v:Omit<import('../shared').WaterCreateOp,'kind'|'id'>){cancel();setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);const id=nextId();pendingWater.current=id;setWaterBrush(b=>({...b,id}));append([{kind:'waterCreate',id,...v}]);setStatus('已创建普通水域；选择方向后开始绘制');}
  function resizeWater(v:Omit<import('../shared').WaterResizeOp,'kind'|'id'>){if(waterReason){setError(waterReason);return;}cancel();append([{kind:'waterResize',id:waterBrush.id,...v}]);}
  function commitWater(op:import('../shared').WaterPaintOp){if(waterReason||op.id!==waterBrush.id){if(waterReason)setError(waterReason);return Promise.resolve(false);}return applyParameters([op]).then(ok=>{if(ok)setStatus('水域已修改 '+op.cells.length+' 格 · 可一步撤销');return ok;});}
  useEffect(()=>{if(loadedView!==view)return;const waters=level?.waters??[],key=(world?.id??'')+':'+view;let id=waterBrush.id;if(waterViewKey.current!==key){waterViewKey.current=key;pendingWater.current=null;id=readPref('waterTarget:'+key,0);}const pending=pendingWater.current;if(pending){if(!waters.some(w=>w.id===pending))return;pendingWater.current=null;id=pending;setSelection([id]);}else if(selection.length===1&&waters.some(w=>w.id===selection[0]))id=selection[0];if(!waters.some(w=>w.id===id))id=waters[0]?.id??0;setWaterBrush(b=>b.id===id?b:{...b,id});if(world&&id)writePref('waterTarget:'+key,id);},[level?.waters,view,loadedView,selection]);
  async function task<T>(fn:()=>Promise<T>,message?:string){if(working.current)return;working.current=true;setBusy(true);setError('');if(message)setStatus(message);try{return await fn();}catch(e){setError(String(e).replace(/^Error: Error invoking remote method '[^']+': Error: /,''));}finally{working.current=false;setBusy(false);}}
  function toggleWorkshop(tab:string){setWorkshop(v=>v===tab?'':tab);}
  useLayoutEffect(()=>{window.projectTabs?.report({title:world?.name??'连接游戏',dirty,busy});},[world?.name,dirty,busy]);
  function changeDisplay(d:SceneDisplay){writePref('sceneryVisibility091',Object.fromEntries(sceneryCategories.map(k=>[k,d.categories[k].visible])));setDisplay(d);if(world){const {isolate,...persistent}=d;writePref('display06:'+world.id+':'+view,persistent);}}
  async function refreshRecovery(){if(current.current)setRecoveries(await api.recoveryList(current.current));}
  async function persistRecovery(){if(!current.current||!dirtyRef.current||recoveryInFlight.current)return;recoveryInFlight.current=true;try{await parameterQueue.current;await api.recoveryWrite(clone(current.current));recoveryClock.current=Date.now();}catch(e){setError('自动恢复保存失败：'+String(e));}finally{recoveryInFlight.current=false;}}
  async function restoreRecovery(id:string){await task(async()=>{const original=saved.current;await parameterQueue.current;if(dirtyRef.current)await api.recoveryWrite(clone(current.current!));const restored=await api.recoveryRestore(current.current!,id);accept(restored);saved.current=original;setDirty(JSON.stringify(restored)!==original);setStatus('已恢复为草稿，正式工程文件保持不变');setDialog('');});}
  function accept(w:WorldProject,startView?:string){numericHistory.current=null;worldReturn.current=null;returnPending.current=false;navigationTicket.current++;sampleEpoch.current++;placementMemory.current={};sampleCache.current=new WeakMap();editEpoch.current++;clearPending();const next=upgradeSpatialWorld(upgradeWorld(w));current.current=next;gameplayIds.current.set(next,++gameplaySequence.current);savedWorld.current=next;setWorld(next);setSceneRevision(n=>n+1);saved.current=JSON.stringify(next);setDirty(false);history.current={undo:[],redo:[]};setRevision(n=>n+1);setView(startView??(singleLevel?next.levels[0]?.id:undefined)??rememberedView(next.levels,readPref('lastView:'+next.id,null)));setSelection([]);setEntryId(null);setPlacing(null);setStatus('已打开 '+next.name+(next.sourceEvidence?.history?.length?' · 已按当前游戏读取':''));}
  async function connected(c:Catalog){let initial:WorldProject|null=null,warning='';try{initial=await api.worldStartup();}catch(e){warning=String(e);}const w=initial??await api.worldCreate(),start=await window.workbenchHome?.startScene();const single=Boolean(start?.singleLevel&&w.levels.length===1),scene=single?w.levels[0].id:start?.scene;setSingleLevel(single);accept(w,scene&&(scene==='world'||w.levels.some(l=>l.id===scene))?scene:undefined);setCatalog(c);if(warning)setError(warning);else setStatus(c.compatibility??'已连接原游戏');void api.objectCatalog().then(setObjects).catch(e=>setError(String(e)));}
  function update(w:WorldProject,record=true,before=current.current,metadataOnly=false,inputGroup=currentInputGroup()){if(metadataOnly&&before)gameplayIds.current.set(w,gameplayIds.current.get(before)??0);else if(!gameplayIds.current.has(w))gameplayIds.current.set(w,++gameplaySequence.current);if(record&&before){if(!inputGroup||numericHistory.current?.key!==inputGroup||numericHistory.current.after!==before)history.current.undo=[...history.current.undo.slice(-99),{world:before,view:currentView.current}];history.current.redo=[];numericHistory.current=inputGroup?{key:inputGroup,after:w}:null;}current.current=w;setWorld(w);setDirty(w!==savedWorld.current);setRevision(n=>n+1);if(!metadataOnly)setSceneRevision(n=>n+1);setError('');}
  function edit(fn:(w:WorldProject)=>void,metadataOnly=false,inputGroup=currentInputGroup()){if(!current.current)return;const w=clone(current.current);fn(w);update(w,true,current.current,metadataOnly,inputGroup);}
  function append(ops:EditOp[]){
    if(!ops.length||!current.current)return false;
    if(ops.some(op=>op.kind==='terrain'&&terrainTouchesLocked(level,display,op.cells))){setError('地形操作涉及锁定对象，请先解锁');return false;}
    if(ops.some(op=>['transform','properties','delete','profile'].includes(op.kind)&&protectedCameraIds.has(op.id))){setError('原生相机对象请在镜头面板的高级管理中编辑');return false;}
    if(ops.some(op=>operationTargets(op).some(id=>{
      const entry=entryKeysByEntity.get(id);
      if(entry)return keyLocked(entryKey(entry),display);
      const e=knownEntities.get(id);
      return e&&objectLocked(e,display);
    }))){setError('操作涉及锁定对象，请先解锁');return false;}
    const transforms=ops.filter(op=>op.kind==='transform'),original=current.current,w=clone(original);
    if(currentView.current==='world'){
      const ordinary:EditOp[]=[];
      let changedHeight=false;
      for(const op of ops){
        const entryId=entryKeysByEntity.get(op.id),spawn=op.id===level?.managedSpawnId;
        if(!entryId&&!spawn){ordinary.push(op);continue;}
        if(op.kind!=='transform'){setError('请在大地图属性中调整所选对象');return false;}
        const position=op.position;
        if(position&&(position.some(n=>!Number.isInteger(n)||Math.abs(n)>=10000)||!worldContains(w.map,position[0],position[1]))){
          setError(entryId?'入口位置超出地图':'出生位置超出地图');return false;
        }
        if(spawn){
          if(!position)continue;
          changedHeight||=(w.map.spawnZ??0)!==position[2];
          [w.map.spawn[0],w.map.spawn[1],w.map.spawnZ]=position;
        }else{
          const entry=w.map.entries.find(e=>e.id===entryId);
          if(!entry)return false;
          if(position){changedHeight||=(entry.z??0)!==position[2];[entry.x,entry.y,entry.z]=position;}
          if(op.rotation)entry.rotation=op.rotation;
          if(op.scale)entry.scale=op.scale;
        }
      }
      if(changedHeight&&w.version===4)try{worldVerticalBounds(w.map);}catch(error){setError(error instanceof Error?error.message:String(error));return false;}
      if(ordinary.length){w.map.objects??=[];w.map.objects.push(...ordinary);w.map.editor=organizeOperations(w.map.editor,ordinary);}
    }else{
      const project=w.levels.find(l=>l.id===currentView.current)?.project;
      if(!project)return false;
      project.operations.push(...ops);project.editor=organizeOperations(project.editor,ops);
    }
    if(transforms.length){pendingRef.current=[...pendingRef.current,...transforms];setPendingTransforms(pendingRef.current);}
    setDraft([]);update(w,true,original);return true;
  }
  function applyParameters(ops:EditOp[]){if(currentView.current==='world'&&ops.some(op=>op.id===level?.managedSpawnId||entryKeysByEntity.has(op.id)))return Promise.resolve(append(ops));const inputGroup=currentInputGroup(),submittedDraft=draftRef.current;if(ops.some(op=>operationTargets(op).some(id=>{const e=level?.entities.find(e=>e.id===id);return e&&objectLocked(e,display);}))){setError('操作涉及锁定对象，请先解锁');return Promise.resolve(false);}let submitted=false;const target=currentView.current,epoch=editEpoch.current;parameterQueue.current=parameterQueue.current.then(async()=>{for(let attempt=0;attempt<3;attempt++){const before=current.current;if(!before||epoch!==editEpoch.current)return;const w=clone(before);if(target==='world'){w.map.objects??=[];w.map.objects.push(...ops);}else{const l=w.levels.find(l=>l.id===target);if(!l)return;l.project.operations.push(...ops);}try{const result=await previewSession.current.request(w.id+':'+target,target==='world'?{world:w}:{project:w.levels.find(l=>l.id===target)!.project});if(epoch!==editEpoch.current)return;if(current.current!==before)continue;preparedPreview.current.set(w,{view:target,level:result});if(currentView.current===target){previewSeq.current++;setLevel(result);setLoadedView(target);clearPending();}update(w,true,before,false,inputGroup);if(draftRef.current===submittedDraft)setDraft([]);submitted=true;return;}catch(e){setError(String(e).replace(/^Error: /,''));if(draftRef.current===submittedDraft)setDraft([]);return;}}setError('场景正在变化，请重新应用此项参数');}).catch(e=>setError(String(e)));return parameterQueue.current.then(()=>submitted);}

 const numericHistory=useRef<{key:string;after:WorldProject}|null>(null),draftRef=useRef(draft);draftRef.current=draft;
 const worldReturn=useRef<{projectId:string;camera:unknown;selection:number[];entry:string|null;entries:string[];layer:number;display:SceneDisplay}|null>(null),returnPending=useRef(false),navigationTicket=useRef(0);
 async function openScene(name:string){if(singleLevel&&name!==view)return;if(!world||name!=='world'&&!world.levels.some(l=>l.id===name)){setError('入口尚未关联有效关卡');return;}const ticket=++navigationTicket.current,projectId=world.id;window.dispatchEvent(new Event('sstar:cancel-gesture'));await parameterQueue.current;if(ticket!==navigationTicket.current||current.current?.id!==projectId)return;if(currentView.current==='world'&&name!=='world')worldReturn.current={projectId,camera:viewport.current?.editingMemory(),selection:[...selection],entry:entryId,entries:[...selectedEntries],layer,display:clone(display)};returnPending.current=name==='world'&&!!worldReturn.current&&worldReturn.current.projectId===projectId;setView(name);}
 useEffect(()=>window.workbenchHome?.onOpenScene(id=>{if(world)void openScene(id);}),[world,view,selection,entryId,selectedEntries,layer,display]);
 useEffect(()=>{if(!returnPending.current||view!=='world'||loadedView!=='world')return;const saved=worldReturn.current;returnPending.current=false;if(!saved||saved.projectId!==world?.id)return;const frame=requestAnimationFrame(()=>{if(currentView.current!=='world')return;setDisplay(saved.display);setLayer(saved.layer);setSelection(saved.selection);setEntryId(saved.entry);setSelectedEntries(saved.entries);if(saved.camera)viewport.current?.loadMemory(saved.camera);setStatus('已返回大地图并恢复原位置');});return()=>cancelAnimationFrame(frame);},[view,loadedView,world?.id]);
  function toggleCamera(){setCameraRegionId(0);setCameraRegionsMode(false);if(!editingProject||!level?.camera)return;cancel();const picked=selected.find(e=>e.type==='Camera_Control');if(picked)setCameraId(picked.id);setCameraEdit(v=>cameraEditSource==='screen'?true:!v);setCameraEditSource('camera');setCameraDraft(null);setCameraLayoutDraft(undefined);setWorkshop('camera');}
  function cameraParameters(camera:CameraConfig,regionOnly=false,plan?:import('../editor-organization').CameraPlan){
    if(nativeWorld){edit(w=>{w.native!.camera=camera;if(plan){w.map.editor??={groups:[]};w.map.editor.cameraPlan=plan;}});setCameraDraft(null);setCameraLayoutDraft(undefined);return;}
    setCameraDraft(camera);if(plan)setCameraLayoutDraft(plan);
    const target=view,base=editingProject?.camera,epoch=editEpoch.current,inputGroup=currentInputGroup();
    parameterQueue.current=parameterQueue.current.then(async()=>{
      for(let attempt=0;attempt<3;attempt++){
        const before=current.current;if(!before||editEpoch.current!==epoch)return;
        const w=clone(before),design=target==='world'?w.map:w.levels.find(l=>l.id===target)?.project;
        if(!design)return;
        const previousMode=design.camera?.mode;
        design.camera=mergeCameraChange(base,camera,design.camera);
        if(plan){design.editor??={groups:[]};design.editor.cameraPlan=plan;}
        if(regionOnly)design.camera.mode=previousMode??base?.mode??'template';
        try{
          const preview=await previewSession.current.request(w.id+':'+target,target==='world'?{world:w}:{project:sceneProject(w,target)!});
          if(editEpoch.current!==epoch)return;if(current.current!==before)continue;
          preparedPreview.current.set(w,{view:target,level:preview});
          if(currentView.current===target){previewSeq.current++;setLevel(preview);setLoadedView(target);clearPending();}
          update(w,true,before,false,inputGroup);
          setCameraDraft(value=>value&&JSON.stringify(value)!==JSON.stringify(camera)?value:null);setCameraLayoutDraft(undefined);return;
        }catch(e){setError(String(e));setCameraDraft(null);setCameraLayoutDraft(undefined);return;}
      }
      setCameraDraft(null);setCameraLayoutDraft(undefined);setError('场景正在变化，请重新修改相机参数');
    });
  }
  function topologyParameters(topology:TopologyConfig|undefined){if(nativeWorld){edit(w=>{w.native!.topology=topology;});return;}const target=view,base=editingProject?.topology??level?.topology,epoch=editEpoch.current,inputGroup=currentInputGroup();parameterQueue.current=parameterQueue.current.then(async()=>{for(let attempt=0;attempt<3;attempt++){const before=current.current;if(!before)return;const w=clone(before),l=w.levels.find(l=>l.id===target);if(!l)return;const next=mergeTopologyChange(base,topology,l.project.topology);if(next)l.project.topology=next;else delete l.project.topology;try{const preview=await previewSession.current.request(w.id+':'+target,{project:l.project});if(editEpoch.current!==epoch)return;if(current.current!==before)continue;preparedPreview.current.set(w,{view:target,level:preview});if(currentView.current===target){previewSeq.current++;setLevel(preview);setLoadedView(target);clearPending();}update(w,true,before,false,inputGroup);setStatus('原生循环与逻辑边界已更新，可一步撤销');return;}catch(e){setError(String(e));return;}}setError('工程正在变化，请再次修改循环边界');}).catch(e=>setError(String(e)));}
  function cameraRegionPatch(id:number,values:Record<string,number|string|boolean>,preview=false){const base=editingProject?.camera,config:CameraConfig={...base,mode:base?.mode??'template',edits:[...(base?.edits??[]),{kind:'patch',id,values}]};if(preview)setCameraDraft(config);else cameraParameters(config,true);}
  async function cameraObjectAction(request:CameraObjectRequest){if(!editingProject)return;const target=currentView.current,epoch=editEpoch.current;await task(async()=>{await parameterQueue.current;const before=current.current;if(!before||target!==currentView.current)return;const p=sceneProject(before,target);if(!p)return;const camera=await api.cameraObject(target==='world'&&!before.native?before:p,request);if(epoch!==editEpoch.current||target!==currentView.current)return;if(current.current!==before)throw Error('场景已变化，请重新执行镜头操作');const next=clone(before);if(target==='world'){if(next.native)next.native.camera=camera;else next.map.camera=camera;}else next.levels.find(l=>l.id===target)!.project.camera=camera;update(next);setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);if(request.action==='delete'){if(request.id===cameraId)setCameraId(0);setCameraRegionId(0);setCameraRegionsMode(false);}else{const added=camera.edits?.slice(p.camera?.edits?.length??0).find(e=>e.kind==='clone');if(added?.kind==='clone'){const id=added.ids[added.sourceId],isCamera=request.action==='create'?['play','overview'].includes(request.kind):!!level?.camera?.controls.some(c=>c.id===request.id);if(isCamera){setCameraId(id);setCameraRegionId(0);setCameraRegionsMode(false);}else{setCameraRegionId(id);setCameraRegionsMode(true);}}}setStatus('镜头或控制区域已更新，可一步撤销');});}
  function undo(back=true){window.dispatchEvent(new Event('sstar:cancel-number-edit'));numericHistory.current=null;sampleEpoch.current++;editEpoch.current++;window.dispatchEvent(new Event('sstar:cancel-gesture'));clearPending();const h=history.current,stack=back?h.undo:h.redo,frame=stack.pop();if(!frame||!current.current)return;(back?h.redo:h.undo).push({world:current.current,view:currentView.current});update(frame.world,false,current.current,gameplayIds.current.get(frame.world)===gameplayIds.current.get(current.current!));setView(frame.view==='world'||frame.world.levels.some(l=>l.id===frame.view)?frame.view:'world');setSelection([]);setEntryId(null);setDraft([]);setPlacing(null);}
  async function save(saveAs=false){if(!current.current)return;await task(async()=>{await parameterQueue.current;await previewSession.current.flush();const w=current.current!,path=await api.worldSave(w,saveAs);if(path){saved.current=JSON.stringify(w);savedWorld.current=w;setDirty(false);setStatus('已保存 '+path);}});}
  useEffect(()=>{const h=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',h);return()=>window.removeEventListener('beforeunload',h);},[dirty]);
  useEffect(()=>{const move=(e:PointerEvent)=>{const d=levelDrag.current;if(d&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>5)d.moved=true;};const end=(e:PointerEvent)=>{const d=levelDrag.current;levelDrag.current=null;if(!d?.moved)return;const target=(document.elementFromPoint(e.clientX,e.clientY)as HTMLElement|null)?.closest('[data-level-id]')?.getAttribute('data-level-id');if(!target||target===d.id)return;edit(w=>{const from=w.levels.findIndex(l=>l.id===d.id),to=w.levels.findIndex(l=>l.id===target);if(from>=0&&to>=0){const[item]=w.levels.splice(from,1);w.levels.splice(to,0,item);}});};window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);};},[]);
  useEffect(()=>{if(wasDirty.current&&!dirty&&current.current)void api.recoveryWrite(clone(current.current)).catch(e=>setError(String(e)));wasDirty.current=dirty;const timer=setTimeout(()=>void persistRecovery(),5000);return()=>clearTimeout(timer);},[world,dirty]);
  useEffect(()=>{const timer=setInterval(()=>{if(Date.now()-recoveryClock.current>=30000)void persistRecovery();},1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!world)return;setRunIds([]);void api.assemblyList().then(setAssemblies).catch(e=>setError(String(e)));void api.recoveryList(world).then(rows=>{setRecoveries(rows);if(rows.some(r=>r.kind==='auto'&&(r as RecoveryItem&{recoverable?:boolean}).recoverable))setDialog('recoverStartup');}).catch(e=>setError(String(e)));},[world?.id]);
  useEffect(()=>{if(world)setDisplay((()=>{const d=readPref('display06:'+world.id+':'+view,defaultDisplay());return restoreSceneDisplay(d,readPref<SceneryVisibility>('sceneryVisibility091',defaultSceneryVisibility()));})());setRunMode(view==='world'?'world':'single');setRegionBox(null);setAllCopyHeights(false);setRegionPaste(null);setCopyRange([0,0]);},[world?.id,view]);
  const levelIdsKey=world?.levels.map(l=>l.id).join(',')??'';useEffect(()=>{const valid=new Set(current.current?.levels.map(l=>l.id));setRunIds(ids=>ids.every(id=>valid.has(id))?ids:ids.filter(id=>valid.has(id)));},[levelIdsKey]);
  useEffect(()=>{
    const request=++previewSeq.current;if(!world)return;
    const timer=setTimeout(()=>{
      if(nativeWorld){setStreamLoading(true);setStatus('正在按视野和高度读取世界范围…');}
      const acknowledged=pendingRef.current.length,cached=preparedPreview.current.get(world);
      const job=!nativeWorld&&cached?.view===view?Promise.resolve(cached.level):previewSession.current.request(world.id+':'+view,view==='world'?{world}:{project:selectedLevel!.project});
      void job.then(l=>{
        if(request!==previewSeq.current)return;
        setLevel(l);pendingRef.current=pendingRef.current.slice(acknowledged);setPendingTransforms(pendingRef.current);setLoadedView(view);setDraft([]);setStreamLoading(false);
        if(nativeWorld)setStatus((l.overview?'世界概览':'当前视野')+' · '+l.entities.length+' 个可视记录 · '+(l.terrain?.length??0)+' 个地形格');
      }).catch(e=>{if(request===previewSeq.current){setStreamLoading(false);setError(String(e));}});
    },0);
    return()=>clearTimeout(timer);
  },[view,sceneRevision,catalog,rangeTick]);
  useEffect(()=>{if(!world)return;let cancelled=false;setValidationState('checking');const timer=setTimeout(()=>{const check=singleLevel?api.runValidate(world,{mode:'single',levelIds:[world.levels[0].id]}):api.worldValidate(world);void check.then(list=>{if(!cancelled){setIssues(list);setValidationState('ready');}}).catch(e=>{if(!cancelled){setError(String(e));setValidationState('failed');}});},700);return()=>{cancelled=true;clearTimeout(timer);};},[sceneRevision]);
  useEffect(()=>{setSelectedEntries([]);setArrayPreview([]);setOverlapMode(false);sampleEpoch.current++;clearPending();temporaryDisplay.current=null;setCameraRegionId(0);setCameraProbing(false);setCameraProbe(null);setCameraId(0);setCameraDraft(null);setCameraLayoutDraft(undefined);setCameraEdit(false);setSampling(false);setLevel(null);setSelection([]);setEntryId(null);setPlacing(null);setPicking(null);setDraft([]);setLayer(0);setTool('select');setStrokeCells([]);stroke.current=null;},[view]);
  useEffect(()=>{if(world&&(view==='world'||world.levels.some(l=>l.id===view)))writePref('lastView:'+world.id,view);},[world?.id,view]);
  async function linkScroll(request:import('../shared').ViewGiverLinkRequest){const target=currentView.current,epoch=editEpoch.current;if(request.ids.some(id=>{const e=level?.entities.find(e=>e.id===id);return !e||objectLocked(e,display);})){setError('卷轴已锁定或未加载');return;}await task(async()=>{await parameterQueue.current;const before=current.current;if(!before||epoch!==editEpoch.current||target!==currentView.current)return;const p=sceneProject(before,target);if(!p)return;const result=await api.viewGiverLink(target==='world'&&!before.native?before:p,request);if(epoch!==editEpoch.current||target!==currentView.current)return;if(current.current!==before)throw Error('场景已变化，请重新选择卷轴镜头');const next=clone(before);if(target==='world'){next.map.objects=result.project.operations;if(next.native)next.native.camera=result.project.camera;else next.map.camera=result.project.camera;}else next.levels.find(l=>l.id===target)!.project=result.project;update(next);setCameraDraft(null);setCameraLayoutDraft(undefined);setStatus(result.copied?'已复制主镜头为辅助视角并关联卷轴，可一步撤销':'卷轴镜头关联已更新，可一步撤销');});}
  function reservedIds(){return reservedEntityIds((view==='world'?world?.map.objects:selectedLevel?.project.operations)??[],level?.entities.map(e=>e.id)??[],editingProject?.camera);}
  function nextId(count=1){return nextEntityId(reservedIds(),count);}
  const [associationIndex,setAssociationIndex]=useState<{world:WorldProject;rows:IndexedAssociation[]}|null>(null);
  useEffect(()=>{
    if(!nativeWorld||!world||!api.nativeAssociations)return;
    let active=true;
    const delay=setTimeout(()=>void api.nativeAssociations!(nativeDocument(world)).then(rows=>{
      if(active)setAssociationIndex({world,rows});
    }).catch(e=>{if(active)setError(String(e));}),110);
    return()=>{active=false;clearTimeout(delay);};
  },[nativeWorld,world,api]);
  const nativeAssociationRows=nativeWorld&&associationIndex?.world===world?associationIndex.rows:undefined;
  const levelTargets=useMemo(()=>{
    const names=new Map<string,string>();
    for(const region of catalog?.regions??[])for(const name of region.levels)if(!names.has(name))names.set(name,region.title);
    return levelAssociationTargets(world,names);
  },[world?.levels,world?.levelGroups,catalog?.regions]);
  const associationTargets=useMemo(()=>{
    const rows=new Map<string,AssociationTarget>();
    const managed=view==='world'&&!nativeWorld?world?.map.entries??[]:[];
    const managedIds=new Set(Object.values(level?.managedEntryIds??{}));
    const levelNames=new Map(levelTargets.map(item=>[item.key,item]));
    const add=(id:number,type:string,name:string,position?:Vec3)=>{
      if(managedIds.has(id))return;
      const entry=type==='Level_Entry'?levelNames.get(name):undefined;
      const title=(entry?.title??(name||typeLabel(type)))+(type==='Level_Entry'?' · 入口':'');
      rows.set('entity:'+id,{key:'entity:'+id,title,detail:[typeLabel(type),'#'+id,position?.join(', '),entry?.detail].filter(Boolean).join(' · '),search:name+' '+type,position,type});
    };
    for(const item of nativeAssociationRows??[])add(item.id,item.type,item.name,item.position??undefined);
    for(const item of nativeWorld?nativeIndex?.entryLinks??[]:[])add(item.id,'Level_Entry',item.target,item.position);
    for(const item of level?.externalTargets??[])if(!rows.has('entity:'+item.id))add(item.id,item.type,'',item.position);
    for(const item of level?.entities??[]){
      if(item.type==='Settings')continue;
      const name=item.type==='Level_Entry'?String(nativeValue(item,'level_name')??''):objectName(item);
      add(item.id,item.type,name,item.position??undefined);
      if(item.type==='Group'){
        const row=rows.get('entity:'+item.id);
        if(row)row.detail=[row.detail,nativeValue(item,'is_existence_group')?'控制存在状态':'',nativeValue(item,'transform_group')?'整体变换':''].filter(Boolean).join(' · ');
      }
    }
    for(const entry of managed){
      const target=levelNames.get(entry.levelId),position:Vec3=[entry.x,entry.y,entry.z??0],key='entry:'+entry.id;
      rows.set(key,{key,title:entry.title||target?.title||'关卡入口',detail:[target?.title,position.join(', '),target?.detail].filter(Boolean).join(' · '),search:target?.search,position,type:'Level_Entry'});
    }
    return [...rows.values()];
  },[view,nativeWorld,world?.map.entries,level,nativeAssociationRows,nativeIndex?.entryLinks,levelTargets]);
  const targetIndex=useMemo(()=>new Map(associationTargets.map(row=>[row.key,row])),[associationTargets]);
  const knownEntities=useMemo(()=>new Map(level?.entities.map(e=>[e.id,e])),[level?.entities]);
  const indexedChannelIds=useMemo(()=>new Set(nativeAssociationRows?.filter(row=>row.channel!==undefined).map(row=>row.id)),[nativeAssociationRows]);
  const pickCandidates=useMemo(()=>{
    if(!picking)return undefined;
    const source=knownEntities.get(picking.ids[0]),field=picking.field;
    const types=field==='turn_order_id'?['Guy']:source?.type==='Freezer'&&isFreezerCondition(field)?picking.advanced?freezerTargetTypes:['Level_Entry']:source?.nativeProperties?.find(p=>p.field.name===field)?.field.targets;
    const excluded=new Set(picking.ids.map(entityKey));
    return new Set(associationTargets.filter(target=>{
      if(excluded.has(target.key as ObjectKey)||target.key.startsWith('entry:')&&!(source?.type==='Freezer'&&isFreezerCondition(field)))return false;
      if(field==='__channel'){const id=Number(target.key.slice(7)),entity=knownEntities.get(id);return entity?ordinaryChannelObject(entity):indexedChannelIds.has(id);}
      return !types||types.includes(target.type??'');
    }).map(target=>target.key as ObjectKey));
  },[picking,associationTargets,knownEntities,indexedChannelIds]);
  function focusAssociation(target:AssociationTarget,keepSource=true){
    if(!target.position)return;
    const [x,y,z]=target.position;
    temporaryDisplay.current??=display;
    const d=clone(display);d.mode=nativeWorld?'range':'all';d.min=z-3;d.max=z+5;d.isolate=undefined;
    const id=target.key.startsWith('entity:')?Number(target.key.slice(7)):0,entity=knownEntities.get(id),key=target.key as ObjectKey;
    const category=entity?categoryOf(entity):target.type==='Level_Entry'?'mechanism':undefined;
    if(category)d.categories[category].visible=true;
    d.objects??={};d.objects[key]={...d.objects[key],hidden:false};
    setDisplay(d);setLayer(Math.round(z));
    if(!keepSource&&id){setSelection([id]);setEntryId(null);setSelectedEntries([]);setDraft([]);}
    viewport.current?.restoreFree();
    viewport.current?.loadMemory({position:[x,y-9,z+14],target:[x,y,z],fov:45,up:[0,0,1]});
    viewport.current?.highlightCandidate(key);
  }
  function focusChannel(members:ChannelMember[]){
    const positions=members.flatMap(member=>member.position?[member.position]:[]);
    if(!positions.length)return;
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const p of positions)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
    const target=min.map((n,i)=>(n+max[i])/2) as Vec3,span=Math.max(10,...max.map((n,i)=>n-min[i]));
    temporaryDisplay.current??=display;
    const d=clone(display);d.mode=nativeWorld?'range':'all';d.min=Math.floor(min[2])-2;d.max=Math.ceil(max[2])+2;d.isolate=undefined;d.categories.mechanism.visible=true;
    d.objects??={};for(const member of members){const key=entityKey(member.id);d.objects[key]={...d.objects[key],hidden:false};}
    setDisplay(d);setLayer(Math.round(target[2]));setSelection(members.map(member=>member.id));setEntryId(null);setSelectedEntries([]);
    viewport.current?.restoreFree();
    viewport.current?.loadMemory({position:[target[0],target[1]-span,target[2]+span*1.5],target,fov:45,up:[0,0,1]});
  }
  function startAssociation(field:string,ids:number[],advanced=false){
    window.dispatchEvent(new Event('sstar:cancel-gesture'));
    cancelPlacementOnly();setCameraEdit(false);setCameraRegionsMode(false);setOverlapMode(false);
    if(ids.some(id=>!selection.includes(id))){setSelection(ids);setEntryId(null);setSelectedEntries([]);}
    viewport.current?.restoreFree();
    setError('');setPicking({field,ids,advanced});
  }
  function commitChannelOperations(ops:EditOp[]){
    if(ops.some(op=>keyLocked(entityKey(op.id),display)||display.categories.mechanism.locked||knownEntities.get(op.id)&&objectLocked(knownEntities.get(op.id)!,display))){
      setError('频道操作涉及锁定机关，请先解锁');return;
    }
    if(!ops.length)return;
    if(nativeWorld)append(ops);else void applyParameters(ops);
    setStatus('已更新频道，可一步撤销');
  }
  function changeReference(field:string,ids:number[],key:string){
    const target=key?targetIndex.get(key):undefined;
    const valid=ids.every(id=>{
      const source=knownEntities.get(id),rule=source?.nativeProperties?.find(p=>p.field.name===field)?.field;
      const types=source?.type==='Freezer'&&isFreezerCondition(field)?freezerTargetTypes:rule?.targets;
      return !!source&&source.editable&&!objectLocked(source,display)&&rule?.kind==='reference'&&
        (!key||!!target&&key!==entityKey(id)&&(!types||types.includes(target.type??'')))&&
        (!key.startsWith('entry:')||source.type==='Freezer'&&isFreezerCondition(field));
    });
    if(!valid){setError('该目标不能用于此关联，或来源物件已锁定');return;}
    const ops=ids.map(id=>({kind:'properties' as const,id,values:{[field]:key.startsWith('entity:')?Number(key.slice(7)):0},
      ...(key.startsWith('entry:')?{entryTargets:{[field]:key.slice(6)}}:{})}));
    if(nativeWorld)append(ops);else void applyParameters(ops);
    setStatus(key?'已关联目标，可一步撤销':'已解除关联，可一步撤销');
  }
  function chooseAssociation(key:string){
    if(!picking||!pickCandidates?.has(key as ObjectKey)){setError('请选择高亮的有效目标');return;}
    const {field,ids}=picking,id=Number(key.slice(7));
    setPicking(null);
    if(field==='__channel'){
      try{
        const ops=channelLinkOperations(level?.entities??[],ids,id);
        if(!ops.length)return;
        const channel=String(nativeValue(knownEntities.get(id),'flavor')??0);
        setChannelConfirmation({ops,channel});
      }catch(e){setError(String(e));}
      return;
    }
    if(field==='turn_order_id'){void applyParameters([{kind:'control',id:ids[0],ids,targetId:id}]);return;}
    changeReference(field,ids,key);
  }
  const [channelConfirmation,setChannelConfirmation]=useState<ChannelProposal|null>(null);
  useEffect(()=>setChannelConfirmation(null),[view,world?.id]);
  const [relationTab,setRelationTab]=useState<'channels'|'references'>('channels');
  const channelMembers=useMemo(()=>{
    const members=new Map<number,ChannelMember>();
    for(const row of nativeAssociationRows??[]){const target=targetIndex.get('entity:'+row.id);if(row.channel!==undefined&&target)members.set(row.id,{...target,id:row.id,channel:row.channel});}
    for(const entity of knownEntities.values()){const target=targetIndex.get('entity:'+entity.id);if(target&&ordinaryChannelObject(entity))members.set(entity.id,{...target,id:entity.id,channel:String(nativeValue(entity,'flavor')??0)});}
    return [...members.values()];
  },[nativeAssociationRows,targetIndex,knownEntities]);
  const referenceControls:ReferenceControls={targets:associationTargets,levels:levelTargets,change:changeReference,pick:startAssociation,locate:target=>focusAssociation(target),
    hover:target=>viewport.current?.highlightCandidate(target?.key)};
  function select(ids:number[],input?:Ticket){if(picking){if(ids.length)chooseAssociation('entity:'+ids[0]);return;}const entries=ids.flatMap(id=>{const key=entryKeysByEntity.get(id);return key?[key]:[];});const entities=ids.filter(id=>!entryKeysByEntity.has(id));setSelectedEntries(entries);perf.select(ids,input);setSelection(entities);setEntryId(entries[0]??null);setDraft([]);}
  function quickLink(){if(!selected.length||selected.some(e=>!ordinaryChannelObject(e)||!canModify(e,display,layer))){setError('先选中可编辑的普通开关或普通门闸');return;}startAssociation('__channel',selected.map(e=>e.id));setStatus('点选目标普通开关或门闸，所选物件将加入目标频道；Esc 取消');}
  function organizationSelection():ObjectKey[]{return[...selection.map(entityKey),...new Set([...selectedEntries,...entryId?[entryId]:[]])].map(k=>typeof k==='string'&&k.startsWith('entity:')?k:entryKey(String(k)))as ObjectKey[];}
  function organizationAllowed(key:ObjectKey){if(keyLocked(key,display)||!keyVisible(key,display))return false;if(key.startsWith('entry:'))return Boolean(world?.map.entries.some(e=>entryKey(e.id)===key));const e=level?.entities.find(e=>entityKey(e.id)===key);return Boolean(e&&e.cloneable&&canModify(e,display,layer)&&!protectedCameraIds.has(e.id)&&!['Wall_Set','Ocean_Map'].includes(e.type)&&(view!=='world'||native||(e.id>>>20)===900));}
  function toggleObjectStates(keys:ObjectKey[],kind:'hidden'|'locked',value:boolean){window.dispatchEvent(new Event('sstar:cancel-gesture'));const objects={...display.objects};for(const k of keys)objects[k]={...objects[k],[kind]:value};const categories={...display.categories};if(kind==='locked'&&!value){for(const key of keys){const e=level?.entities.find(e=>entityKey(e.id)===key);if(e){const cat=categoryOf(e);if(categories[cat].locked){if(!confirm('该物件受分类锁定，解除所属分类锁定？'))return;categories[cat]={...categories[cat],locked:false};}}}}changeDisplay({...display,categories,objects});}
  const cameraPlan=cameraLayoutDraft??(view==='world'?world?.map.editor:selectedLevel?.project.editor)?.cameraPlan;
  function changeCameraPlan(plan:import('../editor-organization').CameraPlan|undefined){const target=currentView.current,projectId=current.current?.id,inputGroup=currentInputGroup();parameterQueue.current=parameterQueue.current.then(()=>{if(current.current?.id!==projectId)return;edit(w=>{const p=target==='world'?w.map:w.levels.find(l=>l.id===target)?.project;if(!p)return;p.editor??={groups:[]};if(plan)p.editor.cameraPlan=plan;else delete p.editor.cameraPlan;},true,inputGroup);});}
  function setOrganization(meta:EditorMetadata){const w=clone(current.current!);if(view==='world')w.map.editor=meta;else w.levels.find(l=>l.id===view)!.project.editor=meta;update(w,true,current.current,true);}
  function selectOrganization(keys:ObjectKey[]){setSelection(keys.filter(k=>k.startsWith('entity:')).map(k=>Number(k.slice(7))));const entries=keys.filter(k=>k.startsWith('entry:')).map(k=>k.slice(6));setSelectedEntries(entries);setEntryId(entries[0]??null);setFit(n=>n+1);}
  function copyOrganization(keys:ObjectKey[],policy:import('../shared').CopyPolicy='preserve'){if(keys.some(k=>!organizationAllowed(k))){setError('分组包含锁定或不能复制的物件');return;}const w=clone(current.current!),p=view==='world'?w.map:w.levels.find(l=>l.id===view)!.project;let id=nextId();const used=reservedIds();const copies=keys.filter(k=>k.startsWith('entity:')).map(k=>{while(used.has(id))id++;const newId=id++;used.add(newId);return{id:Number(k.slice(7)),newId};});const map=new Map<ObjectKey,ObjectKey>(copies.map(c=>[entityKey(c.id),entityKey(c.newId)]));if(copies.length){const op:EditOp={kind:'duplicate',id:copies[0].id,copies,offset:[1,0,0],copyPolicy:policy};if(view==='world'){w.map.objects??=[];w.map.objects.push(op);}else w.levels.find(l=>l.id===view)!.project.operations.push(op);}for(const k of keys.filter(k=>k.startsWith('entry:'))){const old=w.map.entries.find(e=>entryKey(e.id)===k)!;if(!worldContains(w.map,old.x+1,old.y)){setError('入口副本超出地图范围');return;}const next={...old,id:uid('entry'),x:old.x+1};w.map.entries.push(next);map.set(k,entryKey(next.id));}p.editor??={groups:[]};p.editor.groups.push(...copyGroups(p.editor,map,uid('copy')));update(w);selectOrganization([...map.values()]);}
  function openArray(){if(!selected.length||selected.some(e=>!canModify(e,display,layer)||!designObject(e)||['Wall_Set','Ocean_Map','Level_Entry'].includes(e.type)||protectedCameraIds.has(e.id))){setError('先选择可复制的玩法物件');return;}window.dispatchEvent(new Event('sstar:cancel-gesture'));setPlacing(null);setTool('select');setWorkshop('array');}
  function commitArray(spec:ArraySpec){try{if(selected.some(e=>!canModify(e,display,layer)))throw Error('阵列涉及锁定物件');const ops=arrayOperations(selected,[...reservedIds()],nextId(),spec);append(ops);setArrayPreview([]);setWorkshop('');setStatus('阵列已提交，可一步撤销');}catch(e){setError(String(e));}}
  function remove(ids=selection){if(selectedEntries.length&&ids.some(id=>selection.includes(id))){deleteArea(ids,selectedEntries);return;}if(ids.some(id=>{const e=level?.entities.find(e=>e.id===id);return e&&objectLocked(e,display);})){setError('操作包含锁定对象，请先解锁');return;}const valid=ids.filter(id=>level?.entities.some(e=>e.id===id&&e.cloneable&&canModify(e,display,layer)));if(!valid.length)return;append(valid.map(id=>({kind:'delete',id})));setSelection([]);setStatus(`已删除 ${valid.length} 个物件，可 Ctrl+Z 撤销`);}
  function deleteArea(ids:number[],entries:string[]){entries=entries.filter(id=>!keyLocked(entryKey(id),display)&&keyVisible(entryKey(id),display));const valid=ids.filter(id=>level?.entities.some(e=>e.id===id&&e.cloneable&&canModify(e,display,layer)));if(!valid.length&&!entries.length)return;edit(w=>{if(view==='world'){w.map.objects??=[];w.map.objects.push(...valid.map(id=>({kind:'delete' as const,id})));w.map.entries=w.map.entries.filter(e=>!entries.includes(e.id));w.map.editor=removeMembers(w.map.editor,new Set([...valid.map(entityKey),...entries.map(entryKey)]));}else{const p=w.levels.find(l=>l.id===view)?.project;if(p){p.operations.push(...valid.map(id=>({kind:'delete' as const,id})));p.editor=removeMembers(p.editor,new Set(valid.map(entityKey)));}}});setSelection([]);setEntryId(null);setSelectedEntries([]);setStatus('已删除 '+(valid.length+entries.length)+' 项，可一步撤销');}
  function duplicate(policy:import('../shared').CopyPolicy='preserve'){if(selectedEntries.length){copyOrganization(organizationSelection(),policy);return;}const entities=selected.filter(e=>e.cloneable);if(entities.some(e=>objectLocked(e,display))){setError('选中物件已锁定');return;}if(!entities.length)return;let next=nextId();const used=reservedIds(),copies=entities.map(e=>{while(used.has(next))next++;const newId=next++;used.add(newId);return{id:e.id,newId};});append([{kind:'duplicate',id:copies[0].id,copies,offset:[1,0,0],copyPolicy:policy}]);setSelection(copies.map(p=>p.newId));}
  function cloneLinked(){const source=selected.length===1&&selected[0].type==='Guy'?selected[0]:undefined;if(!source)return;const newId=nextId();append([{kind:'duplicate',id:source.id,copies:[{id:source.id,newId}],offset:[1,0,0],copyPolicy:'preserve'},{kind:'control',id:newId,ids:[newId],targetId:source.id}]);setSelection([newId]);setStatus('已复制为原生同步角色，可一步撤销');}
  function cancel(){window.dispatchEvent(new Event('sstar:cancel-gesture'));if(workshop==='array')setWorkshop('');setArrayPreview([]);setOverlapMode(false);sampleEpoch.current++;setSampling(false);setPlacing(null);setPicking(null);setTool('select');setDraft([]);setRegionBox(null);setRegionPaste(null);setStatus('左键选择或移动 · 右键拖动旋转');}
  function choose(p:ObjectPreset,drag=false){window.dispatchEvent(new Event('sstar:cancel-gesture'));sampleEpoch.current++;setSampling(false);setCameraEdit(false);const profile=p.type==='Wall_Set'?'terrain':['Inanimate','Decal'].includes(p.type)?'decoration':'mechanism';setPlacementPrefs({...preference('placementProfile:'+profile,placementProfile(profile)),continuous:true});if(p.type==='Level_Entry'){if(view!=='world'){setError('小关卡入口请在大地图中放置');return;}setEntryPrototype(p);setDialog('entry');setPlacing(null);return;}if(p.type==='Wall_Set'){terrainPreset.current=p.key;setSelection([]);setPlacing(null);setTool('wall');setStatus('体素地形 · 可使用笔刷或矩形铺设');return;}setPlacing({key:p.key,drag,yaw:0});setTool('select');setPicking(null);setStatus(`放置 ${p.label} · R 旋转 · 右键取消`);}
  function place(position:Vec3,yaw:number,key?:string){if(placing?.bundle?.transfer){setRegionPaste({at:position.map(Math.round) as Vec3,yaw,bundle:placing.bundle});return;}if(placing?.bundle){append([{kind:'stamp',id:nextId(Math.max(1,placing.bundle.records.length)),bundle:clone(placing.bundle),position,yaw,context:current.current!.id+':'+view}]);setSelection([]);setPlacing(p=>placementPrefs.continuous&&p?{...p,drag:false}:null);setStatus('已放置独立区域副本，可一步撤销');return;}const assetKey=key??placing?.key??'',p=objects?(resolveGate(objects,assetKey)??objects.presets.find(p=>p.key===assetKey)):undefined;if(!p||!position.every(Number.isFinite))return;if(view==='world'&&!native&&world&&!worldContains(world.map,position[0],position[1])){setError('位置超出地图');return;}const id=nextId(p.type!=='Level_Entry'&&p.placement==='assembly'?257:1),ops:EditOp[]=[{kind:'prefab',id,template:p.template,sourceId:p.sourceId,position,assembly:p.type!=='Level_Entry'&&p.placement==='assembly',standaloneFreezer:p.type==='Freezer'||undefined,values:p.type==='Level_Entry'&&native?{...p.placementValues,level_name:quick||world?.levels[0]?.id||'',unlocked_by_id:0,unlocked_by_id2:0,unlocked_by_id3:0}:p.placementValues}];if((yaw||p.placementValues)&&!['Wall_Set','Ocean_Map'].includes(p.type)){const a=yaw*Math.PI/360,s=Math.sin(a),c=Math.cos(a),x=Number(p.values['orientation.x']??0),y=Number(p.values['orientation.y']??0),z=Number(p.values['orientation.z']??0),w=Number(p.values['orientation.w']??1);ops.push({kind:'transform',id,rotation:[c*x-s*y,s*x+c*y,c*z+s*w,c*w-s*z]});}append(ops);setSelection([id]);recordRecentPlacement(p.type==='Gate'&&p.placementValues?configureGate(objects!,p,{...decodeGateKey(p.key)!.draft,yaw:(decodeGateKey(p.key)!.draft.yaw+yaw+360)%360}).key:p.key);setStatus('已放置 '+p.label);setPlacing(p=>placementPrefs.continuous&&p?{...p,drag:false}:null);}
  function cell(x:number,y:number,first:boolean,atZ=layer){if(display.categories.terrain.locked){setError('地形已锁定');return;}if(!current.current)return;const w=current.current;if(view==='world'&&tool==='entry'){const levelId=w.levels.find(l=>l.id===quick)?.id??w.levels[0]?.id;if(!levelId){setError('请先新建关卡');return;}if(!worldContains(w.map,x,y)||w.map.entries.some(e=>e.x===x&&e.y===y&&(e.z??0)===Math.round(atZ))){setError('此处已有入口');return;}const e={id:uid('entry'),title:w.levels.find(l=>l.id===levelId)!.title,levelId,x,y,z:Math.round(atZ),...(entryPrototype?{prototype:{template:entryPrototype.template,sourceId:entryPrototype.sourceId}}:{})};edit(w=>w.map.entries.push(e));if(entryPrototype)recordRecentPlacement(entryPrototype.key);setEntryId(e.id);setTool('select');return;}if(view==='world'&&tool==='spawn'){edit(w=>{if(!worldContains(w.map,x,y))throw Error('出生点超出地图边界');w.map.spawn=[x,y];w.map.spawnZ=Math.round(atZ);});setTool('select');return;}if(!['floor','wall','erase'].includes(tool))return;
    if(!stroke.current)stroke.current={before:w,cells:new Map()};const radius=(brush-1)/2;
    if(view==='world'&&!native){const draft=stroke.current.worldDraft??=clone(w);for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const px=x+dx,py=y+dy;if(px>=0&&py>=0&&px<draft.map.width&&py<draft.map.height){draft.map.tiles[py*draft.map.width+px]=tool==='floor'?1:tool==='wall'?2:0;for(let z=-1;z<=0;z++)stroke.current.cells.set(`${px},${py},${z}`,{x:px,y:py,z,solid:tool!=='erase'&&(tool==='wall'||z===-1)});}}setStrokeCells([...stroke.current.cells.values()]);}
    else{for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const px=x+dx,py=y+dy,z=tool==='floor'?Math.round(atZ)-1:tool==='erase'?Math.round(atZ)-1:Math.round(atZ);stroke.current.cells.set(`${px},${py},${z}`,{x:px,y:py,z,solid:tool!=='erase'});}setStrokeCells([...stroke.current.cells.values()]);}
  }
  const [terrainPaintColor,setTerrainPaintColor]=useState<string|null>('#b4875b');
  const [terrainPlacement,setTerrainPlacement]=useState<TerrainPalette>(()=>{
    const stored=readPref<TerrainPalette>('terrainPlacementColors',{});
    return Object.fromEntries((['floor','wall'] as const).filter(key=>validTerrainColor(stored[key])).map(key=>[key,stored[key]]));
  });
  const sceneOperations=view==='world'?world?.map.objects:selectedLevel?.project.operations;
  const ruleOverrides:LevelSettings=Object.assign({},...(sceneOperations??[]).flatMap(op=>op.kind==='levelSettings'?[op.values]:[]));
  const palette=sceneOperations?.filter(op=>op.kind==='terrainPaint').filter(op=>op.defaults!==undefined).at(-1)?.defaults??{};
  const terrainColorIssue=loadedView!==view||!level?'等待场景载入':level.overview?'请先进入分区编辑地形':view==='world'&&!native&&world?.version!==4?'旧版二维大地图请先升级为三维工程':display.categories.terrain.locked?'地形已锁定':'';
  function changeTerrainPlacement(kind:TerrainPlacementKind,color?:string){
    const next={...terrainPlacement};
    if(color===undefined)delete next[kind];else if(validTerrainColor(color))next[kind]=color;
    setTerrainPlacement(next);
    writePref('terrainPlacementColors',next);
  }
  function brushFromTerrainCard(kind:TerrainPlacementKind){
    if(terrainColorIssue)return;
    cancel();
    useEditorTool('tint');
    setTerrainPaintColor(terrainPlacement[kind]??palette[kind]??'#b4875b');
    setStatus('左键单击或拖出矩形给已有地形刷色 · 右键取消');
  }
  function terrainPlacementPaint(positions:Vec3[]):EditOp[]{
    if(!positions.length||terrainColorIssue||tool!=='floor'&&tool!=='wall')return [];
    const color=terrainPlacement[tool];
    if(!color)return [];
    const faces=terrainPlacementFaces(positions,tool,color),operations:EditOp[]=[];
    for(let i=0;i<faces.length;i+=4096)operations.push({kind:'terrainPaint',id:0,faces:faces.slice(i,i+4096)});
    return operations;
  }
  function setLevelSetting(key:LevelSetting,value?:number){
    edit(w=>{
      const list=currentView.current==='world'?(w.map.objects??=[]):w.levels.find(l=>l.id===currentView.current)!.project.operations;
      const values:LevelSettings={};
      for(let i=list.length-1;i>=0;i--){const op=list[i];if(op.kind==='levelSettings'){for(const [key,value] of Object.entries(op.values))if(!Object.hasOwn(values,key))values[key as LevelSetting]=value;list.splice(i,1);}}
      if(value===undefined)delete values[key];else values[key]=value;
      if(Object.keys(values).length)list.push({kind:'levelSettings',id:0,values});
    });
  }
  const settingsControls={values:level?.levelSettings,overrides:ruleOverrides,change:setLevelSetting,disabled:busy};
  function changeTerrainPalette(defaults:TerrainPalette){
    edit(w=>{
      const list=currentView.current==='world'?(w.map.objects??=[]):w.levels.find(l=>l.id===currentView.current)!.project.operations;
      for(let i=list.length-1;i>=0;i--){
        const op=list[i];
        if(op.kind!=='terrainPaint'||!op.defaults)continue;
        if(op.faces)delete op.defaults;else list.splice(i,1);
      }
      if(Object.keys(defaults).length)list.push({kind:'terrainPaint',id:0,defaults});
    });
  }
  function placeTerrainCells(cells:{x:number;y:number;z:number;solid:boolean}[],id=0){
    const added=cells.filter(cell=>cell.solid).map(({x,y,z})=>[x,y,z] as Vec3);
    append([{kind:'terrain',id,cells},...terrainPlacementPaint(added)]);
  }
  function paintTerrain(faces:TerrainFacePaint[]){
    if(terrainTouchesLocked(level,display,faces.map(({cell:[x,y,z]})=>({x,y,z})))){setError('地形已锁定');return;}
    if(faces.length)append([{kind:'terrainPaint',id:0,faces}]);
  }
  function editWorldVoxels(positions:Vec3[],solid:boolean){
    try{edit(w=>{
      worldTerrain(w.map,positions,solid);
      if(solid){
        const paint=terrainPlacementPaint(positions);
        if(paint.length)(w.map.objects??=[]).push(...paint);
      }else{
        const removed=new Set(positions.map(p=>p.join(',')));
        w.map.objects=w.map.objects?.flatMap(op=>{
          if(op.kind!=='terrainPaint'||!op.faces)return [op];
          const faces=op.faces.filter(p=>!removed.has(p.cell.join(',')));
          return faces.length||op.defaults?[{...op,faces}]:[];
        });
      }
      worldVerticalBounds(w.map);
    });}catch(e){setError(String(e));}
  }
  function stamp(positions:Vec3[]){const p=objects?.presets.find(p=>p.key===placing?.key);if(!p||!['Inanimate','Decal'].includes(p.type))return;let id=nextId(Math.max(1,positions.length));const ops:EditOp[]=positions.flatMap(position=>{const currentId=id++;return[{kind:'prefab' as const,id:currentId,template:p.template,sourceId:p.sourceId,position,standaloneFreezer:p.type==='Freezer'||undefined},{kind:'transform' as const,id:currentId,rotation:nativeQuaternion(placing?.yaw??0,['x','y','z','w'].map(a=>Number(p.values['orientation.'+a]??(a==='w'?1:0))))}];});append(ops);setSelection(ops.filter(o=>o.kind==='prefab').map(o=>o.id));recordRecentPlacement(p.key);setStatus('已铺设 '+positions.length+' 个物件，可一步撤销');if(!placementPrefs.continuous)setPlacing(null);}
  function paintRectangle(positions:Vec3[],voxel=false){if(!positions.length)return;if(display.categories.terrain.locked){setError('地形已锁定');return;}if(!['floor','wall','erase'].includes(tool)||!current.current)return;if(view==='world'&&!native){editWorldVoxels(positions,tool!=='erase');}else placeTerrainCells(positions.map(([x,y,z])=>({x,y,z:Math.round(z)-(voxel||tool==='wall'?0:1),solid:tool!=='erase'})),nextId());if(tool!=='erase'){recordRecentPlacement('terrain:'+tool);if(terrainPreset.current)recordRecentPlacement(terrainPreset.current);}if(!placementPrefs.continuous)setTool('select');}
  function endStroke(cancelled=false){const s=stroke.current;stroke.current=null;if(!s)return;setStrokeCells([]);if(cancelled)return;if(view==='world'&&!native){if(s.worldDraft)update(s.worldDraft,true,s.before);}else if(s.cells.size){placeTerrainCells([...s.cells.values()],nextId());if(tool!=='erase'){recordRecentPlacement('terrain:'+tool);if(terrainPreset.current)recordRecentPlacement(terrainPreset.current);}}if(!placementPrefs.continuous)setTool('select');}
  const committedLevel=useMemo(()=>optimisticTransforms(level,pendingTransforms),[level,pendingTransforms]);
  const visualLevel=useMemo(()=>{const level=optimisticPropertyDraft(committedLevel,draft);if(!level||!strokeCells.length)return level;const cells=new Map((level.terrain??[]).map(p=>[`${p.x},${p.y},${p.z-1}`,p]));for(const p of strokeCells){const key=`${p.x},${p.y},${p.z}`;if(p.solid)cells.set(key,{x:p.x,y:p.y,z:p.z+1});else cells.delete(key);}return{...level,terrain:[...cells.values()]};},[committedLevel,strokeCells,draft]);
  function openProjectTab(action:import('../project-tabs').ProjectTabAction){
    const tabs=window.projectTabs;
    if(!tabs)return false;
    setDialog('');
    void tabs.action(action).catch(e=>setError(String(e)));
    return true;
  }
  async function importNative(){if(openProjectTab('native'))return;await task(async()=>{if(dirty&&!confirm('放弃未保存修改并导入完整原版世界？'))return;cancel();accept(await bridge.importNative(catalog?.regions));setView('world');setDialog('');});}
  function fullOverview(){const t=nativeIndex?.topology??level?.topology;if(!t){changeDisplay({...display,mode:'all'});setFit(v=>v+1);return;}changeDisplay({...display,mode:'all'});const center=t.corner.map((v,i)=>v+t.size[i]/2),distance=Math.max(t.size[0],t.size[1])*1.3;viewport.current?.loadMemory({position:[center[0],center[1]-distance*.3,center[2]+distance],target:center,fov:45,up:[0,0,1]});}
  async function addBlank(){await task(async()=>{const p=await api.levelCreateBlank();addLevel(p,'新关卡 '+String((world?.levels.length??0)+1).padStart(2,'0'));});}
  function addLevel(project:EditorProject,title:string){const id=(native?'ed_'+world!.id+'_':'')+uid('level');edit(w=>w.levels.push({id,title,folderId:selectedLevel?.folderId,project:{...upgradeProject(project),name:id}}));setView(id);setStatus('新关卡已创建');setDialog('');}
  function addTemplate(name:string){if(!catalog)return;addLevel({format:'sinking-star-project',version:2,sourceHash:catalog.sourceHash,sourceBuild:catalog.build,template:name,base:{kind:'template',template:name},name,operations:[]},name);}
  function copyLevel(id=view){const l=current.current?.levels.find(l=>l.id===id);if(!l)return;const newId=(native?'ed_'+world!.id+'_':'')+uid('level');let title=l.title+' 副本',n=2;while(current.current?.levels.some(l=>l.title===title))title=l.title+' 副本 '+n++;edit(w=>{const index=w.levels.findIndex(l=>l.id===id);w.levels.splice(index+1,0,{id:newId,title,folderId:l.folderId,project:{...clone(l.project),name:newId}});});setView(newId);setContext(null);}
  async function deleteLevel(id:string){if(native&&current.current){await task(async()=>{const impact=await api.nativeImpact(nativeDocument(current.current!),id);const mapDisplay=view==='world'?display:readPref<SceneDisplay>('display06:'+current.current!.id+':world',defaultDisplay());if(mapDisplay.categories.mechanism.locked||impact.entries.some(id=>mapDisplay.objects?.[entityKey(id)]?.locked)){setError('关联入口已锁定，请先在大世界解锁');return;}if(impact.references.length){setError('该关仍有依赖，先处理后再删除：'+impact.references.slice(0,8).join('；'));return;}if(!confirm('删除此关卡及 '+impact.entries.length+' 个关联入口？可一步撤销。'))return;edit(w=>{w.levels=w.levels.filter(l=>l.id!==id);if(!w.native!.deletedScenes?.includes(id))(w.native!.deletedScenes??=[]).push(id);const ops=impact.entries.map(id=>({kind:'delete' as const,id}));(w.map.objects??=[]).push(...ops);w.map.editor=organizeOperations(w.map.editor,ops);});if(view===id)setView('world');setStatus('已删除关卡及关联入口，可一步撤销');});return;}const affected=current.current?.map.entries.filter(e=>e.levelId===id)??[],mapDisplay=view==='world'?display:readPref<SceneDisplay>('display06:'+world!.id+':world',defaultDisplay());if(affected.some(e=>keyLocked(entryKey(e.id),mapDisplay))){setError('关联入口已锁定，请先在大地图解锁入口再删除关卡');return;}const count=affected.length;edit(w=>{removeWorldLevel(w,id);});if(view===id)setView('world');setStatus(`已删除关卡及 ${count} 个入口，可撤销`);setContext(null);}
  function deleteEntry(id:string){if(keyLocked(entryKey(id),display)){setError('入口所属类别已锁定');return;}edit(w=>{w.map.entries=w.map.entries.filter(e=>e.id!==id);for(const e of w.map.entries)if(e.unlocks)e.unlocks=e.unlocks.map(key=>key===id?null:key) as typeof e.unlocks;w.map.editor=removeMembers(w.map.editor,new Set([entryKey(id)]));});setEntryId(null);}
  async function loadExample(which:'recreations'|'studio'|'showcase'){if(openProjectTab(which))return;await task(async()=>{if(dirty&&!confirm('放弃当前未保存的修改？'))return;accept(which==='recreations'?await api.worldRecreations():which==='studio'?await api.worldStudioExample():await api.worldExample());setDialog('');});}
  useEffect(()=>api.onRegionProgress?.((job,phase)=>{if(activeRegionJob.current===job)setRegionProgress(phase);}),[api]);
  useEffect(()=>api.onRegionClipboardChange?.(()=>setClipboard(null)),[api]);
  function cancelRegionJob(){
    const job=activeRegionJob.current;
    if(!job)return;
    activeRegionJob.current=null;
    void api.cancelRegionJob?.(job);
    setRegionProgress('');
    setStatus('已取消区域操作');
  }
  async function runRegionJob(fn:(job:string)=>Promise<void>,initial:string){
    await task(async()=>{
      const job=crypto.randomUUID();
      activeRegionJob.current=job;
      setRegionProgress(initial);
      try{await fn(job);}
      catch(e){if(activeRegionJob.current===job)throw e;}
      finally{if(activeRegionJob.current===job){activeRegionJob.current=null;setRegionProgress('');}}
    });
  }
  function startRegion(){
    cancel();
    const displayedLayer=display.mode==='current'&&!display.follow?display.min:layer;
    const range=display.mode==='range'?[Math.ceil(Math.min(display.min,display.max)),Math.floor(Math.max(display.min,display.max))]:[displayedLayer,displayedLayer];
    setCopyRange(range as [number,number]);
    setAllCopyHeights(false);
    setTool('copyRegion');
    setWorkshop('region');
    setStatus('在画布拖出矩形，然后 Ctrl+C 复制区域');
  }
  function activeRegionBox(){
    if(!regionBox)return;
    let [low,high]=copyRange;
    if(allCopyHeights){
      const topology=(nativeWorld?nativeIndex?.topology:undefined)??level?.topology;
      if(topology){low=topology.corner[2];high=low+topology.size[2]-1;}
      else {
        low=high=layer;
        for(const c of level?.terrain??[]){low=Math.min(low,c.z);high=Math.max(high,c.z);}
        for(const e of level?.entities??[])if(e.position){low=Math.min(low,Math.floor(e.position[2]));high=Math.max(high,Math.ceil(e.position[2]));}
      }
    }
    return {min:[regionBox.min[0],regionBox.min[1],Math.min(low,high)] as Vec3,max:[regionBox.max[0],regionBox.max[1],Math.max(low,high)] as Vec3};
  }
  async function commitRegion(at:Vec3,yaw:number,options:import('../shared').RegionPasteOptions){
    const pending=regionPaste;
    if(!pending||!api.worldRegionPaste||!current.current)return;
    await runRegionJob(async job=>{
      await parameterQueue.current;
      if(activeRegionJob.current!==job)return;
      const source=current.current!,scene=currentView.current;
      if(pending.bundle.terrain.length&&display.categories.terrain.locked)throw Error('请先解锁目标地形');
      const updated=await api.worldRegionPaste!({world:source,scene,bundle:pending.bundle,at,yaw,id:nextId(Math.max(1,pending.bundle.records.length+(pending.bundle.transfer?.entries.length??0))),options},job);
      if(activeRegionJob.current!==job||source!==current.current||scene!==currentView.current)return;
      update(updated,true,source);
      setRegionPaste(null);setPlacing(null);setTool('select');setSelection([]);
      setStatus('区域已粘贴，可一步撤销');
    },'检查区域粘贴');
  }
  function expansionLabel(at:Vec3,yaw:number){
    const size=regionPaste?.bundle.transfer?.size;
    if(!size||view!=='world'||native||!world)return '';
    const corners=regionCorners(size,at,yaw);
    if(!corners.some(([x,y])=>!worldContains(world.map,x,y)))return '';
    const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
    return '扩图并粘贴至 X '+Math.min(...xs)+' 至 '+Math.max(...xs)+'、Y '+Math.min(...ys)+' 至 '+Math.max(...ys);
  }
  async function capture(bounds=activeRegionBox()){
    if(!current.current||!bounds&&!editingProject){setError('请先框选要复制的区域');return;}
    if(bounds&&api.worldRegionCapture){
      await runRegionJob(async job=>{
        await parameterQueue.current;
        if(activeRegionJob.current!==job)return;
        const currentProject=current.current!,scene=currentView.current;
        const bundle=await api.worldRegionCapture!(currentProject,scene,{ids:[],bounds},job);
        if(activeRegionJob.current!==job||current.current!==currentProject||currentView.current!==scene)return;
        await api.regionClipboard?.(bundle);
        setClipboard(bundle);setRegionBox(null);setTool('select');setStatus('区域已复制，Ctrl+V 预览粘贴');
      },'读取源区域');
      return;
    }
    await task(async()=>{
      await parameterQueue.current;
      const p=editingProject!;
      const ids=selection.filter(id=>{const e=level?.entities.find(e=>e.id===id);return e&&canModify(e,display,layer);});
      const bundle=await api.regionCapture(p,{ids,bounds,includeBackground:display.categories.background.visible&&!display.categories.background.locked,copyPolicy:'preserve',origin:current.current!.id+':'+currentView.current});
      await api.regionClipboard?.(bundle);
      setClipboard(bundle);setTool('select');setWorkshop('region');setStatus('区域已复制，Ctrl+V 预览粘贴');
    });
  }

  function pasteBundle(bundle=clipboard,drag=false){if(!bundle){if(api.regionClipboard)void task(async()=>{const previous=await api.regionClipboard!();if(previous){setClipboard(previous);pasteBundle(previous);}else setError('剪贴板没有区域');});return;}if(bundle.sourceHash!==world?.sourceHash||bundle.sourceBuild!==world?.sourceBuild){setError('区域与目标工程的游戏来源不一致');return;}cancel();setPlacing({key:uid('region'),bundle:clone(bundle),yaw:0,drag});setStatus('放置区域 · R 旋转 · 右键或 Esc 取消');}
  async function saveAssembly(){if(!clipboard)return;await task(async()=>{await api.assemblySave(clipboard);setAssemblies(await api.assemblyList());setWorkshop('library');setStatus('已保存组合模板，放下的副本独立编辑');});}
  async function openExport(){window.dispatchEvent(new Event('sstar:cancel-gesture'));await parameterQueue.current;await previewSession.current.flush();setDialog('export');}
  async function commitLevelImport(choice:import('../home-types').LevelImportChoice,folder?:string){
    const home=window.workbenchHome;if(!home)throw Error('请在桌面工作台导入');
    await parameterQueue.current;await previewSession.current.flush();
    const before=current.current;if(!before)return;
    const result=await home.importInto(before,choice,folder);
    if(current.current!==before)throw Error('工程已变化，请重新确认导入');
    window.dispatchEvent(new Event('sstar:cancel-gesture'));
    update(result.project,true,before);setView(result.primary);setDialog('');setStatus('已导入 '+result.count+' 个关卡 · 可一步撤销');
  }
  async function prepareCommunity(single:boolean){
    const home=window.workbenchHome;if(!home||!current.current)return;
    await parameterQueue.current;await previewSession.current.flush();
    const active=currentView.current;if(single&&active==='world')throw Error('请先打开要分享的关卡');
    const cover=await viewport.current?.captureCover();
    await home.prepare(clone(current.current),single?active:undefined,cover||undefined);
  }
  async function saveHomeCover(){
    const image=await viewport.current?.captureCover();
    if(!image)throw Error('请等场景加载后再设为封面');
    await window.workbenchHome?.useCover(image);setStatus('已用当前画面更新首页封面');
  }
  async function saveLevelToLibrary(){
    const home=window.workbenchHome;if(!home)return;
    await parameterQueue.current;await previewSession.current.flush();
    const project=current.current,level=currentView.current;
    if(!project||level==='world')throw Error('请先打开要收入关卡库的小关');
    const item=await home.libraryAddScene(project,level);
    setStatus('「'+item.name+'」已加入本机关卡库');
  }
  async function launch(request?:RunRequest){if(launchPending.current)return;launchPending.current=true;try{window.dispatchEvent(new Event('sstar:cancel-gesture'));await parameterQueue.current;const w=current.current;if(!w)return;const r=singleLevel?{mode:'single' as const,levelIds:[w.levels[0].id]}:request??{mode:runMode,levelIds:runMode==='single'&&view!=='world'?[view]:runMode==='subset'?runIds:[]};if(r.mode==='subset'&&!r.levelIds.length){setDialog('runSubset');return;}setDialog('');await task(async()=>{setStatus('检查、准备副本并启动试玩…');setStatus(await api.runLaunch(clone(w),r));});}finally{launchPending.current=false;}}

  function startSample(){const id=selection.find(id=>{const e=level?.entities.find(e=>e.id===id);return e&&canModify(e,display,layer);});cancel();setCameraEdit(false);if(id!==undefined)void sampleObject(id);else{setSampling(true);setStatus('吸管：点击物件取样，Esc 取消');}}
  async function sampleObject(id:number){const entity=level?.entities.find(e=>e.id===id);if(!entity||!canModify(entity,display,layer))return;if(protectedCameraIds.has(id)){setStatus('请在原生区域面板复制相机对象');return;}if(entity.type==='Wall_Set'){const cell=level?.terrain?.find(c=>c.id===id);if(cell)sampleTerrain([cell.x,cell.y,cell.z-1],[0,0,1]);return;}if(!editingProject){setError('请先打开场景');return;}const capturedView=view,epoch=++sampleEpoch.current,source=editingProject,strategy=placementPrefs.associations,profile=['Inanimate','Decal'].includes(entity.type)?'decoration':'mechanism';window.dispatchEvent(new Event('sstar:cancel-gesture'));setPlacing(null);setSampling(false);setTool('select');setCameraEdit(false);setStatus('正在取样物件…');try{if(strategy==='material'){const fields=PROFILE_FIELDS[entity.type]??[],values=new Map(entity.nativeProperties?.map(p=>[p.field.name,p.value]));const candidates=objects?.presets.filter(p=>p.parsed&&p.type===entity.type&&p.mesh===entity.mesh)??[];const score=(p:ObjectPreset)=>fields.reduce((sum,key)=>sum+(JSON.stringify(p.signature[key]??p.values[key])===JSON.stringify(values.get(key))?1:0),0);const preset=candidates.sort((a,b)=>score(b)-score(a))[0];if(!preset)throw Error('找不到该物件对应的原生素材');if(currentView.current!==capturedView||sampleEpoch.current!==epoch)return;choose(preset);setPlacing({key:preset.key,yaw:entity.yaw});}else{let cache=sampleCache.current.get(entity);if(!cache)sampleCache.current.set(entity,cache=new Map());let bundle=cache.get(strategy);if(!bundle){bundle=await api.regionCapture(source,{ids:[id],single:true,includeBackground:!display.categories.background.locked,associations:strategy,copyPolicy:'preserve',origin:current.current!.id+':'+capturedView});cache.set(strategy,bundle);}if(currentView.current!==capturedView||sampleEpoch.current!==epoch)return;setPlacementPrefs({...preference('placementProfile:'+profile,placementProfile(profile)),continuous:true,associations:strategy});setPlacing({key:uid('sample'),bundle,yaw:0});setStatus(bundle.warnings.length?'已取样 · '+bundle.warnings.join('；'):'已取样，连续放置 · 中键可直接取样其他物件或地形');}}catch(e){if(sampleEpoch.current===epoch)setError(String(e));}}

  function duplicateMove(ids:number[],offset:Vec3){const entities=ids.map(id=>level?.entities.find(e=>e.id===id));if(entities.some(e=>!e?.cloneable||!canModify(e,display,layer))){setError('复制涉及不可编辑或锁定物件');return;}let next=nextId();const used=reservedIds(),copies=ids.map(id=>{while(used.has(next))next++;const newId=next++;used.add(newId);return{id,newId};});append([{kind:'duplicate',id:ids[0],copies,offset,copyPolicy:'preserve'}]);setSelection(copies.map(c=>c.newId));}
  function offsetSelection(axis:number,amount:number){
    const entryIds=[...new Set([...selectedEntries,...entryId?[entryId]:[]])].map(key=>level?.managedEntryIds?.[key]);
    const targets=[...selected,...entryIds.flatMap(id=>{const entry=id===undefined?undefined:knownEntities.get(id);return entry?[entry]:[];})];
    if(!targets.length){setStatus('先选择要移动的物件');return;}
    append(targets.flatMap(e=>{if(!e.position)return[];const position=[...e.position] as Vec3,step=['Inanimate','Decal'].includes(e.type)?placementPrefs.step:1;position[axis]+=Math.round(amount/step)*step;return[{kind:'transform',id:e.id,position}];}));
  }
  function locateIssue(issue:WorldIssue,reveal=false){const target=issue.levelId??(singleLevel?view:'world');if(target!==view||loadedView!==view){pendingIssue.current={issue,reveal};setView(target);return;}const ids=issue.entityIds??(issue.entityId?[issue.entityId]:[]);setSelection(ids);if(issue.entryId)setEntryId(issue.entryId);if(reveal){temporaryDisplay.current??=display;const d=clone(display);d.mode='all';d.isolate=undefined;for(const id of ids){const e=level?.entities.find(e=>e.id===id);if(e)d.categories[categoryOf(e)].visible=true;d.objects??={};d.objects[entityKey(id)]={...d.objects[entityKey(id)],hidden:false};}setDisplay(d);}setFit(n=>n+1);}
  useEffect(()=>{const pending=pendingIssue.current;if(pending&&loadedView===view&&(pending.issue.levelId??'world')===view&&level){pendingIssue.current=null;locateIssue(pending.issue,pending.reveal);}},[loadedView,view,level]);
  useCommands((id,e)=>{if(nativeOpen)return false;if(id==='layout'){workspace.current?.openMenu();return true;}if(id==='resetLayout'){workspace.current?.reset();return true;}if(id==='cancel'){if(cameraDraft)setCameraDraft(null);setCameraLayoutDraft(undefined);if(activeRegionJob.current)cancelRegionJob();else if(regionPaste)setRegionPaste(null);else if(channelConfirmation)setChannelConfirmation(null);else if(dialog)setDialog('');else{cancel();setContext(null);setIssueOpen(false);}return true;}if(dialog||regionPaste||channelConfirmation||busy)return false;const quick=/^(slot|saveSlot)([1-8])$/.exec(id);if(quick){if(cameraEdit)return false;if(quick[1]==='slot')quickSlots.use(Number(quick[2])-1);else void quickSlots.bind(Number(quick[2])-1);return true;}if(id==='save'||id==='saveAs'){if(e.target instanceof HTMLInputElement)e.target.blur();void save(id==='saveAs');return true;}if(cameraEdit&&!['undo','redo','camera','cameraRegions','settings','panels','run','runGroup','mechanisms'].includes(id))return false;switch(id){case'nativeWorld':void importNative();break;case'newLevelGroup':workspace.current?.show('levels');setTimeout(()=>window.dispatchEvent(new Event('sstar:new-level-group')),0);break;case'water':cancel();setWorkshop('water');break;case'waterEast':case'waterNorth':case'waterWest':case'waterSouth':case'waterStill':{const direction=({waterEast:1,waterNorth:2,waterWest:3,waterSouth:4,waterStill:0}as const)[id];changeWaterBrush({...waterBrush,mode:direction?'flow':'still',direction:direction||waterBrush.direction});if(!waterReason){cancel();setTool('water');}setWorkshop('water');break;}case'groups':cancel();toggleWorkshop('groups');break;case'array':openArray();break;case'overlap':cancel();setOverlapMode(v=>!v);break;case'isolate':changeDisplay({...display,isolate:organizationSelection()});break;case'showAll':changeDisplay({...display,isolate:undefined,objects:Object.fromEntries(Object.entries(display.objects??{}).map(([k,v])=>[k,{...v,hidden:false}]))});break;case'lockSelected':toggleObjectStates(organizationSelection(),'locked',true);break;case'unlockAll':changeDisplay({...display,objects:Object.fromEntries(Object.entries(display.objects??{}).map(([k,v])=>[k,{...v,locked:false}]))});break;case'quickLink':quickLink();break;case'copy':void capture();break;case'paste':pasteBundle();break;case'undo':undo();break;case'redo':undo(false);break;case'duplicate':if(cameraRegionsMode&&visiblePanels.includes('camera')){if(cameraRegionId)void cameraObjectAction({action:'clone',id:cameraRegionId,offset:[2,0,0]});}else duplicate();break;case'delete':if(cameraRegionsMode&&visiblePanels.includes('camera')){setStatus('请在区域面板删除，并检查受影响的引用');break;}if(selectedEntries.length)deleteArea(selection,selectedEntries);else if(entryId)deleteEntry(entryId);else remove();break;case'turn':case'turnBack':if(!placing)return false;if(['Wall_Set','Ocean_Map'].includes(objects?.presets.find(p=>p.key===placing.key)?.type??'')){setStatus('原生地形和水格保持轴对齐');break;}setPlacing(p=>p?{...p,yaw:(p.yaw+(id==='turnBack'?-90:90)+360)%360}:p);break;case'panels':workspace.current?.focusScene();break;case'sample':startSample();break;case'height':setHeightMode(v=>{const next=v==='surface'?'locked':'surface';writePref('heightMode',next);return next;});break;case'up':case'down':setLayer(v=>v+(id==='up'?1:-1));break;case'brushUp':case'brushDown':setBrush(v=>Math.max(1,Math.min(9,v+(id==='brushUp'?2:-2))));break;case'workplane':setWorkplaneRequest(n=>n+1);break;case'run':if(nativeWorld)void launch({mode:'world',levelIds:[]});else if(view!=='world')void launch({mode:'single',levelIds:[view]});else setStatus('先选择一个小关卡');break;case'runGroup':setDialog('runSubset');break;case'settings':setDialog('settings');break;case'cameraRegions':cancel();setCameraEdit(false);setSelection([]);setEntryId(null);setCameraRegionsMode(false);setWorkshop('camera');setTimeout(()=>window.dispatchEvent(new Event('sstar:camera-regions')),0);break;case'mechanisms':setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);toggleWorkshop('mechanisms');break;case'camera':toggleCamera();break;case'floor':case'wall':case'erase':cancel();useEditorTool(id);break;default:return false;}return true;},20);

  function commandReason(id:import('../input-config').CommandId){if(nativeOpen)return '请先返回常规工作台';if(['help','helpSearch','palette','layout','resetLayout'].includes(id))return '';if(id==='settings')return dialog?'请先关闭当前窗口':'';if(!world||!catalog)return '请先连接游戏并打开工程';if(busy)return '正在处理工程';if(dialog)return '请先关闭当前窗口';if(cameraEdit&&!['camera','cameraRegions','cameraLayout','cameraMove','cameraRotate','cameraAxisX','cameraAxisY','cameraAxisZ','undo','redo','save','saveAs','panels'].includes(id))return '请先退出镜头编辑';if(tool==='water'&&['turn','turnBack'].includes(id))return waterReason;if(tool==='water'&&id==='delete')return'先退出水流绘制，再删除整片水域';const scope=cameraEdit?'camera':placing?'placing':selection.length||selectedEntries.length?'selected':'idle';if(!commandScopes(id).includes(scope))return scope==='idle'?'请先选择物件':'此命令不适用于当前操作';if(['move','rotate','scale'].includes(id)&&!selection.length&&!selectedEntries.length&&!entryId)return '请先选择物件';if(['array','duplicate','delete','quickLink','turn','turnBack','move','rotate','scale',...['West','East','North','South','Rise','Fall'].map(v=>'nudge'+v)].includes(id)&&selected.some(e=>!canModify(e,display,layer)))return '选中项包含锁定或隐藏物件';if(id==='quickLink'&&(!selected.length||selected.some(e=>!ordinaryChannelObject(e))))return '仅支持普通开关与门闸';if(id==='array'&&(selectedEntries.length||selected.some(e=>!e.cloneable||['Wall_Set','Ocean_Map','Inanimate','Decal','Group'].includes(e.type))))return '阵列仅支持可复制的玩法物件';if(['extrude','run','sample'].includes(id)&&view==='world'&&!native)return '请进入小关卡';const slotMatch=/^(slot|saveSlot)([1-8])$/.exec(id);if(slotMatch){const index=Number(slotMatch[2])-1,s=quickSlots.data?.slots[index];if(slotMatch[1]==='slot'){if(!s)return quickSlots.data?.errors?.[String(index)]??'快捷槽为空，请先保存配置';if(view==='world'&&!native&&s.kind!=='terrain')return'物件快捷槽用于小关';}else if(view==='world'&&!native&&!['floor','wall','erase'].includes(tool)||!placing&&!['floor','wall','erase'].includes(tool)&&selection.length!==1)return'请进入小关，取样或选择单个物件';}if(id==='terrainSize'&&!['floor','wall','erase'].includes(tool))return'请先启用地形工具';if(id==='adoptCamera')return adoptionReason(level,editingProject?.camera,cameraId);if(id==='paste'&&!clipboard&&!api.regionClipboard)return '先复制一个区域';if(['turn','turnBack','rotate','scale'].includes(id)&&!placing&&selected.some(e=>['Wall_Set','Ocean_Map'].includes(e.type)))return '原生地形和水域使用专用尺寸参数';if(id==='rectangle'&&!placing)return '先选择要铺设的素材';if(['floor','wall','erase','extrude'].includes(id)&&display.categories.terrain.locked)return '地形已锁定';if(id==='undo'&&!history.current.undo.length||id==='redo'&&!history.current.redo.length)return '没有可用记录';return '';}
  const nativeAdd=useRef<(name:string)=>void>(()=>{});nativeAdd.current=name=>void addTemplate(name);const onNativeAdd=useMemo(()=>(name:string)=>nativeAdd.current(name),[]);
  useEffect(()=>{const selected=level?.entities.find(e=>e.id===selection[0]);if(!selected||protectedCameraIds.has(selected.id))return;if(entityCategory!=='all'&&(entityCategory==='decoration')!==['decoration','background','terrainArt','effects','helpers'].includes(categoryOf(selected)))setEntityCategory('all');if(entityQuery&&![entityLabel(selected,typeLabel(selected.type)),selected.mesh,selected.type,selected.id].join(' ').toLowerCase().includes(entityQuery.toLowerCase()))setEntityQuery('');},[selection]);
  const sceneEntities=useMemo(()=>level?.entities.filter(e=>!protectedCameraIds.has(e.id)&&!e.generatedSurface&&(e.editable||native&&!!e.position)&&(entityCategory==='all'||(entityCategory==='decoration')===['decoration','background','terrainArt','effects','helpers'].includes(categoryOf(e)))&&(!world||native||view!=='world'||((e.id>>>20)===900||e.id===level.managedSpawnId))&&(!entityQuery||[entityLabel(e,typeLabel(e.type)),e.mesh,e.type,typeLabel(e.type),e.id].join(' ').toLowerCase().includes(entityQuery.toLowerCase())))??[],[level,design,world?.id,view,entityQuery,entityCategory,protectedCameraIds]);
  useEffect(()=>{if(!native||!world){setNativeIndex(null);return;}let cancelled=false;void api.nativeIndex(nativeDocument(world)).then(index=>{if(!cancelled)setNativeIndex(index);}).catch(e=>setError(String(e)));return()=>{cancelled=true;};},[native,world?.id,world?.map.objects]);
  const errorCount=issues.filter(i=>i.severity==='error').length;
  const panelContents:Record<PanelId,React.ReactNode>={
    water:<WaterPanel level={level} value={waterBrush} onChange={changeWaterBrush} onTool={waterTool} onCreate={createWater} onResize={resizeWater} onSelect={id=>select([id])} origin={[Math.round(hover[0]),Math.round(hover[1]),Math.round(layer)]} active={tool==='water'} reason={waterReason}/>,
    "levels":world&&!singleLevel?<LevelDirectory key={world.id} world={world} view={view} busy={busy} onOpen={name=>void openScene(name)} onEdit={edit} onBlank={()=>void addBlank()} onTemplate={()=>setDialog('template')} onImport={()=>{if(window.workbenchHome)setDialog('level-import');else void task(async()=>{const p=await api.worldImport();if(p)addLevel(p,p.name);});}} onCopy={copyLevel} onDelete={id=>void deleteLevel(id)}/>:null,
    "objects":<aside className="s-left"><SelectionTiming ids={selection} phase="select.list"/><header className="s-panel-heading"><strong>场景物件</strong><span className="s-bar-spacer"/><small>{sceneEntities.length}</small><IconButton icon="copy" label="复制选中物件 (Ctrl+D)" disabled={!selection.length&&!selectedEntries.length} onClick={()=>duplicate()}/><IconButton icon="copy" label="创建独立副本（新频道和控制身份）" disabled={!selection.length&&!selectedEntries.length} onClick={()=>duplicate('independent')}/><IconButton icon="trash" label="删除选中物件" disabled={!selection.length&&!selectedEntries.length} onClick={()=>selectedEntries.length?deleteArea(selection,selectedEntries):remove()}/></header><div className="s-object-search"><select aria-label="场景物件分类" value={entityCategory} onChange={e=>setEntityCategory(e.target.value)}><option value="all">全部</option><option value="gameplay">非装饰</option><option value="decoration">装饰</option></select><Icon name="search" size={13}/><input aria-label="搜索场景物件" placeholder="搜索物件…" value={entityQuery} onChange={e=>setEntityQuery(e.target.value)}/></div><div className="s-object-list"><VirtualList label="场景物件" items={sceneEntities} height={280} revealIndex={sceneEntities.findIndex(e=>e.id===selection[0])} revealKey={selection} render={e=><div data-entity-id={e.id} className={'s-object-row079 '+(selection.includes(e.id)?'active':'')}><button onClick={event=>select(event.shiftKey?[...new Set([...selection,e.id])]:[e.id])} onDoubleClick={()=>{select([e.id]);setFit(n=>n+1);}} title={`${typeLabel(e.type)} #${e.id}`}><span title={entityLabel(e,typeLabel(e.type))+(e.mesh?' · '+e.mesh:'')}>{entityLabel(e,typeLabel(e.type))}</span><small>#{String(e.id).slice(-4)}</small></button><IconButton icon="eye" label={display.objects?.[entityKey(e.id)]?.hidden?'显示物件':'隐藏物件'} active={!display.objects?.[entityKey(e.id)]?.hidden} onClick={()=>toggleObjectStates([entityKey(e.id)],'hidden',!display.objects?.[entityKey(e.id)]?.hidden)}/><IconButton icon="lock" label={objectLocked(e,display)?'解锁物件':'锁定物件'} active={objectLocked(e,display)} onClick={()=>toggleObjectStates([entityKey(e.id)],'locked',!objectLocked(e,display))}/></div>}/></div>{view==='world'&&Boolean(world?.map.entries.length)&&<details className="s-entry-list079" open><summary>关卡入口 · {world?.map.entries.length}</summary><VirtualList label="关卡入口" height={144} items={world?.map.entries??[]} render={e=><div className="s-object-row079"><button onClick={()=>{setEntryId(e.id);setSelectedEntries([e.id]);setSelection([]);}}>{e.title}</button><IconButton icon="eye" label={display.objects?.[entryKey(e.id)]?.hidden?'显示入口':'隐藏入口'} active={!display.objects?.[entryKey(e.id)]?.hidden} onClick={()=>toggleObjectStates([entryKey(e.id)],'hidden',!display.objects?.[entryKey(e.id)]?.hidden)}/><IconButton icon="lock" label={keyLocked(entryKey(e.id),display)?'解锁入口':'锁定入口'} active={keyLocked(entryKey(e.id),display)} onClick={()=>toggleObjectStates([entryKey(e.id)],'locked',!display.objects?.[entryKey(e.id)]?.locked)}/></div>}/></details>}<div className="s-source-status"><i/>{catalog?'原游戏已连接':'连接中…'}<span>{catalog?.build}</span></div></aside>,
    "scene":<section className="s-center"><div className="s-scene-bar"><span><Icon name={view==='world'?'world':'cube'} size={14}/>{view==='world'?'大地图':selectedLevel?.title}</span><div className="s-tool-group"><IconButton icon="marquee" label="区域复制" active={tool==='copyRegion'} onClick={startRegion}/>{(view==='world'?[...(!native?[['spawn','user','设置出生点']]:[]),['entry','entry','放置关卡入口']]:[]).map(([id,icon,label])=><IconButton key={id} icon={icon} label={label} active={tool===id} onClick={()=>{if(id==='entry'){setEntryPrototype(null);setDialog('entry');setPlacing(null);return;}const next=tool===id?'select':id;cancel();setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);setWorkshop('');setSelection([]);setCameraProbing(false);setTool(next);}}/>)}</div><span className="s-bar-spacer"/>{nativeWorld&&streamLoading&&<button onClick={()=>{previewSeq.current++;setStreamLoading(false);setStatus('已取消加载，保留当前已显示内容');}}>取消加载</button>}<WorldRange key={world?.id+':'+view} level={view!=='world'&&loadedView===view?visualLevel??undefined:undefined} presets={view==='world'?nativeIndex?.heightRanges:undefined} value={display} onChange={changeDisplay} onOverview={view==='world'?fullOverview:undefined}/><select className="s-height-mode" aria-label="放置高度模式" value={heightMode} onChange={e=>{const v=e.target.value as 'surface'|'locked';setHeightMode(v);writePref('heightMode',v);}}><option value="surface">鼠标落面</option><option value="locked">锁定高度</option></select><label className="s-layer"><Icon name="height" size={13}/><input aria-label="编辑高度层" type="number" value={layer} onChange={e=>setLayer(Number(e.target.value))}/></label></div>
  {view!=='world'&&<nav className="s-scene-breadcrumb" aria-label="场景路径">{!singleLevel&&<button aria-label="返回大地图" onClick={()=>void openScene('world')}><Icon name="world"/>返回大地图</button>}<span>{singleLevel?'单关':'大地图'} › {selectedLevel?.title}</span></nav>}<PlacementTools onMode={changePlacementMode} value={placementPrefs} onChange={setPlacementPrefs} active={Boolean(placing)||['floor','wall','erase'].includes(tool)} sample={sampling} onSample={startSample} onWorkplane={()=>setWorkplaneRequest(n=>n+1)} onOffset={offsetSelection}/><StudioViewport terrainPalette={palette} terrainPlacement={terrainColorIssue?{}:terrainPlacement} terrainColorIssue={terrainColorIssue} onTerrainPalette={changeTerrainPalette} terrainPaintColor={terrainPaintColor} onTerrainPaintColor={setTerrainPaintColor} onTerrainPaint={paintTerrain} cameraRoom={cameraRoom} cameraEditSource={cameraEditSource} onCameraRoom={setCameraRoom} cameraPlan={cameraPlan} onEditCamera={id=>{cancel();setCameraEditSource('screen');setCameraRegionId(0);setCameraRegionsMode(false);setCameraId(id);setCameraEdit(true);setWorkshop('camera');}} onInspect={id=>{select([id]);workspace.current?.show('inspector');}} onEraseWorld={positions=>{if(!display.categories.terrain.locked)editWorldVoxels(positions,false);}} waterBrush={waterBrush} onWaterBrush={changeWaterBrush} waterEditing={visiblePanels.includes('water')||tool==='water'} waterReason={waterReason} onWaterCommit={commitWater} blankScene={selectedLevel?.project.base?.kind==='blank'} onAdoptCamera={(config,id)=>{cancel();setCameraEditSource('camera');setCameraId(id);cameraParameters(config);setCameraEdit(true);setWorkshop('camera');}} terrainPreferences={terrainPrefs} onTerrainPreferences={value=>{setTerrainPrefs(value);if(['floor','wall'].includes(tool))writePref('terrainToolFace0713:'+tool,value);}} onProbe={p=>{viewport.current=p;_props.onViewportProbe?.(p);}} relationScope={relationScope} picking={Boolean(picking)} associationCandidates={pickCandidates} onAssociationPick={chooseAssociation} entryPreviewKey={tool==='entry'?entryPrototype?.key??objects?.presets.find(p=>p.type==='Level_Entry'&&p.parsed&&p.mesh==='GAME_OVER_Entry_Locked_A'&&Number(p.values.size??0)===0)?.key:undefined} onTerrainEdit={(positions,solid)=>{if(display.categories.terrain.locked){setError('地形已锁定');return;}if(positions.length){if(view==='world'&&!native)editWorldVoxels(positions,solid);else placeTerrainCells(positions.map(([x,y,z])=>({x,y,z,solid})));}}} placementPreferences={placementPrefs} onPlacementPreferences={setPlacementPrefs} mousePreferences={inputPreferences.mouse} sampling={sampling} onSampleTerrain={sampleTerrain} onSample={id=>void sampleObject(id)} onDuplicateMove={duplicateMove} workplaneRequest={workplaneRequest} onHeightMode={setHeightMode} cameraRegionsEditing={cameraRegionsMode&&visiblePanels.includes('camera')&&!cameraEdit} cameraRegionId={cameraRegionId} onCameraRegionSelect={setCameraRegionId} onCameraRegionPatch={cameraRegionPatch} cameraProbing={cameraProbing} cameraProbe={cameraProbe} onCameraProbe={setCameraProbe} cameraId={cameraId} onCameraId={setCameraId} cameraEditing={cameraEdit} cameraConfig={cameraDraft??editingProject?.camera} onCameraDraft={setCameraDraft} onCameraCommit={cameraParameters} onCameraLayoutCommit={(c,p)=>cameraParameters(c,false,p)} overlapMode={overlapMode} arrayPreview={arrayPreview} onOverlapEnd={()=>setOverlapMode(false)} pickingIds={picking?.field==='__channel'?picking.ids:undefined} keyboardBlocked={paletteOpen||guideOpen||busy||streamLoading||Boolean(channelConfirmation)||Boolean(dialog)||Boolean(regionPaste)||loadedView!==view} navigationBlocked={paletteOpen||guideOpen||busy||Boolean(channelConfirmation)||Boolean(dialog)||Boolean(regionPaste)||loadedView!==view} display={display} onDisplay={changeDisplay} showRelations={visiblePanels.includes('relations')} onRelation={ids=>{select(ids);setWorkshop('relations');}} regionRange={activeRegionBox()?[activeRegionBox()!.min[2],activeRegionBox()!.max[2]]:copyRange} regionEntryPoints={nativeWorld?nativeIndex?.entryLinks?.map(e=>e.position):world?.map.entries.map(e=>[e.x,e.y,e.z??0] as Vec3)} regionBox={activeRegionBox()} onCapture={(a,b)=>{setRegionBox({min:[Math.round(Math.min(a[0],b[0])),Math.round(Math.min(a[1],b[1])),layer],max:[Math.round(Math.max(a[0],b[0])),Math.round(Math.max(a[1],b[1])),layer]});setStatus('已框选区域，Ctrl+C 复制');}} extras={<div className="s-tool-group">{selected.length>0&&selected.every(ordinaryChannelObject)&&<IconButton icon="link" label="点选机关快速关联 (L) · 加入目标频道" active={picking?.field==='__channel'} onClick={quickLink}/>}{[['water','flow','水域与水流'],['groups','folder','编辑分组'],['array','stamp','阵列复制'],['overlap','select','重叠选择'],['display','floor','显示与选择'],['relations','link','机关关联'],['region','copy','区域复制'],['library','folder','我的组合'],['recovery','clock','保存与恢复'],['mechanisms','warning','机关检查']].map(([id,icon,label])=><IconButton key={id} icon={icon} label={label} active={workshop===id} onClick={()=>{if(id==='water'){cancel();setWorkshop('water');return;}if(id==='array'){openArray();return;}if(id==='overlap'){cancel();setOverlapMode(true);return;}if(id==='cameraRegions'){cancel();setSelection([]);setEntryId(null);setCameraProbing(false);}if(id==='camera'){cancel();const open=!(workshop==='camera'&&cameraEdit);setCameraEdit(open);setCameraDraft(null);setCameraLayoutDraft(undefined);setWorkshop(open?'camera':'');return;}setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);toggleWorkshop(id);if(id==='recovery')void refreshRecovery();}}/>)}<button className="s-camera-edit-button" aria-pressed={cameraEdit&&cameraEditSource==='camera'} onClick={toggleCamera}><Icon name="eye" size={14}/>{cameraEdit&&cameraEditSource==='camera'?'退出普通镜头编辑':'编辑普通镜头'}</button></div>} level={loadedView===view?visualLevel:null} selection={selection} selectedEntry={entryId} selectedEntries={selectedEntries} onSelect={select} onCommit={append} onDelete={remove} onDeleteArea={deleteArea} placing={placing} onPlace={place} onStamp={stamp} onPaintRect={paintRectangle} onCancel={cancel} onTool={useEditorTool} layer={layer} onLayer={setLayer} heightMode={heightMode} brush={brush} viewKey={(world?.id??'')+':'+view} fitKey={fit} world={view==='world'&&!native?world:null} nativeWorld={nativeWorld} onNativeOverview={fullOverview} onNativeOpen={name=>void openScene(name)} onRange={range=>{const key=JSON.stringify(range);if(key===rangeKey.current)return;rangeKey.current=key;bridge.setRange(range);setRangeTick(n=>n+1);}} tool={tool} onCell={cell} onStrokeEnd={endStroke} onEntry={id=>{setEntryId(id);setSelectedEntries(id?[id]:[]);setSelection([]);}} onEntryDelete={id=>selectedEntries.includes(id)?deleteArea(selection,selectedEntries):deleteEntry(id)} onOpen={name=>void openScene(name)} onHover={p=>setHover(previous=>previous.every((n,i)=>Math.round(n)===Math.round(p[i]))?previous:p)} draft={draft} design={design} onDesign={v=>{setDesign(v);writePref('designView05',v);setStatus(v?'设计地形：清晰显示碰撞格，不改变装饰开关':display.categories.background.visible?'原生材质：显示原版场景模型，不改变装饰开关':'已选择原生材质；装饰关闭时保留设计地形，原版外观需主动显示原版布景');}}/>
  {picking&&<div className="s-pick-banner"><Icon name="target"/>{picking.field==='__channel'?'点选开关或门闸以加入频道':'点选高亮物件建立关联'} · {pickCandidates?.size??0} 个候选 · 右键或 Esc 取消<IconButton icon="close" label="取消关联" onClick={()=>setPicking(null)}/></div>}
</section>,
    "assets":<div className="s-bottom"><QuickBar data={quickSlots.data} catalog={objects} active={quickSlots.active} busy={quickSlots.busy} world={view==='world'&&!native} disabled={busy||!!dialog||cameraEdit} onUse={quickSlots.use} onBind={(i,key)=>void quickSlots.bind(i,key)} onUpdate={quickSlots.update} onDrop={i=>{if(placing?.drag){const key=placing.key;window.dispatchEvent(new Event('sstar:cancel-gesture'));setPlacing(null);void quickSlots.bind(i,key);return true;}return false;}}/><AssetLibrary terrainActive={tool} terrainColors={{placement:terrainPlacement,defaults:palette,unavailable:terrainColorIssue,onPlacement:changeTerrainPlacement,onBrush:brushFromTerrainCard}} onTerrain={kind=>{cancel();setTerrainPrefs({...terrainPrefs,...readPref('terrainToolFace0713:'+kind,{plane:'auto'}),brush:false});useEditorTool(kind);}} catalog={objects} selected={placing?.key} onChoose={choose} onDragEnd={()=>setPlacing(p=>p?.drag?null:p)} onLibrary={()=>toggleWorkshop("library")}/></div>,
    "inspector":<aside className="s-right"><SelectionTiming ids={selection} phase="select.inspector"/><div className="s-inspector-scroll">{loadedView===view&&!!level?.replayIssues?.length&&<details open className="s-inspector-content s-warning"><summary>旧工程兼容提示 · {level.replayIssues.length} 项</summary><p>这些改动保留在工程文件中，当前场景需要核对对应对象或模板。</p>{level.replayIssues.map((message,i)=><p key={i}>{message}</p>)}</details>}{selected.length?<><>{nativeWorld&&selected.length===1&&selected[0].type==='Level_Entry'&&<div className="s-native-summary09"><AssociationPicker label="入口目标关卡" items={levelTargets} value={String(nativeValue(selected[0],'level_name')??'')} allowClear={false} disabled={objectLocked(selected[0],display)} onChange={key=>void applyParameters([{kind:'properties',id:selected[0].id,values:{level_name:key}}])}/><button onClick={()=>void openScene(String(selected[0].nativeProperties?.find(p=>p.field.name==='level_name')?.value??''))}>编辑目标关卡</button></div>}</><fieldset disabled={selected.some(e=>!e.editable||objectLocked(e,display))}><StudioInspector level={level} references={referenceControls} onLinkView={r=>void linkScroll(r)} onEditLinkedCamera={id=>{window.dispatchEvent(new Event('sstar:cancel-gesture'));setCameraRegionId(0);setCameraId(id);setCameraEditSource('camera');setCameraRegionsMode(false);setCameraEdit(true);setWorkshop('camera');}} onEditWater={()=>{setWorkshop('water');}} onSelectGroup={ids=>{setPicking(null);setSelection(ids);setEntryId(null);setDraft([]);setFit(n=>n+1);}} onCloneControl={cloneLinked} entities={selected} all={level?.entities??[]} catalog={objects} busy={busy} onApply={applyParameters} onDraft={setDraft} picking={picking?.field??null} onPick={startAssociation}/></fieldset></>:entry?<WorldEntryInspector key={entry.id} world={world!} entry={entry} entity={knownEntities.get(level?.managedEntryIds?.[entry.id]??0)} catalog={objects} levels={levelTargets} targets={associationTargets} locked={keyLocked(entryKey(entry.id),display)}
      onEdit={change=>edit(w=>{const target=w.map.entries.find(e=>e.id===entry.id);if(target)change(target);})}
      onTransform={patch=>{const id=level?.managedEntryIds?.[entry.id];if(id!==undefined)append([{kind:'transform',id,...patch}]);}}
      onOpen={()=>void openScene(entry.levelId)} onDelete={()=>deleteEntry(entry.id)}
      onFolder={id=>edit(w=>{const target=w.levels.find(l=>l.id===entry.levelId);if(target)target.folderId=id||undefined;},true)}
      onEditorGroup={id=>edit(w=>{const key=entryKey(entry.id);for(const group of w.map.editor?.groups??[]){group.members=group.members.filter(member=>member!==key);if(group.id===id)group.members.push(key);}},true)}
      onGroups={()=>setWorkshop('groups')} locate={referenceControls.locate} hover={referenceControls.hover}/>:nativeWorld&&world?<NativeWorldSettings world={world} index={nativeIndex} level={level} display={display} onDisplay={changeDisplay} onName={name=>edit(w=>{w.name=name;},true)} onEntry={()=>{setEntryPrototype(null);setDialog('entry');}} onCamera={()=>setWorkshop('camera')} onTopology={topologyParameters} onOverview={()=>{changeDisplay({...display,mode:'all'});const t=nativeIndex?.topology;if(t){const center=t.corner.map((v,i)=>v+t.size[i]/2),distance=Math.max(t.size[0],t.size[1])*1.3;viewport.current?.loadMemory({position:[center[0],center[1]-distance*.3,center[2]+distance],target:center,fov:45,up:[0,0,1]});}}} onFocus={p=>{changeDisplay({...display,mode:'range',min:p[2]-3,max:p[2]+5,upper:'hide'});viewport.current?.loadMemory({position:[p[0],p[1]-10,p[2]+16],target:p,fov:45,up:[0,0,1]});}}/>:view==='world'?<div className="s-inspector-content"><div className="s-object-header"><Icon name="world" size={24}/><strong>大地图设置</strong></div><div className="s-world-camera-actions"><button className="s-text-button" onClick={toggleCamera}>编辑大地图镜头</button><button className="s-text-button" onClick={()=>setWorkshop('camera')}>打开镜头设置</button></div><TimingControls key={view} {...settingsControls}/><label className="s-field">工程名称<BufferInput label="工程名称" type="text" value={world?.name??''} onCommit={name=>edit(w=>{w.name=name;})}/></label><details open className="s-inspector-section"><summary>地图</summary><div className="s-map-size">{(['width','height']as const).map(a=><label className="s-field" key={a}>{a==='width'?'宽度':'高度'}<BufferInput label={'地图'+a} value={String(world?.map[a]??32)} onCommit={v=>{const n=Math.max(4,Math.min(worldXYLimit,Math.round(Number(v))));if(!world)return;const width=a==='width'?n:world.map.width,height=a==='height'?n:world.map.height;const resized={...world.map,width,height};if([mapSpawn(world.map),...world.map.entries.map(e=>[e.x,e.y,e.z??0] as Vec3),...worldVoxels(world.map)].some(([x,y])=>!worldContains(resized,x,y))){setError('缩小地图前，请处理边界外的地形、入口和出生点');return;}edit(w=>{w.map.width=width;w.map.height=height;});}}/></label>)}</div><p className="s-muted">出生点 {world&&mapSpawn(world.map).join(', ')} · {world?.map.entries.length} 个入口</p><AssociationPicker label="新入口关联关卡" items={levelTargets} value={world?.levels.some(l=>l.id===quick)?quick:world?.levels[0]?.id??''} onChange={setQuick} allowClear={false}/></details><button className="s-text-button" onClick={()=>{setEntryPrototype(null);setDialog('entry');}}><Icon name="entry"/>放置入口</button><p className="s-muted">双击地图入口编辑对应小关卡。</p></div>:<div className="s-inspector-content"><div className="s-object-header"><Icon name="cube" size={24}/><strong>关卡设置</strong></div><TimingControls key={view} {...settingsControls}/><label className="s-field">关卡名称<BufferInput label="当前关卡名称" type="text" value={selectedLevel?.title??''} onCommit={title=>edit(w=>{w.levels.find(l=>l.id===view)!.title=title;})}/></label><button className="s-text-button" onClick={toggleCamera}>编辑镜头</button><button className="s-text-button" onClick={()=>{setWorkshop('camera');}}>打开镜头设置</button><TopologyInspector level={level} config={editingProject?.topology} blank={selectedLevel?.project.base?.kind==='blank'} onChange={topologyParameters}/><p className="s-muted">{selectedLevel?.project.base?.kind==='blank'?'空白场景':'原版模板 · '+selectedLevel?.project.template}</p><div className="s-empty"><Icon name="select" size={30}/><span>选择物件查看参数，或从底部拖入素材。</span></div></div>}{nativeWorld&&!selected.length&&<div className="s-inspector-content"><TimingControls key={view} {...settingsControls}/></div>}</div></aside>,
    "groups":<div className="s-inspector-scroll"><OrganizationPanel meta={(view==='world'?world?.map.editor:selectedLevel?.project.editor)??{groups:[]}} selection={organizationSelection()} display={display} onChange={setOrganization} onSelect={selectOrganization} onDisplay={changeDisplay} onCopy={copyOrganization} allowed={organizationAllowed}/></div>,
    "array":<div className="s-inspector-scroll">{(view!=='world'||native)&&selected.length>0&&selected.every(e=>e.cloneable&&!['Wall_Set','Ocean_Map','Inanimate','Decal','Group','Level_Entry'].includes(e.type))?<ArrayPanel key={view+selection.join(',')} entities={selected} active={visiblePanels.includes('array')&&workshop==='array'} onPreview={setArrayPreview} onCancel={()=>{setArrayPreview([]);setWorkshop('');}} onCommit={commitArray}/>:<div className="s-empty">请在小关中选择可复制的玩法物件。</div>}</div>,
    "cameraRegions":null,
    "camera":<UnifiedCameraPanel screenSettings={<RoomPowerControls {...settingsControls} screens={!!level&&screenLayout(level,cameraDraft??editingProject?.camera).enabled}/>} key={(world?.id??'')+':'+view} context={(world?.id??'')+':'+view} editSource={cameraEditSource} room={cameraRoom} level={level} config={cameraDraft??editingProject?.camera} plan={cameraPlan} onPlanChange={changeCameraPlan} cameraId={cameraId} onCameraId={id=>{window.dispatchEvent(new Event('sstar:cancel-gesture'));setCameraId(id);setCameraRegionId(0);setCameraRegionsMode(false);setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);}} editing={cameraEdit} onExit={()=>{window.dispatchEvent(new Event('sstar:cancel-gesture'));setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);}} onChange={cameraParameters} onPreview={setCameraDraft} regionsActive={cameraRegionsMode} onRegionsActive={v=>{window.dispatchEvent(new Event('sstar:cancel-gesture'));setCameraRegionsMode(v);setCameraEdit(false);if(!v)setCameraProbing(false);}} selected={cameraRegionId} onSelect={id=>{window.dispatchEvent(new Event('sstar:cancel-gesture'));setCameraRegionId(id);setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);if(level?.camera?.controls.some(c=>c.id===id)){setCameraId(id);setCameraRegionId(0);setCameraRegionsMode(false);}else setCameraRegionsMode(false);}} onPatch={cameraRegionPatch} onAction={r=>void cameraObjectAction(r)} onEdit={id=>{window.dispatchEvent(new Event('sstar:cancel-gesture'));setCameraEditSource('camera');setCameraId(id);setCameraRegionId(0);setCameraRegionsMode(false);setCameraEdit(true);}} onInspect={id=>{select([id]);workspace.current?.show('inspector');}} onTool={setTool} probing={cameraProbing} onProbing={v=>{setCameraRegionsMode(true);setCameraProbing(v);}} probe={cameraProbe} busy={busy} layer={layer}/>,
    "mechanisms":<div className="s-inspector-scroll"><><MechanismPanel level={level} issues={issues.filter(i=>i.levelId===view||view==='world'&&!i.levelId)} onLocate={locateIssue}/>{temporaryDisplay.current&&<button onClick={()=>{setDisplay(temporaryDisplay.current!);temporaryDisplay.current=null;}}>恢复原显示过滤</button>}</></div>,
    "display":<div className="s-inspector-scroll"><DisplayPanel value={display} layer={layer} onChange={changeDisplay}/></div>,
    "relations":<div className="s-inspector-scroll"><div className="s-workshop"><div className="s-channel-tabs"><button aria-pressed={relationTab==='channels'} onClick={()=>setRelationTab('channels')}>频道</button><button aria-pressed={relationTab==='references'} onClick={()=>setRelationTab('references')}>对象引用</button></div>{temporaryDisplay.current&&<button onClick={()=>{setDisplay(temporaryDisplay.current!);temporaryDisplay.current=null;viewport.current?.highlightCandidate();}}>恢复显示过滤</button>}{relationTab==='channels'&&<ChannelPanel members={channelMembers} selection={selection} busy={busy||nativeWorld&&!nativeAssociationRows&&!!api.nativeAssociations} locate={target=>focusAssociation(target,false)} highlight={referenceControls.hover} focusGroup={focusChannel} apply={commitChannelOperations} confirm={setChannelConfirmation}/>}</div>{relationTab==='references'&&<><label className="s-field">关系范围<select value={relationScope} onChange={e=>setRelationScope(e.target.value as typeof relationScope)}><option value="selected">选中相关</option><option value="channel">当前频道</option><option value="all">全部关系</option></select></label><button onClick={()=>{if(!level)return;const graph=relationsFor(level,selection,relationScope),ids=[...new Set([...graph.channels.flatMap(c=>c.members.map(e=>e.id)),...graph.references.flatMap(r=>[r.source.id,...r.target?[r.target.id]:[]])])];locateIssue({severity:'warning',message:'关联物件',levelId:view==='world'?undefined:view,entityIds:ids},true);}}>临时显示关联物件</button><RelationsPanel scope={relationScope} level={level} selection={selection} onLocate={id=>{const key=Object.entries(level?.managedEntryIds??{}).find(([,value])=>value===id)?.[0];const target=targetIndex.get(key?entryKey(key):entityKey(id));if(target)focusAssociation(target);}} onClear={changeReference} onPick={startAssociation}/></>}</div>,
    "region":<div className="s-inspector-scroll"><RegionPanel bundle={clipboard} onBundle={setClipboard} min={copyRange[0]} max={copyRange[1]} onRange={(a,b)=>setCopyRange([a,b])} onCapture={startRegion} selected={Boolean(regionBox)} onCopy={()=>void capture()} allHeights={allCopyHeights} onAllHeights={setAllCopyHeights} onPaste={()=>pasteBundle()} onSave={()=>void saveAssembly()}/></div>,
    "library":<div className="s-inspector-scroll"><AssemblyPanel items={assemblies} onPlace={pasteBundle} onImport={()=>void task(async()=>{await api.assemblyImport();setAssemblies(await api.assemblyList());})} onRemove={id=>void task(async()=>{await api.assemblyRemove(id);setAssemblies(await api.assemblyList());})} onExport={b=>void task(()=>api.assemblyExport(b))} onRename={(item,name)=>void task(async()=>{const next=await api.assemblySave({...item.bundle,name});if(next.id!==item.id)await api.assemblyRemove(item.id);setAssemblies(await api.assemblyList());})}/></div>,
    "recovery":<div className="s-inspector-scroll"><RecoveryPanel items={recoveries} onRefresh={()=>void refreshRecovery()} onRestore={id=>void restoreRecovery(id)}/></div>,
    "topology":<div className="s-dock-page">{view==='world'&&!native?<p>请进入小关卡编辑循环与边界。</p>:<TopologyInspector level={level} config={editingProject?.topology} blank={selectedLevel?.project.base?.kind==='blank'} onChange={topologyParameters}/>}</div>,
    "placement":<div className="s-dock-page"><PlacementTools onMode={changePlacementMode} value={placementPrefs} onChange={setPlacementPrefs} active={Boolean(placing)||['floor','wall','erase'].includes(tool)} sample={sampling} onSample={startSample} onWorkplane={()=>setWorkplaneRequest(n=>n+1)} onOffset={offsetSelection}/></div>,
    "native":<div className="s-dock-page native"><NativeLevelPicker key={catalog?.sourceHash??'unknown'} catalog={catalog} onAdd={onNativeAdd}/></div>,
    "settings":<div className="s-dock-page"><button onClick={()=>setDialog('performance')}>性能诊断</button><button onClick={()=>setDialog('maintenance')}>存储空间</button><SettingsPanel/></div>,
    "workspace":<div className="s-dock-page"><WorkspaceSettings/><MaintenancePanel/></div>,
    "guide":<Guide key={dockedGuideKey} initialReading={dockedGuideReading} embedded focusToken={0} onClose={()=>workspace.current?.toggle('guide')}/>,
    "validation":<ValidationPanel singleLevel={singleLevel} issues={issues} world={world} current={view} state={validationState} onLocate={locateIssue}/>
  };
  if(!catalog)return <><UpdateDialog beforeInstall={async()=>true}/><div inert={guideOpen||paletteOpen||nativeOpen?true:undefined}><SetupScreen onConnected={connected} onHelp={openGuide}/></div>{paletteOpen&&<CommandPalette reason={commandReason} onClose={()=>setPaletteOpen(false)} onExecute={id=>{setPaletteOpen(false);setTimeout(()=>executeCommand(id),0);}}/>}{guideOpen&&<Guide focusToken={guideFocus} onClose={closeGuide} onDock={catalog?reading=>{setDockedGuideReading(reading);closeGuide();setDockedGuideKey(v=>v+1);workspace.current?.show('guide');}:undefined}/>}</>;
  return <><div className="studio" inert={guideOpen||paletteOpen?true:undefined} onPointerDown={()=>{if(context)setContext(null);}}><header className="s-mainbar"><span className="s-brand"><Icon name="cube" size={19}/><strong>沉星之序</strong><small>STUDIO 0.11</small></span><button className="s-project-menu" onClick={()=>setDialog('project')}>{singleLevel?'单关':window.projectTabs?'工程':world?.name??'连接中'}{!window.projectTabs&&dirty&&<i/>}<Icon name="down" size={12}/></button><span className="s-separator"/><IconButton icon="folder" label={singleLevel?'打开单关或工程':'打开工程'} disabled={busy} onClick={()=>{if(!openProjectTab('open'))void task(async()=>{if(dirty&&!confirm('放弃未保存修改并打开工程？'))return;const w=await api.worldLoad();if(w)accept(w);});}}/><IconButton icon="save" label="保存 (Ctrl+S)" disabled={busy||!world} onClick={()=>void save()}/><IconButton icon="export" label={singleLevel?'导出当前关':'导出关卡或工程'} disabled={busy||!world} onClick={()=>void openExport()}/><IconButton icon="undo" label="撤销 (Ctrl+Z)" disabled={!history.current.undo.length||busy} onClick={()=>undo()}/><IconButton icon="redo" label="重做 (Ctrl+Shift+Z)" disabled={!history.current.redo.length||busy} onClick={()=>undo(false)}/><span className="s-bar-spacer"/><UpdateDialog beforeInstall={async()=>{if(dirty){await save();return savedWorld.current===current.current;}return true;}}/><button aria-label="切换深浅主题" title="整个编辑器深色／浅色" onClick={()=>setTheme(v=>v==='dark'?'light':'dark')}>{theme==='dark'?'☀':'☾'}</button><button aria-pressed={simple} onClick={()=>{window.dispatchEvent(new Event('sstar:cancel-gesture'));setSimple(v=>!v);}}>{simple?'简洁':'完整'}</button><IconButton icon="search" label="搜索命令 (Ctrl+Shift+P)" onClick={()=>{window.dispatchEvent(new Event('sstar:cancel-gesture'));setPaletteOpen(true);}}/><IconButton icon="help" label="操作指南" onClick={openGuide}/><IconButton icon="settings" label="快捷键与鼠标设置" onClick={()=>setDialog('settings')}/><div ref={setLayoutMenuHost}/><span className="s-separator"/><button className={'s-issues-button '+(errorCount?'invalid':'')} onClick={()=>workspace.current?.toggle('validation')} title={singleLevel?'检查关卡':'检查工程'}><Icon name={errorCount?'warning':'check'} size={14}/>{errorCount||'就绪'}</button>{!singleLevel&&<select className="s-quick-select" aria-label="试玩范围" disabled={busy} value={runMode} onChange={e=>{const mode=e.target.value as RunRequest['mode'];setRunMode(mode);if(mode==='subset')setDialog('runSubset');}}><option value="single" disabled={view==='world'}>当前关卡 · 直接进入</option><option value="subset">临时关卡组…</option><option value="world">整个工程</option></select>}<PlayButton disabled={busy||!world} onRun={()=>void launch()} onFresh={singleLevel?undefined:()=>void launch({mode:'world',levelIds:[],start:'fresh'})}/></header>
  <DockWorkspace key={singleLevel?'level':'world'} singleLevel={singleLevel} simple={simple} ref={workspace} onVisibleChange={setVisiblePanels} menuHost={layoutMenuHost} onActivate={id=>{if(id==='scene')return;const next=["groups","array","cameraRegions","camera","mechanisms","display","relations","region","library","recovery"].includes(id)?id:'';workshopValue.current=next;setWorkshopState(next);if(id==='recovery')void refreshRecovery();}} onClose={id=>{if(id==='camera'){setCameraEdit(false);setCameraDraft(null);setCameraLayoutDraft(undefined);}if(id==='water'&&tool==='water'){cancel();}if(id==='array'){setArrayPreview([]);}if(id==='cameraRegions'){setCameraProbing(false);}if(workshopValue.current===id){workshopValue.current='';setWorkshopState('');}}} renderPanel={id=>panelContents[id]}/>

  <PreparationProgress progress={preparationProgress}/><footer className="s-status"><span className={error?'s-error':''}><i/>{error||status}</span><span className="s-status-right">{regionProgress&&<button type="button" aria-label="取消区域操作" onClick={cancelRegionJob}>{regionProgress} · 取消</button>}<PerformanceStatus onReport={()=>setDialog('performance')}/>{busy?'处理中':dirty?'未保存':'已保存'}<span>{selection.length} 已选</span><span>X {Number(hover[0].toFixed(2))} · Y {Number(hover[1].toFixed(2))} · Z {layer}</span><IconButton icon="search" label="搜索命令 (Ctrl+Shift+P)" onClick={()=>{window.dispatchEvent(new Event('sstar:cancel-gesture'));setPaletteOpen(true);}}/><IconButton icon="help" label="操作指南" onClick={openGuide}/></span></footer>
  {dialog==='compatibility'&&compatibilityReport&&<Modal title="工程兼容报告（只读）" onClose={()=>setDialog('')}><div className="s-update-content"><h3>{compatibilityReport.name}</h3><p>来源 Build {compatibilityReport.build}</p><p>数据指纹 {compatibilityReport.hash}</p>{compatibilityReport.issues.map((s,i)=><p className="s-error" key={i}>{s}</p>)}{!compatibilityReport.issues.length&&<p>工程格式可读取。打开工程后，可在属性栏和工程检查中查看具体场景的问题。</p>}<ul>{compatibilityReport.levels.map((l,i)=><li key={i}>{l.name} · {l.template} · {l.operations} 项编辑</li>)}</ul><p>报告只读取工程目录和来源信息。</p></div></Modal>}{dialog==='settings'&&<Modal title="操作设置" onDock={()=>{setDialog('');workspace.current?.show('settings');}} className="s-settings-modal07" onClose={()=>setDialog('')}><button className="s-text-button" onClick={()=>setDialog('maintenance')}>存储空间、试玩设置与测试存档 →</button><button className="s-text-button" onClick={()=>setDialog('performance')}>性能诊断</button><SettingsPanel/></Modal>}
  {regionPaste&&<RegionPasteDialog bundle={regionPaste.bundle} initial={regionPaste.at} yaw={regionPaste.yaw} world={view==='world'} expanding={expansionLabel} targets={nativeWorld?(nativeIndex?.entryLinks??[]).map(e=>({id:String(e.id),title:e.target+' #'+e.id,position:e.position})):(world?.map.entries??[]).map(e=>({id:e.id,title:e.title,position:[e.x,e.y,e.z??0] as Vec3}))} targetChannels={(level?.entities??[]).filter(e=>['Gate','Switch'].includes(e.type)).map(e=>String(e.nativeProperties?.find(p=>p.field.name==='flavor')?.value??0))} busy={busy} error={error} onClose={()=>{cancelRegionJob();setRegionPaste(null);setError('');}} onPaste={(at,yaw,options)=>void commitRegion(at,yaw,options)}/>}
  {dialog==='performance'&&<PerformancePanel onClose={()=>setDialog('')}/>}
  {dialog==='runSubset'&&world&&<Modal title="临时关卡组试玩" onClose={()=>setDialog('')}><RunPicker world={world} selected={runIds} onChange={setRunIds} onRun={()=>void launch({mode:'subset',levelIds:runIds})}/></Modal>}
  {dialog==='recoverStartup'&&<Modal title="发现自动恢复副本" onClose={()=>setDialog('')}><RecoveryPanel items={recoveries.filter(r=>r.kind==='auto')} onRefresh={()=>void refreshRecovery()} onRestore={id=>void restoreRecovery(id)}/><button className="s-text-button" onClick={()=>setDialog('')}>继续使用正式文件</button></Modal>}
  {context&&<div className="s-context" style={{left:context.x,top:context.y}} onPointerDown={e=>e.stopPropagation()}><button onClick={()=>{setRenaming(context.id);setContext(null);}}><Icon name="rename"/>重命名</button><button onClick={()=>copyLevel(context.id)}><Icon name="copy"/>复制关卡</button><button className="danger" onClick={()=>deleteLevel(context.id)}><Icon name="trash"/>删除关卡及入口</button></div>}
  {dialog==='template'&&<Modal title="从原版模板添加关卡" onDock={()=>{setDialog('');workspace.current?.show('native');}} onClose={()=>setDialog('')}><NativeLevelPicker key={catalog?.sourceHash??'unknown'} catalog={catalog} onAdd={onNativeAdd}/></Modal>}
  {dialog==='export'&&world&&<ExportDialog singleLevel={singleLevel} project={world} current={view==='world'?undefined:view} levels={world.levels.map(l=>({id:l.id,title:l.title}))} onClose={()=>setDialog('')} onDone={p=>setStatus('已导出 '+p)} onShare={window.workbenchHome?prepareCommunity:undefined} onCover={window.workbenchHome?saveHomeCover:undefined} onLibraryAdd={window.workbenchHome?saveLevelToLibrary:undefined}/>}
  {dialog==='level-import'&&world&&<LevelImportDialog world={world} folder={selectedLevel?.folderId} onClose={()=>setDialog('')} onImport={commitLevelImport}/>}
  {dialog==='project'&&singleLevel&&<Modal title="单关" onClose={()=>setDialog('')} className="s-project-dialog">
    <label className="s-field">关卡名称<BufferInput label="关卡名称" type="text" value={world?.name??''} onCommit={value=>{
      const title=value.trim().slice(0,100);
      if(title&&world&&title!==world.name)edit(w=>{w.name=title;w.levels[0].title=title;w.levels[0].project.title=title;},true);
    }}/></label>
    <div className="s-menu-grid">
      <button onClick={()=>openProjectTab('new-level')}><Icon name="plus"/>新建单关</button>
      <button onClick={()=>openProjectTab('new')}><Icon name="world"/>新建工程</button>
      <button disabled={busy||!world} onClick={()=>void save(true)}><Icon name="save"/>另存单关</button>
      <button disabled={busy||!world} onClick={()=>void openExport()}><Icon name="export"/>导出与分享</button>
    </div>
  </Modal>}
  {dialog==='project'&&!singleLevel&&<Modal title="工程" onClose={()=>setDialog('')} className="s-project-dialog"><label className="s-field">工程名称<BufferInput label="项目名称" type="text" value={world?.name??''} onCommit={name=>edit(w=>{w.name=name;})}/></label><div className="s-menu-grid">{window.projectTabs&&<button onClick={()=>openProjectTab('new-level')}><Icon name="plus"/>新建单关</button>}<button onClick={()=>void importNative()}>导入／编辑原版三层世界</button><button onClick={()=>setDialog('maintenance')}>存储空间</button><button onClick={()=>void loadExample('studio')}><Icon name="brush"/>谜题设计与独立试玩练习</button><button onClick={()=>{if(!openProjectTab('new'))void task(async()=>{if(dirty&&!confirm('放弃未保存修改？'))return;accept(await api.worldCreate());setDialog('');});}}><Icon name="plus"/>新建世界工程</button><button onClick={()=>void loadExample('showcase')}><Icon name="cube"/>原生素材示例</button><button onClick={()=>void loadExample('recreations')}><Icon name="template"/>原版／复刻对照</button><button onClick={()=>void openExport()}><Icon name="export"/>导出关卡／工程</button><button disabled={busy||!world} onClick={()=>world&&void task(async()=>setStatus(await api.worldDeploy(world)))}><Icon name="import"/>仅部署测试副本</button><button onClick={()=>void api.reveal()}><Icon name="folder"/>打开工作区</button><button disabled title={PLAYTEST_SUSPENSION}><Icon name="refresh"/>重置旧版共享测试进度</button><button onClick={()=>void task(async()=>setStatus(await api.restore()))}><Icon name="undo"/>恢复测试副本</button><button onClick={()=>void task(async()=>{if(dirty&&!confirm('放弃未保存修改并切换游戏目录？'))return;const c=await api.chooseGame();if(c){setCatalog(c);setObjects(await api.objectCatalog());accept(await api.worldCreate());setDialog('');}})}><Icon name="settings"/>选择游戏目录</button></div><button onClick={()=>void task(async()=>{setCompatibilityReport(await api.inspectCompatibility());setDialog('compatibility');})}>只读查看工程兼容报告</button><WorkspaceSettings/><p className="s-muted">来源游戏数据指纹用于检查原生资源，不是账号绑定。本工具只修改试玩副本，不直接覆盖原安装。Build {catalog?.build} · 原游戏运行时不会替换测试文件或切换战役。</p></Modal>}

  {dialog==='maintenance'&&<Modal title="存储空间" className="s-settings-modal07" onClose={()=>setDialog('')}><MaintenancePanel/></Modal>}
  {channelConfirmation&&<Modal title="确认调整频道" onClose={()=>setChannelConfirmation(null)}><div className="s-workshop"><p>将 {channelConfirmation.ops.length} 个选中机关加入频道 {channelConfirmation.channel}。</p><strong>合并后的成员</strong><div className="s-inspector-scroll" style={{maxHeight:180}}>{channelMembers.filter(item=>item.channel===channelConfirmation.channel||channelConfirmation.ops.some(op=>op.id===item.id)).map(item=><p key={item.key}>{item.title} · #{item.id}</p>)}</div><div className="s-channel-actions"><button onClick={()=>{commitChannelOperations(channelConfirmation.ops);setChannelConfirmation(null);}}>确认关联</button><button onClick={()=>setChannelConfirmation(null)}>取消</button></div></div></Modal>}
  {dialog==='entry'&&<Modal title="放置大地图关卡入口" onClose={()=>setDialog('')}><div className="s-inspector-content"><AssociationPicker label="放置入口的目标关卡" items={levelTargets} value={world?.levels.some(l=>l.id===quick)?quick:world?.levels[0]?.id??''} onChange={setQuick} allowClear={false} defaultOpen/><p className="s-muted">{entryPrototype?'原生样式：'+entryPrototype.label:'默认原生入口'} · 放下后可在右侧改关联。</p><button className="s-text-button" disabled={!world?.levels.length} onClick={()=>{if(native){const p=entryPrototype??objects?.presets.find(p=>p.type==='Level_Entry'&&p.parsed);if(!p){setError('缺少已验证原生入口样式');return;}setPlacing({key:p.key,yaw:0});setTool('select');}else{setTool('entry');setPlacing(null);}setDialog('');setStatus('在大地图地面点击放置入口，右键结束');}}>开始放置</button>{!world?.levels.length&&<p>请先创建一个小关卡。</p>}</div></Modal>}

  </div>{paletteOpen&&<CommandPalette reason={commandReason} onClose={()=>setPaletteOpen(false)} onExecute={id=>{setPaletteOpen(false);setTimeout(()=>executeCommand(id),0);}}/>}{guideOpen&&<Guide focusToken={guideFocus} onClose={closeGuide} onDock={catalog?reading=>{setDockedGuideReading(reading);closeGuide();setDockedGuideKey(v=>v+1);workspace.current?.show('guide');}:undefined}/>}</>;
  function cancelPlacementOnly(){setPlacing(null);setTool('select');}
}

function SelectionTiming({ids,phase}:{ids:readonly number[];phase:'select.list'|'select.inspector'}){
  useLayoutEffect(()=>{perf.selectionPhase(ids,phase);},[ids,phase]);
  return null;
}
