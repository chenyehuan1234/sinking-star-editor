export type ProjectStart='resume'|'blank'|'file'|'native'|'studio'|'showcase'|'recreations';
export type ProjectTabAction='new'|'open'|'native'|'studio'|'showcase'|'recreations'|'activate'|'close'|'detach'|'menu'|'begin-drag'|'drop'|'end-drag'|'cancel-drag';

export interface ProjectTabLabel {
  id:string;
  title:string;
  dirty:boolean;
  busy:boolean;
}

export interface ProjectTabState {
  active?:string;
  tabs:ProjectTabLabel[];
}

export interface ProjectTabsApi {
  state():Promise<ProjectTabState>;
  onState(listener:(state:ProjectTabState)=>void):()=>void;
  action(action:ProjectTabAction,id?:string,before?:string,point?:{x:number;y:number}):Promise<void>;
  report(status:{title:string;dirty:boolean;busy:boolean}):void;
}

declare global {interface Window {projectTabs?:ProjectTabsApi}}
