import { contextBridge, ipcRenderer } from 'electron';
import type { EditorApi } from '../shared';
import type {ProjectTabsApi,ProjectTabState} from '../project-tabs';
import type {HomeApi} from '../home-types';
const invoke=(method:string,...args:unknown[])=>ipcRenderer.invoke(`editor:${method}`,...args);
const api:EditorApi={
profileAsset:request=>invoke('profileAsset',request),savePerformanceReport:json=>invoke('savePerformanceReport',json),
onPlaytestProgress:callback=>{const listener=(_event:unknown,text:string,progress?:import('../shared').PreparationProgress)=>callback(String(text),progress);ipcRenderer.on('editor:playtest-progress',listener);return()=>{ipcRenderer.removeListener('editor:playtest-progress',listener);};},
exportDesign:r=>invoke('exportDesign',r),
storageScan:(...args:any[])=>invoke('storageScan',...args),
storageClean:(...args:any[])=>invoke('storageClean',...args),
playPreferences:(...args:any[])=>invoke('playPreferences',...args),
playPreferencesSave:(...args:any[])=>invoke('playPreferencesSave',...args),
testLegacyProfiles:()=>invoke('testLegacyProfiles'),testProfileImport:id=>invoke('testProfileImport',id),
testProfiles:(...args:any[])=>invoke('testProfiles',...args),
testProfileSelect:(...args:any[])=>invoke('testProfileSelect',...args),
testProfileCreate:(...args:any[])=>invoke('testProfileCreate',...args),
testProfileChange:(...args:any[])=>invoke('testProfileChange',...args),
nativeSearch:(p,q)=>invoke('nativeSearch',p,q),
nativeIndex:(...args:any[])=>invoke('nativeIndex',...args),
nativeImpact:(...args:any[])=>invoke('nativeImpact',...args),nativeValidate:(...args:any[])=>invoke('nativeValidate',...args),nativeCreate:(...args:any[])=>invoke('nativeCreate',...args),
nativeAssociations:p=>invoke('nativeAssociations',p),nativeRegion:(...args:any[])=>invoke('nativeRegion',...args),nativePreviewUpdate:r=>invoke('nativePreviewUpdate',r),
nativeDeploy:(...args:any[])=>invoke('nativeDeploy',...args),nativeBuild:(...args:any[])=>invoke('nativeBuild',...args),
nativeSave:(...args:any[])=>invoke('nativeSave',...args),
nativeLoad:(...args:any[])=>invoke('nativeLoad',...args),inspectCompatibility:()=>invoke('inspectCompatibility'),updateCheck:()=>invoke('updateCheck'),updateDownload:()=>invoke('updateDownload'),updateInstall:()=>invoke('updateInstall'),
 quickSlotsRead:()=>invoke('quickSlotsRead'),quickSlotsWrite:v=>invoke('quickSlotsWrite',v),
 cameraObject:(p,r)=>invoke('cameraObject',p,r),viewGiverLink:(p,r)=>invoke('viewGiverLink',p,r),
 worldRegionPaste:(request,job)=>invoke('worldRegionPaste',request,job),worldRegionCapture:(w,scene,selection,job)=>invoke('worldRegionCapture',w,scene,selection,job),
 cancelRegionJob:job=>invoke('cancelRegionJob',job),onRegionProgress:callback=>{const listener=(_event:unknown,job:string,phase:string)=>callback(job,phase);ipcRenderer.on('editor:region-progress',listener);return()=>{ipcRenderer.removeListener('editor:region-progress',listener);};},regionClipboard:b=>invoke('regionClipboard',b),
 onRegionClipboardChange:callback=>{const listener=()=>callback();ipcRenderer.on('editor:region-clipboard-changed',listener);return()=>{ipcRenderer.removeListener('editor:region-clipboard-changed',listener);};},
 regionCapture:(p,s)=>invoke("regionCapture",p,s),regionPreview:b=>invoke("regionPreview",b),assemblyList:()=>invoke("assemblyList"),assemblySave:b=>invoke("assemblySave",b),assemblyRemove:id=>invoke("assemblyRemove",id),assemblyImport:()=>invoke("assemblyImport"),assemblyExport:b=>invoke("assemblyExport",b),recoveryWrite:w=>invoke("recoveryWrite",w),recoveryList:w=>invoke("recoveryList",w),recoveryRestore:(w,id)=>invoke("recoveryRestore",w,id),runValidate:(w,r)=>invoke("runValidate",w,r),runPlan:(w,r)=>invoke("runPlan",w,r),nativeRunPlan:(p,r)=>invoke("nativeRunPlan",p,r),nativeRunLaunch:(p,r,c)=>invoke("nativeRunLaunch",p,r,c),runLaunch:(w,r,c)=>invoke("runLaunch",w,r,c),
  previewMesh:r=>invoke('previewMesh',r),worldStartup:()=>invoke('worldStartup'),levelCreateBlank:(w,h)=>invoke('levelCreateBlank',w,h),presetPreview:k=>invoke('presetPreview',k),thumbnailRead:k=>invoke('thumbnailRead',k),thumbnailWrite:(k,p)=>invoke('thumbnailWrite',k,p),
  worldRecreations:()=>invoke('worldRecreations'),
  objectCatalog:()=>invoke('objectCatalog'),worldPreview:w=>invoke('worldPreview',w),worldExample:()=>invoke('worldExample'),worldStudioExample:()=>invoke('worldStudioExample'),meshAsset:(n,l)=>invoke('meshAsset',n,l),textureAsset:(n,s)=>invoke('textureAsset',n,s),materialAsset:n=>invoke('materialAsset',n),assetStatus:()=>invoke('assetStatus'),
  worldCreate:()=>invoke('worldCreate'),worldValidate:w=>invoke('worldValidate',w),worldSave:(w,a)=>invoke('worldSave',w,a),worldLoad:()=>invoke('worldLoad'),worldImport:()=>invoke('worldImport'),worldPrefabs:()=>invoke('worldPrefabs'),worldBuild:w=>invoke('worldBuild',w),worldDeploy:(w,e)=>invoke('worldDeploy',w,e),worldLaunch:(w,e)=>invoke('worldLaunch',w,e),worldReset:w=>invoke('worldReset',w),
  discoverGames:()=>invoke('discoverGames'),chooseWorkspace:()=>invoke('chooseWorkspace'),preparationEstimate:()=>invoke('preparationEstimate'),
  connect:path=>invoke('connect',path),chooseGame:()=>invoke('chooseGame'),openLevel:n=>invoke('openLevel',n),previewUpdate:r=>invoke('previewUpdate',r),preview:p=>invoke('preview',p),
  save:p=>invoke('save',p),load:()=>invoke('load'),build:p=>invoke('build',p),prepare:()=>invoke('prepare'),deploy:p=>invoke('deploy',p),launch:()=>invoke('launch'),restore:()=>invoke('restore'),reveal:()=>invoke('reveal')
};contextBridge.exposeInMainWorld('editor',api);
if(process.argv.includes('--sstar-project-tabs')){
  const homeInvoke=(name:string,...args:unknown[])=>ipcRenderer.invoke('home:'+name,...args);
  const listen=(name:string,callback:(...args:any[])=>void)=>{const listener=(_event:unknown,...args:unknown[])=>callback(...args);ipcRenderer.on('home:'+name,listener);return()=>ipcRenderer.removeListener('home:'+name,listener);};
  const home:HomeApi={
    list:()=>homeInvoke('list'),levels:k=>homeInvoke('levels',k),catalog:()=>homeInvoke('catalog'),addDirectory:()=>homeInvoke('addDirectory'),open:(k,l)=>homeInvoke('open',k,l),
    importFile:()=>homeInvoke('importFile'),openImported:k=>homeInvoke('openImported',k),thumbnail:(k,l,o)=>homeInvoke('thumbnail',k,l,o),
    renameProject:(k,t)=>homeInvoke('renameProject',k,t),removeProject:k=>homeInvoke('removeProject',k),feedback:k=>homeInvoke('feedback',k),
    preview:(k,l,o)=>homeInvoke('preview',k,l,o),thumbnailSave:(k,l,i,s,o)=>homeInvoke('thumbnailSave',k,l,i,s,o),useCover:i=>homeInvoke('useCover',i),
    prepare:(p,l,c)=>homeInvoke('prepare',p,l,c),shareSave:d=>homeInvoke('shareSave',d),shareDraft:()=>homeInvoke('shareDraft'),shareClear:d=>homeInvoke('shareClear',d),
    onShareDraft:f=>listen('shareDraft',f),prepareShareFrom:s=>homeInvoke('prepareShareFrom',s),
    authorSignIn:i=>homeInvoke('authorSignIn',i),authorRecovery:()=>homeInvoke('authorRecovery'),request:(r,m,j)=>homeInvoke('request',r,m,j),
    browse:(r,f,l)=>homeInvoke('browse',r,f,l),image:(r,v,f)=>homeInvoke('image',r,v,f),saveImage:(i,t)=>homeInvoke('saveImage',i,t),download:(id,l)=>homeInvoke('download',id,l),downloads:()=>homeInvoke('downloads'),downloadSave:k=>homeInvoke('downloadSave',k),
    renameLibraryItem:(k,t)=>homeInvoke('renameLibraryItem',k,t),removeLibraryItem:k=>homeInvoke('removeLibraryItem',k),
    libraryAddFile:()=>homeInvoke('libraryAddFile'),libraryAddLevels:(k,ids)=>homeInvoke('libraryAddLevels',k,ids),
    libraryAddScene:(p,l)=>homeInvoke('libraryAddScene',p,l),openLibraryItem:k=>homeInvoke('openLibraryItem',k),
    libraryPlay:k=>homeInvoke('libraryPlay',k),onLibraryPlayProgress:f=>listen('libraryPlayProgress',f),
    importPick:()=>homeInvoke('importPick'),importInto:(p,c,f)=>homeInvoke('importInto',p,c,f),publish:o=>homeInvoke('publish',o),
    sharePreview:(l,d)=>homeInvoke('sharePreview',l,d),publishedPreview:(w,v,l,h,source)=>homeInvoke('publishedPreview',w,v,l,h,source),
    publishedThumbnail:(w,v,l,i)=>homeInvoke('publishedThumbnail',w,v,l,i),
    shareImage:(l,i,d)=>homeInvoke('shareImage',l,i,d),replaceImage:(w,l,i,v,f)=>homeInvoke('replaceImage',w,l,i,v,f),
    onOpenScene:f=>listen('openScene',f),startScene:()=>homeInvoke('startScene')
  };
  contextBridge.exposeInMainWorld('workbenchHome',home);
  const tabs:ProjectTabsApi={
    state:()=>ipcRenderer.invoke('project-tabs:state'),
    action:(action,id,before,point)=>ipcRenderer.invoke('project-tabs:action',action,id,before,point),
    report:value=>ipcRenderer.send('project-tabs:report',value),
    onState:listener=>{
      const receive=(_event:unknown,value:ProjectTabState)=>listener(value);
      ipcRenderer.on('project-tabs:state',receive);
      return()=>{ipcRenderer.removeListener('project-tabs:state',receive);};
    }
  };
  contextBridge.exposeInMainWorld('projectTabs',tabs);
}
