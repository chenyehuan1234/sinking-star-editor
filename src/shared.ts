import type {NativeValue,ObjectCatalog,ObjectField} from './catalog-types';
import type {MeshAsset,TextureAsset,MaterialAsset,AssetStatus} from './asset-types';
export type Vec3=[number,number,number];
export interface TransformOp { kind:'transform'; id:number; position?:Vec3; yaw?:number; rotation?:[number,number,number,number];scale?:Vec3 }
export interface CloneOp { kind:'clone'; id:number; newId:number; position:Vec3 }
export interface DeleteOp {kind:'delete';id:number}
export interface ControlOp {kind:'control';id:number;ids:number[];targetId?:number}
export interface PropertiesOp {kind:'properties';id:number;values:Record<string,NativeValue>;sourceTemplate?:string}
export interface PrefabOp {kind:'prefab';id:number;template:string;sourceId:number;position:Vec3;values?:Record<string,NativeValue>;assembly?:boolean}
export interface TerrainOp {kind:'terrain';id:number;cells:{x:number;y:number;z:number;solid:boolean}[]}
export interface ProfileOp {kind:'profile';id:number;template:string;sourceId:number}
export interface DuplicateOp {kind:'duplicate';id:number;copies:{id:number;newId:number}[];offset:Vec3;associations?:'independent'|'shared'}
export interface RegionBundle {format:"sstar-region";version:1;sourceHash:string;sourceBuild:string;name:string;sources:string[];records:{id:number;type:string;diff:string}[];terrain:Vec3[];warnings:string[];associations?:'independent'|'shared'}
export interface RegionSelection {ids:number[];bounds?:{min:Vec3;max:Vec3};includeBackground?:boolean;associations?:'independent'|'shared';single?:boolean}
export interface StampOp {kind:"stamp";id:number;bundle:RegionBundle;position:Vec3;yaw:number}
export interface RunRequest {mode:"world"|"single"|"subset";levelIds:string[]}
export interface RecoveryItem {id:string;name:string;at:string;kind:"auto"|"manual";summary:string;recoverable?:boolean}
export interface AssemblyItem {id:string;name:string;at:string;bundle:RegionBundle}
export type EditOp=ControlOp|StampOp|TransformOp|CloneOp|DeleteOp|PropertiesOp|PrefabOp|TerrainOp|ProfileOp|DuplicateOp;
export type ProjectBase={kind:'template';template:string}|{kind:'blank';width:number;height:number};
export interface CameraOverride {id:number;position?:Vec3;target?:Vec3;upDistance?:number;southDistance?:number;fov?:number;panRate?:number;yaw?:number}
export type CameraObjectKind='play'|'overview'|'height-lock'|'limiter'|'overview-region';
export type CameraObjectEdit={kind:'clone';sourceId:number;sourceTemplate?:string;ids:Record<string,number>;offset:Vec3}|{kind:'patch';id:number;values:Record<string,number|string|boolean>}|{kind:'delete';ids:number[]};
export type CameraObjectRequest={action:'create';kind:CameraObjectKind;position:Vec3}|{action:'clone';id:number;offset:Vec3}|{action:'delete';id:number};
export interface CameraConfig {mode:'template'|'single'|'screens';screenSize?:[number,number];origin?:[number,number];margins?:[number,number];controls?:CameraOverride[];edits?:CameraObjectEdit[]}
export interface NativeCameraView {id:number;name:string;position:Vec3;rotation:[number,number,number,number];overview:boolean;primary:boolean;upDistance:number;southDistance:number;fov:number;panRate:number;positionId?:number;lookAtId?:number;resolvedPosition?:Vec3;resolvedTarget?:Vec3}
export interface CameraRegion {id:number;position:Vec3;extents:Vec3;kind:number;cameraId:number;category?:CameraObjectKind;name?:string;priority?:number;sourceType?:'Camera_Marker'|'Marker';targetId?:number;nativeParameter?:number}
export interface CameraView {perScreen:boolean;screenSize:[number,number];origin:[number,number];margins:[number,number];controls:NativeCameraView[];regions:CameraRegion[];references?:{sourceId:number;field:string;targetId:number}[]}
export interface TopologyConfig {corner:Vec3;size:Vec3;wrapping:boolean;wrappingOverride:number;forceWrappingOverride:boolean}
export interface NativeTopologyView extends TopologyConfig {perScreen:boolean;maskCount:number}
export interface EditorProject { format:'sinking-star-project'; version:1|2|3; sourceHash:string; sourceBuild:string; template:string; base?:ProjectBase; name:string; operations:EditOp[];camera?:CameraConfig;topology?:TopologyConfig }
export interface EditableProperty {name:string;label:string;kind:'number'|'boolean'|'target';value:number|boolean;min?:number;max?:number;targets?:string[]}
export interface EntityView {id:number;type:string;position:Vec3|null;yaw:number;editable:boolean;bytes:number;mesh:string;cloneable:boolean;properties?:EditableProperty[];rotation?:[number,number,number,number];scale?:Vec3;materials?:string[];tint?:Vec3;accessoryMask?:number;generatedSurface?:boolean;nativeProperties?:{field:ObjectField;value:NativeValue}[]}
export interface LevelView {name:string;entities:EntityView[];typeCount:number;manifest:string;camera?:CameraView;topology?:NativeTopologyView;terrain?:{x:number;y:number;z:number;id?:number}[];waters?:{id:number;x:number;y:number;z:number;width:number;height:number;cells:number[]}[]}
export type Tile=0|1|2;
export interface WorldEntry {id:string;title:string;levelId:string;x:number;y:number;prototype?:{template:string;sourceId:number}}
export interface WorldLevel {id:string;title:string;project:EditorProject}
export interface WorldProject {format:'sinking-star-world';version:1|2|3;id:string;name:string;sourceHash:string;sourceBuild:string;map:{width:number;height:number;tiles:Tile[];spawn:[number,number];entries:WorldEntry[];objects?:EditOp[]};levels:WorldLevel[]}
export interface WorldIssue {severity:'error'|'warning';message:string;entryId?:string;levelId?:string;entityId?:number;entityIds?:number[];category?:'reference'|'channel'|'dependency'|'native'}
export interface PrefabView {key:string;label:string;type:string;template:string;sourceId:number;values?:Record<string,number|boolean>}
export interface NativeLevelRegion {id:string;title:string;layer:'ground'|'underground'|'sky'|'other';levels:string[];cell?:[number,number]}
export interface GameInstallation {path:string;build:string;directoryValid:boolean;compatibility:'unchecked'|'data-checked'|'unverified';reason?:string;saved?:boolean}
export interface GameDiscovery {installations:GameInstallation[];workspace:string;workspaceLocked:boolean;pendingWorkspace?:string}
export interface PreparationEstimate {workspace:string;prepared:boolean;sourceBytes:number;requiredBytes:number;availableBytes:number;canPrepare:boolean}
export interface Catalog {gamePath:string;sourceHash:string;build:string;levels:string[];regions?:NativeLevelRegion[];workspace:string;runtimeVerified:boolean;compatibility?:string}
export interface EditorApi {
 cameraObject(p:EditorProject,request:CameraObjectRequest):Promise<CameraConfig>;
  regionCapture(p:EditorProject,selection:RegionSelection):Promise<RegionBundle>;
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
  runLaunch(w:WorldProject,r:RunRequest):Promise<string>;
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
