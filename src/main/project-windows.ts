import {BrowserWindow,dialog,ipcMain,Menu,screen,WebContentsView,type WebContents,type IpcMainInvokeEvent} from 'electron';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {ProjectStart,ProjectTabAction,ProjectTabLabel,ProjectTabState} from '../project-tabs';
import type {EditorProject} from '../shared';

const stripHeight=36;
const defaultTitle='沉星之序 · 关卡工作台';
const webPreferences=(preload:string)=>({
  preload,contextIsolation:true,nodeIntegration:false,sandbox:true,
  additionalArguments:['--sstar-project-tabs']
});

interface ProjectWindow {
  window:BrowserWindow;
  tabs:ProjectTab[];
  active?:ProjectTab;
  closing:boolean;
  forceClose:boolean;
}

export interface ProjectTab extends ProjectTabLabel {
  view:WebContentsView;
  owner:ProjectWindow;
  start:ProjectStart;
  file?:string;
  startScene?:string;
  singleLevel?:boolean;
  levelDraft?:EditorProject;
}

export class ProjectWindows {
  private windows=new Set<ProjectWindow>();
  private editors=new Map<number,ProjectTab>();
  private recent?:ProjectWindow;
  private drag?:ProjectTab;

  constructor(private html:string,private preload:string,private directory:()=>string,private onClose:(tab:ProjectTab)=>void){
    ipcMain.handle('project-tabs:state',event=>{
      const host=this.sender(event);
      return this.state(host);
    });
    ipcMain.handle('project-tabs:action',(event,action:ProjectTabAction,id?:string,before?:string,point?:Electron.Point)=>
      this.action(this.sender(event),event.sender,action,id,before,point));
    ipcMain.on('project-tabs:report',(event,status)=>{
      const tab=this.editor(event.sender);
      if(!tab||event.senderFrame!==event.sender.mainFrame||!status||typeof status.title!=='string')return;
      const title=status.title.trim().slice(0,100)||'未命名工程';
      const dirty=status.dirty===true,busy=status.busy===true;
      if(tab.title===title&&tab.dirty===dirty&&tab.busy===busy)return;
      Object.assign(tab,{title,dirty,busy});
      this.publish(tab.owner);
    });
  }

  get size(){return this.editors.size;}
  get hasDirtyProjects(){return [...this.editors.values()].some(tab=>tab.dirty);}
  editor(contents:WebContents){return this.editors.get(contents.id);}
  isOpen(file:string){
    return [...this.editors.values()].some(tab=>tab.file&&this.pathKey(tab.file)===this.pathKey(file));
  }

  focusRecent(){
    const host=this.recent??this.windows.values().next().value;
    host?.window.show();
    host?.window.focus();
    host?.active?.view.webContents.focus();
  }

  broadcast(channel:string,...args:unknown[]){
    for(const tab of this.editors.values())if(!tab.view.webContents.isDestroyed())tab.view.webContents.send(channel,...args);
  }

  clipboardChanged(source:ProjectTab){
    for(const tab of this.editors.values()){
      if(tab!==source&&!tab.view.webContents.isDestroyed())tab.view.webContents.send('editor:region-clipboard-changed');
    }
  }

  async fileAvailable(tab:ProjectTab,file:string){
    const canonical=await fs.realpath(file).catch(()=>path.resolve(file));
    if([...this.editors.values()].some(other=>other!==tab&&other.file&&this.pathKey(other.file)===this.pathKey(canonical)))throw Error('这个工程已经在另一个标签页打开');
    return canonical;
  }

  recordFile(tab:ProjectTab,file?:string){tab.file=file;}

  start(width:number,height:number,resume=false){
    const host=this.createWindow({width,height});
    if(resume)this.createTab(host,'resume');
  }

  homeOwner(event:IpcMainInvokeEvent){
    const host=this.sender(event);
    if(event.sender!==host.window.webContents)throw Error('请从首页执行此操作');
    return host;
  }

