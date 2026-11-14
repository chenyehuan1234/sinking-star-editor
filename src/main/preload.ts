import { contextBridge, ipcRenderer } from 'electron';
import type { EditorApi } from '../shared';
const invoke=(method:string,...args:unknown[])=>ipcRenderer.invoke(`editor:${method}`,...args);
const api:EditorApi={
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
nativeCreate:(...args:any[])=>invoke('nativeCreate',...args),
nativeRegion:(...args:any[])=>invoke('nativeRegion',...args),
nativeBuild:(...args:any[])=>invoke('nativeBuild',...args),
nativeSave:(...args:any[])=>invoke('nativeSave',...args),
nativeLoad:(...args:any[])=>invoke('nativeLoad',...args),inspectCompatibility:()=>invoke('inspectCompatibility'),updateCheck:()=>invoke('updateCheck'),updateDownload:()=>invoke('updateDownload'),updateInstall:()=>invoke('updateInstall'),
 quickSlotsRead:()=>invoke('quickSlotsRead'),quickSlotsWrite:v=>invoke('quickSlotsWrite',v),
 cameraObject:(p,r)=>invoke('cameraObject',p,r),
 regionCapture:(p,s)=>invoke("regionCapture",p,s),regionPreview:b=>invoke("regionPreview",b),assemblyList:()=>invoke("assemblyList"),assemblySave:b=>invoke("assemblySave",b),assemblyRemove:id=>invoke("assemblyRemove",id),assemblyImport:()=>invoke("assemblyImport"),assemblyExport:b=>invoke("assemblyExport",b),recoveryWrite:w=>invoke("recoveryWrite",w),recoveryList:w=>invoke("recoveryList",w),recoveryRestore:(w,id)=>invoke("recoveryRestore",w,id),runValidate:(w,r)=>invoke("runValidate",w,r),runLaunch:(w,r)=>invoke("runLaunch",w,r),
  previewMesh:r=>invoke('previewMesh',r),worldStartup:()=>invoke('worldStartup'),levelCreateBlank:(w,h)=>invoke('levelCreateBlank',w,h),presetPreview:k=>invoke('presetPreview',k),thumbnailRead:k=>invoke('thumbnailRead',k),thumbnailWrite:(k,p)=>invoke('thumbnailWrite',k,p),
  worldRecreations:()=>invoke('worldRecreations'),
  objectCatalog:()=>invoke('objectCatalog'),worldPreview:w=>invoke('worldPreview',w),worldExample:()=>invoke('worldExample'),worldStudioExample:()=>invoke('worldStudioExample'),meshAsset:(n,l)=>invoke('meshAsset',n,l),textureAsset:(n,s)=>invoke('textureAsset',n,s),materialAsset:n=>invoke('materialAsset',n),assetStatus:()=>invoke('assetStatus'),
  worldCreate:()=>invoke('worldCreate'),worldValidate:w=>invoke('worldValidate',w),worldSave:(w,a)=>invoke('worldSave',w,a),worldLoad:()=>invoke('worldLoad'),worldImport:()=>invoke('worldImport'),worldPrefabs:()=>invoke('worldPrefabs'),worldBuild:w=>invoke('worldBuild',w),worldDeploy:(w,e)=>invoke('worldDeploy',w,e),worldLaunch:(w,e)=>invoke('worldLaunch',w,e),worldReset:w=>invoke('worldReset',w),
  discoverGames:()=>invoke('discoverGames'),chooseWorkspace:()=>invoke('chooseWorkspace'),preparationEstimate:()=>invoke('preparationEstimate'),
  connect:path=>invoke('connect',path),chooseGame:()=>invoke('chooseGame'),openLevel:n=>invoke('openLevel',n),previewUpdate:r=>invoke('previewUpdate',r),preview:p=>invoke('preview',p),
  save:p=>invoke('save',p),load:()=>invoke('load'),build:p=>invoke('build',p),prepare:()=>invoke('prepare'),deploy:p=>invoke('deploy',p),launch:()=>invoke('launch'),restore:()=>invoke('restore'),reveal:()=>invoke('reveal')
};contextBridge.exposeInMainWorld('editor',api);
