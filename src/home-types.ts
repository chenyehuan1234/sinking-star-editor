import type {LevelView, PreparationProgress, WorldProject} from './shared';
import type {ShareDraft,ShareManifest,SharedGroup,SharedLevel} from './share-types';

export type HomeLevel = SharedLevel;
export interface HomeDirectory {groups:SharedGroup[];levels:HomeLevel[]}
export interface HomeProject { key:string; name:string; path:string; modified:number; count:number; cover:string; singleLevel?:boolean; missing?:boolean; directoryPending?:boolean }
export interface DownloadedLevel {key:string;name:string;author:string;version:string;at:string;manifest:ShareManifest;work:string;level?:string;source:string;size:number;origin?:'local'|'community'}
export interface LibraryAddResult {saved:number;failed:{id:string;title:string;reason:string}[]}
export type DownloadResult={kind:'project';project:HomeProject}|{kind:'level';item:DownloadedLevel};
export interface SceneThumbnail {image:string;fallback?:boolean}
export type ThumbnailSource='project'|'library';
export type HomeShareSource={kind:ThumbnailSource;key:string;level?:string};
export type CommunitySignIn={mode:'device';username:string}|{mode:'recover';username:string;recovery:string}|{mode:'legacy';username:string;password:string};
export type CommunityRead={data:unknown;stale:boolean;checked?:true};
export type LevelImportChoice = {kind:'download'|'file';key:string};
export interface LevelImportSource {choice:LevelImportChoice;title:string;levels:HomeLevel[];primary:string}
export interface HomeApi {
  list():Promise<HomeProject[]>;
  levels(key:string):Promise<HomeLevel[]>;
  catalog():Promise<{projects:HomeProject[];directories:Record<string,HomeDirectory>}>;
  addDirectory():Promise<boolean>;
  open(key:string, level?:string):Promise<void>;
  importFile():Promise<HomeProject|null>;
  renameProject(key:string,title:string):Promise<void>;
  removeProject(key:string):Promise<void>;
  feedback(kind:'bug'|'idea'):Promise<void>;
  openImported(key:string):Promise<void>;
  thumbnail(key:string, level:string, source?:ThumbnailSource):Promise<SceneThumbnail|null>;
  preview(key:string, level:string, source?:ThumbnailSource):Promise<{level:LevelView; cameraKey?:string;signature:string}|null>;
  thumbnailSave(key:string, level:string, image:SceneThumbnail,signature:string,source?:ThumbnailSource):Promise<void>;
  useCover(image:string):Promise<void>;
  prepare(project:WorldProject, level:string|undefined, cover?:string):Promise<ShareDraft>;
  prepareShareFrom(source:HomeShareSource):Promise<ShareDraft>;
  shareSave(draftId?:string):Promise<string|null>;
  shareDraft():Promise<ShareDraft|null>;
  shareClear(draftId?:string):Promise<void>;
  onShareDraft(listener:()=>void):()=>void;
  authorSignIn(input:CommunitySignIn):Promise<{username:string}>;
  authorRecovery():Promise<string|null>;
  request(route:string, method?:string, json?:unknown):Promise<unknown>;
  browse(route:string,refresh?:boolean,localOnly?:boolean):Promise<CommunityRead|null>;
  image(route:string,version?:string,refresh?:boolean):Promise<string|null>;
  download(id:string, level?:string):Promise<DownloadResult>;
  downloads():Promise<DownloadedLevel[]>;
  renameLibraryItem(key:string,title:string):Promise<void>;
  removeLibraryItem(key:string):Promise<void>;
  downloadSave(key:string):Promise<string|null>;
  openLibraryItem(key:string):Promise<void>;
  libraryPlay(key:string):Promise<string>;
  onLibraryPlayProgress(listener:(message:string,progress?:PreparationProgress)=>void):()=>void;
  libraryAddFile():Promise<DownloadedLevel|null>;
  libraryAddLevels(key:string,ids:string[]):Promise<LibraryAddResult>;
  libraryAddScene(project:WorldProject,level:string):Promise<DownloadedLevel>;
  importPick():Promise<LevelImportSource|null>;
  importInto(project:WorldProject,choice:LevelImportChoice,folderId?:string):Promise<{project:WorldProject;primary:string;count:number}>;
  publish(input:{title:string;description:string;version:string;tags?:string[];id?:string;draftId?:string;images:boolean;cover?:boolean;previews?:string[]}):Promise<{id:string;warning?:string}>;
  publishedPreview(work:string,version:string,level:string):Promise<LevelView|null>;
  publishedThumbnail(work:string,version:string,level:string,image?:string):Promise<string|null>;
  sharePreview(level:string,draftId?:string):Promise<LevelView>;
  shareImage(level:string,image:string,draftId?:string):Promise<void>;
  replaceImage(work:string,level:string,image:string,version?:string):Promise<void>;
  onOpenScene(listener:(id:string)=>void):()=>void;
  startScene():Promise<{scene?:string;singleLevel:boolean}>;
}
export type HomeCamera = {orthographic?:boolean;span?:number;zoom?:number;position:number[];target:number[];fov:number;up?:number[];near?:number;far?:number};
declare global {interface Window {workbenchHome?:HomeApi}}