  private pathKey(file:string){const resolved=path.resolve(file);return process.platform==='win32'?resolved.toLowerCase():resolved;}

  private sender(event:IpcMainInvokeEvent){
    if(event.senderFrame!==event.sender.mainFrame)throw Error('无效的工程标签来源');
    const host=this.editor(event.sender)?.owner??[...this.windows].find(w=>w.window.webContents===event.sender);
    if(!host||host.window.isDestroyed())throw Error('工程窗口已关闭');
    return host;
  }

  private state(host:ProjectWindow):ProjectTabState{
    return {active:host.active?.id,tabs:host.tabs.map(({id,title,dirty,busy})=>({id,title,dirty,busy}))};
  }

  private publish(host:ProjectWindow){
    if(host.window.isDestroyed())return;
    host.window.setTitle(host.active?host.active.title+' · '+defaultTitle:defaultTitle);
    host.window.webContents.send('project-tabs:state',this.state(host));
  }

  private secure(contents:WebContents){
    contents.setWindowOpenHandler(()=>({action:'deny'}));
    contents.on('will-navigate',event=>event.preventDefault());
    contents.on('before-input-event',(event,input)=>{
      if(input.type!=='keyDown'||input.isAutoRepeat)return;
      if(input.key==='Escape'&&this.drag){this.drag=undefined;return;}
      const host=this.editor(contents)?.owner??[...this.windows].find(w=>w.window.webContents===contents);
      if(!host||host.closing||!input.control||input.alt||input.meta)return;
      if(input.key==='Tab'&&host.tabs.length>1){
        event.preventDefault();
        const index=host.active?host.tabs.indexOf(host.active):0;
        this.activate(host.tabs[(index+(input.shift?-1:1)+host.tabs.length)%host.tabs.length]);
      }
    });
  }

  private createWindow(bounds:{width:number;height:number;x?:number;y?:number}){
    const window=new BrowserWindow({
      ...bounds,show:false,minWidth:1050,minHeight:720,title:defaultTitle,
      backgroundColor:'#101619',autoHideMenuBar:true,
      webPreferences:webPreferences(this.preload)
    });
    const host:ProjectWindow={window,tabs:[],closing:false,forceClose:false};
    this.windows.add(host);
    this.recent=host;
    this.secure(window.webContents);
    window.removeMenu();
    window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    window.on('focus',()=>{this.recent=host;});
    window.on('resize',()=>this.layout(host));
    window.on('close',event=>{
      if(host.forceClose)return;
      event.preventDefault();
      if(!host.closing)void this.closeWindow(host);
    });
    window.on('closed',()=>{
      for(const tab of [...host.tabs])this.dispose(tab);
      this.windows.delete(host);
      if(this.recent===host)this.recent=this.windows.values().next().value;
    });
    void window.loadFile(this.html,{query:{view:'project-tabs'}}).then(()=>{
      if(window.isDestroyed())return;
      window.show();
      this.publish(host);
      host.active?.view.webContents.focus();
    }).catch(error=>{if(!window.isDestroyed())dialog.showErrorBox('工作台启动失败',String(error));});
    return host;
  }

  private createTab(host:ProjectWindow,start:ProjectStart,file?:string,startScene?:string,levelDraft?:EditorProject){
    const view=new WebContentsView({webPreferences:webPreferences(this.preload)}),contents=view.webContents;
    const tab:ProjectTab={
      id:randomUUID(),title:file?path.basename(file).replace(/(?:\.sstar(?:(?:-native)?-world)?)?\.json$/i,''):
        levelDraft?.title??(start==='blank-level'?'新建单关':start==='native'?'原版三层世界':start==='blank'?'新建工程':'正在打开工程'),
      dirty:false,busy:false,view,owner:host,start,file,startScene,levelDraft
    };
    this.secure(contents);
    this.editors.set(contents.id,tab);
    host.tabs.push(tab);
    host.window.contentView.addChildView(view);
    this.activate(tab);
    void contents.loadFile(this.html).catch(error=>{
      if(contents.isDestroyed()||host.window.isDestroyed())return;
      tab.title='工程加载失败';
      tab.busy=false;
      this.publish(tab.owner);
      dialog.showErrorBox('工程加载失败',String(error));
    });
    return tab;
  }

