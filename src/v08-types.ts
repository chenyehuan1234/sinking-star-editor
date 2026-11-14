import type {EditOp,LevelView,Vec3,RunRequest} from './shared';
export interface StorageRow {id:string;path:string;category:string;bytes:number;files:number;eligible:boolean;reason:string;dependencies:string[]}
export interface StorageScan {token:string;at:string;rows:StorageRow[];total:number;reclaimable:number}
export interface TestProfile {id:string;name:string;projectId:string;scope:string;revision:string;sourceHash:string;createdAt:string;lastUsed:string;archived:boolean;legacy?:boolean;legacySource?:string}
export interface LegacyTestProfile {id:string;sourceHash:string;name:string;path:string}
export interface PlayPreferences {settings:'original'|'independent';cacheLimitBytes:number}
export interface TestContext {projectId:string;scope:RunRequest;revision:string;sourceHash:string}
export interface PlaytestChoice {profileId?:string;newProfileName?:string;resetProfileId?:string}
export interface PlaytestPlan {context:TestContext;compatible:TestProfile[];incompatible:TestProfile[];supported:boolean;reason:string;preparation?:import('./shared').PreparationEstimate}
export type NativeLayer='ground'|'underground'|'sky';
export interface NativeRegionAssignment {layer:NativeLayer;cell:[number,number];areaId:string}
export interface NativeWorldProject {format:'sinking-star-native-world';version:4;id:string;name:string;sourceHash:string;sourceBuild:string;base:'overworld';edits:Record<string,EditOp[]>;levelEdits:Record<string,EditOp[]>;assignments:NativeRegionAssignment[]}
export interface NativeWorldCell {id:string;layer:NativeLayer;cell:[number,number];center:Vec3;count:number;entries:{id:number;name:string;position:Vec3}[];areaId?:string;title:string}
export interface NativeWorldIndex {recordCount:number;entryCount:number;layers:{id:NativeLayer;count:number}[];cells:NativeWorldCell[];levels:string[];areas:{id:string;title:string;layer:NativeLayer}[];screenSize:[number,number];origin:[number,number];topology?:LevelView['topology']}
export interface NativeRegionRequest {session:string;revision:number;project:NativeWorldProject;cellId:string;neighbors?:boolean;includeBackground?:boolean}
export interface NativeRegionResult {session:string;revision:number;cellId:string;view:LevelView;recordCount:number;elapsedMs:number;nextId?:number}
