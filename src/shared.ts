import type{WaterDirection,WaterPaintMode}from'./water-edit';
import type{QuickSlotSet}from'./quick-slots';
import type {EditorMetadata} from './editor-organization';
import type {PreviewRequest,PreviewDelta} from './preview-delta';
import type {NativeValue,ObjectCatalog,ObjectField} from './catalog-types';
import type {MeshAsset,TextureAsset,MaterialAsset,AssetStatus} from './asset-types';
export type Vec3=[number,number,number];
export interface TransformOp { kind:'transform'; id:number; position?:Vec3; yaw?:number; rotation?:[number,number,number,number];scale?:Vec3 }
export interface CloneOp { kind:'clone'; id:number; newId:number; position:Vec3 }
export interface DeleteOp {kind:'delete';id:number}
export interface ControlOp {kind:'control';id:number;ids:number[];targetId?:number}
export interface PropertiesOp {kind:'properties';id:number;values:Record<string,NativeValue>;sourceTemplate?:string;viewCameraId?:number}
export interface PrefabOp {kind:'prefab';id:number;template:string;sourceId:number;position:Vec3;values?:Record<string,NativeValue>;assembly?:boolean}
export interface TerrainOp {kind:'terrain';id:number;cells:{x:number;y:number;z:number;solid:boolean}[]}
export interface WaterCreateOp {kind:'waterCreate';id:number;position:Vec3;width:number;height:number}
export interface WaterResizeOp {kind:'waterResize';id:number;position:Vec3;width:number;height:number}
export interface WaterPaintOp {kind:'water';id:number;mode:WaterPaintMode;direction:WaterDirection;cells:[number,number][]}
export interface WaterView {id:number;x:number;y:number;z:number;width:number;height:number;cells:number[];gridZ?:number;kind?:number;detectHoles?:boolean;name?:string;error?:string}
export interface ProfileOp {kind:'profile';id:number;template:string;sourceId:number}
export type CopyPolicy='preserve'|'independent';
export interface DuplicateOp {copyPolicy?:CopyPolicy;kind:'duplicate';id:number;copies:{id:number;newId:number}[];offset:Vec3;associations?:'independent'|'shared'}
export interface RegionEntrance {id:number;title:string;levelId:string;position:Vec3;appearance:string;unlocks:number[];unlockAny:boolean}
export interface RegionLevelLink {levelId:string;doorId:number;field:'target_level'|'switch_to_level_set';target:string;targetId?:string}
export interface RegionTransfer {size:Vec3;entries:RegionEntrance[];levels:WorldLevel[];links:RegionLevelLink[];channels?:string[]}
export interface RegionBundle {terrainPaint?:import('./terrain-paint').TerrainFacePaint[];copyPolicy?:CopyPolicy;origin?:string;format:"sstar-region";version:1|2;sourceHash:string;sourceBuild:string;name:string;sources:string[];records:{id:number;type:string;diff:string}[];terrain:Vec3[];warnings:string[];associations?:'independent'|'shared';transfer?:RegionTransfer}
export interface RegionSelection {copyPolicy?:CopyPolicy;origin?:string;ids:number[];bounds?:{min:Vec3;max:Vec3};includeBackground?:boolean;associations?:'independent'|'shared';single?:boolean;volume?:boolean}
export interface StampOp {context?:string;kind:"stamp";id:number;bundle:RegionBundle;position:Vec3;yaw:number;entries?:Record<number,{level:string;externalUnlocks:number[]}>}
export interface RegionPasteOptions {expand:boolean;skipConflicts:boolean;includeDependencies:boolean;unlocks:Record<string,string>}
export interface RegionPasteRequest {world:WorldProject;scene:string;bundle:RegionBundle;at:Vec3;yaw:number;id:number;options:RegionPasteOptions}
export interface RunRequest {mode:"world"|"single"|"subset";levelIds:string[]}
export interface RecoveryItem {id:string;name:string;at:string;kind:"auto"|"manual";summary:string;recoverable?:boolean}
export interface AssemblyItem {id:string;name:string;at:string;bundle:RegionBundle}
export interface LevelSettingsOp {kind:'levelSettings';id:0;values:import('./level-settings').LevelSettings}
export interface TerrainPaintOp {kind:'terrainPaint';id:0;defaults?:import('./terrain-paint').TerrainPalette;faces?:import('./terrain-paint').TerrainFacePaint[]}
export type EditOp=TerrainPaintOp|LevelSettingsOp|WaterCreateOp|WaterResizeOp|WaterPaintOp|ControlOp|StampOp|TransformOp|CloneOp|DeleteOp|PropertiesOp|PrefabOp|TerrainOp|ProfileOp|DuplicateOp;
export type ProjectBase={kind:'template';template:string}|{kind:'blank';width:number;height:number};
/** In screen mode XY are offsets from each screen centre; otherwise world coordinates. */
export interface CameraPose {position:Vec3;target:Vec3;up:Vec3}
export interface CameraOverride {id:number;position?:Vec3;target?:Vec3;pose?:CameraPose;nativePose?:CameraPose;upDistance?:number;southDistance?:number;lookAtSouthDistance?:number;fov?:number;panRate?:number;yaw?:number}
export type CameraObjectKind='play'|'overview'|'height-lock'|'limiter'|'overview-region';
export type CameraObjectEdit={kind:'clone';sourceId:number;sourceTemplate?:string;ids:Record<string,number>;offset:Vec3}|{kind:'patch';id:number;values:Record<string,number|string|boolean>}|{kind:'delete';ids:number[]};
export type CameraObjectRequest={action:'create';kind:CameraObjectKind;position:Vec3;role?:'main'|'aux';sourceId?:number}|{action:'clone';id:number;offset:Vec3}|{action:'delete';id:number};
export interface ViewGiverLinkRequest {ids:number[];slot:'view'|'overview'|'overview2';cameraId:number}
export interface ViewGiverLinkResult {project:EditorProject;cameraId:number;copied:boolean}
export interface CameraConfig {mode:'template'|'single'|'screens';screenSize?:[number,number];origin?:[number,number];margins?:[number,number];controls?:CameraOverride[];edits?:CameraObjectEdit[]}
export interface NativeCameraView {id:number;name:string;position:Vec3;rotation:[number,number,number,number];overview:boolean;primary:boolean;upDistance:number;southDistance:number;lookAtSouthDistance?:number;fov:number;panRate:number;positionId?:number;lookAtId?:number;resolvedPosition?:Vec3;resolvedTarget?:Vec3}
export interface CameraRegion {id:number;position:Vec3;extents:Vec3;kind:number;cameraId:number;category?:CameraObjectKind;name?:string;priority?:number;sourceType?:'Camera_Marker'|'Marker';targetId?:number;nativeParameter?:number}
export interface CameraView {perScreen:boolean;screenSize:[number,number];origin:[number,number];margins:[number,number];controls:NativeCameraView[];regions:CameraRegion[];references?:{sourceId:number;field:string;targetId:number}[]}
export interface TopologyConfig {corner:Vec3;size:Vec3;wrapping:boolean;wrappingOverride:number;forceWrappingOverride:boolean}
export interface NativeTopologyView extends TopologyConfig {perScreen:boolean;maskCount:number}
export interface EditorProject {sourceEvidence?:import('./core/compatibility').SourceEvidence; format:'sinking-star-project'; version:1|2|3; sourceHash:string; sourceBuild:string; template:string; base?:ProjectBase; name:string; operations:EditOp[];editor?:EditorMetadata;camera?:CameraConfig;topology?:TopologyConfig }
export interface EditableProperty {name:string;label:string;kind:'number'|'boolean'|'target';value:number|boolean;min?:number;max?:number;targets?:string[]}
export interface EntityView {prismPreset?:number;renderPurpose?:import('./render-purpose').RenderPurpose;nativeFlags?:string;id:number;type:string;position:Vec3|null;yaw:number;editable:boolean;bytes:number;mesh:string;cloneable:boolean;properties?:EditableProperty[];rotation?:[number,number,number,number];scale?:Vec3;materials?:string[];tint?:Vec3;accessoryMask?:number;generatedSurface?:boolean;nativeProperties?:{field:ObjectField;value:NativeValue;defaulted?:boolean}[]}
export interface LevelView {levelSettings?:import('./level-settings').LevelSettings;overview?:boolean;partial?:boolean;externalTargets?:{id:number;type:string;position:Vec3}[];name:string;entities:EntityView[];typeCount:number;manifest:string;camera?:CameraView;topology?:NativeTopologyView;terrain?:{x:number;y:number;z:number;id?:number;paintable?:boolean;colors?:import('./terrain-paint').TerrainFaceColors}[];waters?:WaterView[]}
export type Tile=0|1|2;
export interface WorldEntry {id:string;title:string;levelId:string;x:number;y:number;z?:number;unlocks?:[first?:string|null,second?:string|null,third?:string|null];unlockAny?:boolean;prototype?:{template:string;sourceId:number};appearance?:string}
export interface WorldLevel {folderId?:string;id:string;title:string;project:EditorProject}
export interface WorldMap {width:number;height:number;tiles:Tile[];origin?:[number,number];voxels?:Vec3[];spawn:[number,number];spawnZ?:number;entries:WorldEntry[];objects?:EditOp[];editor?:EditorMetadata}
export interface WorldProject {native?:import('./native-project').NativeDocumentMeta;levelGroups?:import('./native-project').LevelFolder[];sourceEvidence?:import('./core/compatibility').SourceEvidence;format:'sinking-star-world';version:1|2|3|4;id:string;name:string;sourceHash:string;sourceBuild:string;map:WorldMap;levels:WorldLevel[]}
export interface WorldIssue {severity:'error'|'warning';message:string;entryId?:string;levelId?:string;entityId?:number;entityIds?:number[];category?:'reference'|'channel'|'dependency'|'native'}
export interface PrefabView {key:string;label:string;type:string;template:string;sourceId:number;values?:Record<string,number|boolean>}
export interface NativeLevelRegion {id:string;title:string;layer:'ground'|'underground'|'sky'|'other';levels:string[];cell?:[number,number];cells?:[number,number][];subregions?:{cell:[number,number];levels:string[]}[];nameSource?:'native-volume'|'overlap'|'unmarked';areaKey?:string}
export interface GameInstallation {path:string;build:string;directoryValid:boolean;compatibility:'unchecked'|'data-checked'|'unverified';reason?:string;saved?:boolean}
export interface GameDiscovery {installations:GameInstallation[];workspace:string;workspaceLocked:boolean;pendingWorkspace?:string}
export interface PreparationProgress {phase:'scan'|'copy'|'verify'|'replace'|'cleanup';copiedBytes:number;totalBytes:number;filesCopied:number;totalFiles:number;currentFile?:string}
export interface PreparationEstimate {workspace:string;prepared:boolean;requiresRefresh?:boolean;sourceBytes:number;requiredBytes:number;availableBytes:number;canPrepare:boolean}
export interface Catalog {gamePath:string;sourceHash:string;build:string;levels:string[];regions?:NativeLevelRegion[];workspace:string;runtimeVerified:boolean;compatibility?:string}
export interface EditorApi {
  profileAsset?<K extends import('./asset-diagnostics').AssetKind>(request:import('./asset-diagnostics').AssetProfileRequest & {kind:K}):Promise<import('./asset-diagnostics').ProfiledAsset<K>>;
  savePerformanceReport?(json:string):Promise<boolean>;
  onPlaytestProgress?(callback:(text:string,progress?:PreparationProgress)=>void):()=>void;
  exportDesign(r:import('./export-types').ExportRequest):Promise<import('./export-types').ExportResult|null>;
 storageScan():Promise<import('./v08-types').StorageScan>;
 storageClean(token:string,ids:string[]):Promise<{reclaimed:number}>;
 playPreferences():Promise<import('./v08-types').PlayPreferences>;
 playPreferencesSave(value:import('./v08-types').PlayPreferences):Promise<import('./v08-types').PlayPreferences>;
 testLegacyProfiles():Promise<import('./v08-types').LegacyTestProfile[]>;
 testProfileImport(id:string):Promise<import('./v08-types').TestProfile>;
 testProfiles():Promise<import('./v08-types').TestProfile[]>;
 testProfileSelect(context:import('./v08-types').TestContext):Promise<{compatible:import('./v08-types').TestProfile[];incompatible:import('./v08-types').TestProfile[]}>;
 testProfileCreate(context:import('./v08-types').TestContext,name:string):Promise<import('./v08-types').TestProfile>;
 testProfileChange(id:string,action:'rename'|'archive'|'delete'|'reset',name?:string):Promise<void>;
 nativeSearch(project:import('./v08-types').NativeWorldProject,query:string):Promise<{id:number;type:string;name:string;position:Vec3;cellId:string}[]>;
 nativeIndex(project?:import('./v08-types').NativeWorldProject):Promise<import('./v08-types').NativeWorldIndex>;
 nativeImpact(project:import('./v08-types').NativeWorldProject,name:string):Promise<{entries:number[];references:string[]}>;
 nativeValidate(project:import('./v08-types').NativeWorldProject):Promise<WorldIssue[]>;
 nativeCreate():Promise<import('./v08-types').NativeWorldProject>;
 nativePreviewUpdate?(request:import('./v08-types').NativeViewportPreviewRequest):Promise<import('./preview-delta').PreviewDelta>;
 nativeRegion(request:import('./v08-types').NativeRegionRequest):Promise<import('./v08-types').NativeRegionResult>;
 nativeDeploy(project:import('./v08-types').NativeWorldProject):Promise<string>;
 nativeBuild(project:import('./v08-types').NativeWorldProject):Promise<{path:string;hash:string;changed:string[]}>;
 nativeSave(project:import('./v08-types').NativeWorldProject,saveAs?:boolean):Promise<string|null>;
 nativeLoad():Promise<import('./v08-types').NativeWorldProject|null>;