  private layout(host:ProjectWindow){
    if(host.window.isDestroyed())return;
    const {width,height}=host.window.getContentBounds();
    for(const tab of host.tabs){
      if(tab.view.webContents.isDestroyed())continue;
      const active=host.active===tab;
      if(active)tab.view.setBounds({x:0,y:stripHeight,width,height:Math.max(0,height-stripHeight)});
      tab.view.setVisible(active);
    }
  }

  private activate(tab:ProjectTab){
    const host=tab.owner;
    host.active=tab;
    this.layout(host);
    host.window.show();
    host.window.focus();
    if(!tab.view.webContents.isDestroyed())tab.view.webContents.focus();
    this.publish(host);
  }

  private remove(tab:ProjectTab){
    const host=tab.owner,index=host.tabs.indexOf(tab);
    host.tabs.splice(index,1);
    if(!host.window.isDestroyed())host.window.contentView.removeChildView(tab.view);
    if(host.active===tab)host.active=host.tabs[Math.min(index,host.tabs.length-1)];
    this.layout(host);
    this.publish(host);
  }

  private dispose(tab:ProjectTab){
    this.remove(tab);
    this.editors.delete(tab.view.webContents.id);
    this.onClose(tab);
    if(!tab.view.webContents.isDestroyed())tab.view.webContents.close({waitForBeforeUnload:false});
  }

  private async mayClose(tab:ProjectTab){
    const parent=tab.owner.window;
    if(tab.busy){
      await dialog.showMessageBox(parent,{type:'info',message:'工程正在处理',detail:'等当前操作完成后即可关闭标签。'});
      return false;
    }
    if(!tab.dirty)return true;
    const reply=await dialog.showMessageBox(parent,{
      type:'question',message:'「'+tab.title+'」有未保存的修改',
      detail:'返回工程保存，或放弃本次修改并关闭。',
      buttons:['返回工程','放弃并关闭'],defaultId:0,cancelId:0
    });
    return reply.response===1;
  }

  private async closeWindow(host:ProjectWindow){
    host.closing=true;
    try{
      for(const tab of host.tabs)if(!await this.mayClose(tab)){this.activate(tab);return;}
      host.forceClose=true;
      host.window.close();
    }finally{host.closing=false;}
  }

  private async openFile(host:ProjectWindow){
    const result=await dialog.showOpenDialog(host.window,{
      defaultPath:this.directory(),filters:[{name:'工程或单关',extensions:['json']}],properties:['openFile']
    });
    if(result.canceled||host.window.isDestroyed())return;
    await this.openPath(host,result.filePaths[0]);
  }

  async openPath(host:ProjectWindow,file:string,scene?:string){
    file=await fs.realpath(file);
    if(host.window.isDestroyed()||host.closing)return;
    const existing=[...this.editors.values()].find(tab=>tab.file&&this.pathKey(tab.file)===this.pathKey(file));
    if(existing){this.activate(existing);if(scene){existing.startScene=scene;existing.view.webContents.send('home:openScene',scene);}return;}
    this.createTab(host,'file',file,scene);
  }

  openLevelDraft(host:ProjectWindow,level:EditorProject){
    if(host.window.isDestroyed()||host.closing)return;
    this.createTab(host,'level-draft',undefined,undefined,level);
  }

  showHome(host:ProjectWindow){
    host.active=undefined;
    this.layout(host);
    this.publish(host);
    host.window.focus();
    host.window.webContents.focus();
  }

