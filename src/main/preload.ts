import { contextBridge, ipcRenderer } from 'electron';
import type { EditorApi } from '../shared';
const invoke=(method:string,...args:unknown[])=>ipcRenderer.invoke(`editor:${method}`,...args);
const api:EditorApi={
 cameraObject:(p,r)=>invoke('cameraObject',p,r),
 regionCapture:(p,s)=>invoke("regionCapture",p,s),regionPreview:b=>invoke("regionPreview",b),assemblyList:()=>invoke("assemblyList"),assemblySave:b=>invoke("assemblySave",b),assemblyRemove:id=>invoke("assemblyRemove",id),assemblyImport:()=>invoke("assemblyImport"),assemblyExport:b=>invoke("assemblyExport",b),recoveryWrite:w=>invoke("recoveryWrite",w),recoveryList:w=>invoke("recoveryList",w),recoveryRestore:(w,id)=>invoke("recoveryRestore",w,id),runValidate:(w,r)=>invoke("runValidate",w,r),runLaunch:(w,r)=>invoke("runLaunch",w,r),
  previewMesh:r=>invoke('previewMesh',r),worldStartup:()=>invoke('worldStartup'),levelCreateBlank:(w,h)=>invoke('levelCreateBlank',w,h),presetPreview:k=>invoke('presetPreview',k),thumbnailRead:k=>invoke('thumbnailRead',k),thumbnailWrite:(k,p)=>invoke('thumbnailWrite',k,p),
  worldRecreations:()=>invoke('worldRecreations'),
  objectCatalog:()=>invoke('objectCatalog'),worldPreview:w=>invoke('worldPreview',w),worldExample:()=>invoke('worldExample'),worldStudioExample:()=>invoke('worldStudioExample'),meshAsset:(n,l)=>invoke('meshAsset',n,l),textureAsset:(n,s)=>invoke('textureAsset',n,s),materialAsset:n=>invoke('materialAsset',n),assetStatus:()=>invoke('assetStatus'),
  worldCreate:()=>invoke('worldCreate'),worldValidate:w=>invoke('worldValidate',w),worldSave:(w,a)=>invoke('worldSave',w,a),worldLoad:()=>invoke('worldLoad'),worldImport:()=>invoke('worldImport'),worldPrefabs:()=>invoke('worldPrefabs'),worldBuild:w=>invoke('worldBuild',w),worldDeploy:(w,e)=>invoke('worldDeploy',w,e),worldLaunch:(w,e)=>invoke('worldLaunch',w,e),worldReset:w=>invoke('worldReset',w),
  discoverGames:()=>invoke('discoverGames'),chooseWorkspace:()=>invoke('chooseWorkspace'),preparationEstimate:()=>invoke('preparationEstimate'),
  connect:path=>invoke('connect',path),chooseGame:()=>invoke('chooseGame'),openLevel:n=>invoke('openLevel',n),preview:p=>invoke('preview',p),
  save:p=>invoke('save',p),load:()=>invoke('load'),build:p=>invoke('build',p),prepare:()=>invoke('prepare'),deploy:p=>invoke('deploy',p),launch:()=>invoke('launch'),restore:()=>invoke('restore'),reveal:()=>invoke('reveal')
};contextBridge.exposeInMainWorld('editor',api);
