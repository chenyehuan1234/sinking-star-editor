import {contextBridge,ipcRenderer} from 'electron';
const invoke=(m:string,...a:unknown[])=>ipcRenderer.invoke('bench',m,...a);
contextBridge.exposeInMainWorld('editor',{meshAsset:(...a:unknown[])=>invoke('meshAsset',...a),previewMesh:(...a:unknown[])=>invoke('previewMesh',...a),materialAsset:(...a:unknown[])=>invoke('materialAsset',...a),textureAsset:(...a:unknown[])=>invoke('textureAsset',...a)});
contextBridge.exposeInMainWorld('bench',{native:()=>invoke('native'),finish:(result:unknown)=>invoke('finish',result)});