 inspectCompatibility:()=>Promise<{name:string;build:string;hash:string;levels:{name:string;template:string;operations:number}[];issues:string[]}|null>;

 updateCheck:()=>Promise<import('./update-version').ReleaseUpdate|null>;updateDownload:()=>Promise<{file:string;installer:boolean}>;updateInstall:()=>Promise<void>;

 quickSlotsRead():Promise<QuickSlotSet>;
 quickSlotsWrite(value:QuickSlotSet):Promise<QuickSlotSet>;
 previewUpdate(request:PreviewRequest):Promise<PreviewDelta>;
 cameraObject(p:EditorProject,request:CameraObjectRequest):Promise<CameraConfig>;
 viewGiverLink(p:EditorProject,request:ViewGiverLinkRequest):Promise<ViewGiverLinkResult>;
  regionCapture(p:EditorProject,selection:RegionSelection):Promise<RegionBundle>;
  worldRegionCapture?(w:WorldProject,scene:string,selection:RegionSelection,job?:string):Promise<RegionBundle>;
  worldRegionPaste?(request:RegionPasteRequest,job?:string):Promise<WorldProject>;
  cancelRegionJob?(job:string):Promise<void>;
  onRegionProgress?(callback:(job:string,phase:string)=>void):()=>void;
  regionClipboard?(bundle?:RegionBundle):Promise<RegionBundle|null>;
  onRegionClipboardChange?(callback:()=>void):()=>void;
  regionPreview(bundle:RegionBundle):Promise<LevelView>;
  assemblyList():Promise<AssemblyItem[]>;
  assemblySave(bundle:RegionBundle):Promise<AssemblyItem>;
  assemblyRemove(id:string):Promise<void>;
  assemblyImport():Promise<AssemblyItem|null>;
  assemblyExport(bundle:RegionBundle):Promise<void>;
  recoveryWrite(w:WorldProject):Promise<void>;
  recoveryList(w:WorldProject):Promise<RecoveryItem[]>;
  recoveryRestore(w:WorldProject,id:string):Promise<WorldProject>;
  runValidate(w:WorldProject,r:RunRequest):Promise<WorldIssue[]>;
  runPlan(w:WorldProject,r:RunRequest):Promise<import('./v08-types').PlaytestPlan>;
  runLaunch(w:WorldProject,r:RunRequest,choice?:import('./v08-types').PlaytestChoice):Promise<string>;
  nativeRunPlan(p:import('./v08-types').NativeWorldProject,r:RunRequest):Promise<import('./v08-types').PlaytestPlan>;
  nativeRunLaunch(p:import('./v08-types').NativeWorldProject,r:RunRequest,choice?:import('./v08-types').PlaytestChoice):Promise<string>;
  levelCreateBlank(width?:number,height?:number):Promise<EditorProject>;
  presetPreview(key:string):Promise<LevelView>;
  thumbnailRead(key:string):Promise<string|null>;
  thumbnailWrite(key:string,png:string):Promise<void>;
  objectCatalog():Promise<ObjectCatalog>;
  meshAsset(name:string,lod?:number):Promise<MeshAsset>;
  previewMesh(request:{name:string;lod?:number;accessoryMask?:number;pose:'idle'}):Promise<MeshAsset>;
  textureAsset(name:string,size?:number):Promise<TextureAsset>;
  materialAsset(name:string):Promise<MaterialAsset>;
  assetStatus():Promise<AssetStatus>;
  worldPreview(w:WorldProject):Promise<LevelView>;
  worldExample():Promise<WorldProject>;
  worldStudioExample():Promise<WorldProject>;
  worldRecreations():Promise<WorldProject>;
  worldCreate():Promise<WorldProject>;
  worldValidate(w:WorldProject):Promise<WorldIssue[]>;
  worldSave(w:WorldProject,saveAs?:boolean):Promise<string|null>;
  worldStartup():Promise<WorldProject|null>;
  worldLoad():Promise<WorldProject|null>;
  worldImport():Promise<EditorProject|null>;
  worldPrefabs():Promise<PrefabView[]>;
  worldBuild(w:WorldProject):Promise<{path:string;hash:string}>;
  worldDeploy(w:WorldProject,quickEntry?:string):Promise<string>;
  worldLaunch(w:WorldProject,quickEntry?:string):Promise<string>;
  worldReset(w:WorldProject):Promise<string>;
  discoverGames():Promise<GameDiscovery>;
  chooseWorkspace():Promise<{path:string;pendingRestart:boolean}|null>;
  preparationEstimate():Promise<PreparationEstimate>;
  connect(path?:string):Promise<Catalog>;
  chooseGame():Promise<Catalog|null>;
  openLevel(name:string):Promise<LevelView>;
  preview(project:EditorProject):Promise<LevelView>;
  save(project:EditorProject):Promise<string|null>;
  load():Promise<EditorProject|null>;
  build(project:EditorProject):Promise<{path:string;hash:string}>;
  prepare():Promise<string>;
  deploy(project:EditorProject):Promise<string>;
  launch():Promise<string>;
  restore():Promise<string>;
  reveal():Promise<void>;
}
declare global {interface Window {editor:EditorApi}}
