import type {CameraView,NativeCameraView} from './shared';
export type CameraPanelSelection={kind:'camera'|'region';id:number}|null;
export const cameraPanelSections={rules:true,list:true,parameters:false,links:false,regions:false,screen:false,help:false};
export type CameraPanelSection=keyof typeof cameraPanelSections;
export interface CameraPanelState {open:typeof cameraPanelSections;selection:CameraPanelSelection;query:string;search:boolean;scroll:number}
export function cameraPanelState(value?:unknown):CameraPanelState{
 const v=value&&typeof value==='object'?value as Partial<CameraPanelState>:{};
 const open={...cameraPanelSections};for(const key of Object.keys(open)as CameraPanelSection[])if(typeof v.open?.[key]==='boolean')open[key]=v.open[key];
 const s=v.selection;return{open,selection:s&&['camera','region'].includes(s.kind)&&Number.isSafeInteger(s.id)&&s.id>0?{kind:s.kind,id:s.id}:null,query:typeof v.query==='string'?v.query.slice(0,200):'',search:v.search===true,scroll:typeof v.scroll==='number'&&Number.isFinite(v.scroll)?Math.max(0,Math.min(100000,v.scroll)):0};
}
export function cameraPanelSelection(view:CameraView|undefined,selection:CameraPanelSelection):CameraPanelSelection{
 if(selection&&(selection.kind==='camera'?view?.controls:view?.regions)?.some(c=>c.id===selection.id))return selection;
 const first=view?.controls.find(c=>c.primary&&!c.overview)??view?.controls[0];return first?{kind:'camera',id:first.id}:null;
}
export function cameraUsage(camera:NativeCameraView){return camera.overview?'地图总览':camera.primary?'正常游玩':'额外视角';}
export function cameraNumber(n:number){return Number.isFinite(n)?String(Number(n.toFixed(3))):'0';}
export function filterPanelCameras(cameras:NativeCameraView[],query:string){const q=query.trim().toLowerCase();return q?cameras.filter(c=>[c.name,c.id,cameraUsage(c)].join(' ').toLowerCase().includes(q)):cameras;}