  private move(tab:ProjectTab,destination:ProjectWindow,before?:string){
    const previous=tab.owner;
    if(previous.closing||destination.closing||destination.window.isDestroyed())return;
    if(previous===destination){
      if(before===tab.id)return;
      previous.tabs.splice(previous.tabs.indexOf(tab),1);
    }else{
      this.remove(tab);
      tab.owner=destination;
      destination.window.contentView.addChildView(tab.view);
      if(!previous.tabs.length){
        previous.forceClose=true;
        previous.window.close();
      }
    }
    const index=destination.tabs.findIndex(next=>next.id===before);
    destination.tabs.splice(index>=0?index:destination.tabs.length,0,tab);
    this.activate(tab);
  }

  private detach(tab:ProjectTab,pointer=screen.getCursorScreenPoint()){
    if(tab.owner.closing||!tab.owner.tabs.includes(tab))return;
    const area=screen.getDisplayNearestPoint(pointer).workArea;
    const old=tab.owner.window.getBounds();
    const width=Math.max(1050,Math.min(old.width,area.width)),height=Math.max(720,Math.min(old.height,area.height));
    const x=Math.max(area.x,Math.min(pointer.x-120,area.x+area.width-width));
    const y=Math.max(area.y,Math.min(pointer.y-45,area.y+area.height-height));
    this.move(tab,this.createWindow({width,height,x,y}));
  }

  private async action(host:ProjectWindow,sender:WebContents,action:ProjectTabAction,id?:string,before?:string,point?:Electron.Point){
    if(host.closing)return;
    if(action==='home'){this.showHome(host);return;}
    if(action==='new'){this.createTab(host,'blank');return;}
    if(action==='new-level'){this.createTab(host,'blank-level');return;}
    if(action==='new-menu'){
      Menu.buildFromTemplate([
        {label:'新建工程',click:()=>this.createTab(host,'blank')},
        {label:'新建单关',click:()=>this.createTab(host,'blank-level')}
      ]).popup({window:host.window});
      return;
    }
    if(action==='open'){await this.openFile(host);return;}
    if(action==='native'||action==='studio'||action==='showcase'||action==='recreations'){this.createTab(host,action);return;}
    if(sender!==host.window.webContents)throw Error('请在工程标签栏操作');
    if(action==='cancel-drag'){this.drag=undefined;return;}
    if(action==='drop'){
      const drag=this.drag;
      if(!drag||drag.id!==id)return;
      this.drag=undefined;
      this.move(drag,host,before);
      return;
    }
    const tab=host.tabs.find(tab=>tab.id===id);
    if(!tab)return;
    switch(action){
      case 'activate':this.activate(tab);break;
      case 'detach':this.detach(tab);break;
      case 'close':
        if(await this.mayClose(tab)&&tab.owner===host&&host.tabs.includes(tab)){
          this.dispose(tab);
          if(host.active)this.activate(host.active);
        }
        break;
      case 'menu':
        Menu.buildFromTemplate([
          {label:'移到新窗口',click:()=>this.detach(tab)},
          ...[...this.windows].filter(window=>window!==host).map(destination=>({
            label:'移到「'+(destination.active?.title??'空窗口')+'」窗口',
            click:()=>this.move(tab,destination)
          })),
          {type:'separator'},
          {label:'关闭工程',click:()=>{void this.action(host,sender,'close',id);}}
        ]).popup({window:host.window});
        break;
      case 'begin-drag':
        this.drag=tab;
        break;
      case 'end-drag':{
        if(this.drag!==tab)break;
        this.drag=undefined;
        const p=point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&(point.x!==0||point.y!==0)?point:screen.getCursorScreenPoint();
        const inside=[...this.windows].some(host=>{
          const b=host.window.getBounds();
          return p.x>=b.x&&p.x<b.x+b.width&&p.y>=b.y&&p.y<b.y+b.height;
        });
        const source=tab.owner.window.getContentBounds();
        const belowStrip=p.x>=source.x&&p.x<source.x+source.width&&p.y>=source.y+stripHeight+56&&p.y<source.y+source.height;
        if(!inside||belowStrip)this.detach(tab,p);
        break;
      }
    }
  }
}
