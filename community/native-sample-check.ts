import {app,BrowserWindow,dialog,Menu,shell,WebContentsView} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {encodeShare} from '../src/core/share';
import {WorldCompiler} from '../src/core/world';
import {EditorService} from '../src/main/service';
import {fileImport} from '../src/main/level-import';
import type {DownloadedLevel,HomeProject} from '../src/home-types';
import type {SharedWork} from '../src/share-types';
import type {EditorProject} from '../src/shared';
import '../src/main/main';

const output=process.env.SSTAR_SAMPLE_QA!,sample=process.env.SSTAR_NATIVE_SAMPLE_DIR!,address=process.env.SINKING_STAR_COMMUNITY_URL!;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const sign=JSON.stringify;
const homeInput=(selector:string,value:string)=>`(()=>{const e=document.querySelector(${sign(selector)});if(!e)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${sign(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`;
async function until<T>(action:()=>T|Promise<T>,label:string){
  for(let n=0;n<230;n++){try{const value=await action();if(value)return value as NonNullable<T>;}catch{}await delay(140);}
  throw Error('等待超时 · '+label);
}
async function screenshot(window:BrowserWindow,file:string){
  const image=await window.webContents.capturePage();
  assert.ok(!image.isEmpty(),file);
  await fs.writeFile(path.join(output,file+'.png'),image.toPNG());
}
const importedName='跨工程导入验收关';
let savePath='';
const saveDialog=dialog.showSaveDialog;
dialog.showSaveDialog=(async(...args:unknown[])=>savePath?{canceled:false,filePath:savePath}:Reflect.apply(saveDialog,dialog,args)) as typeof dialog.showSaveDialog;
let newOptions:string[]=[];
const popup=Menu.prototype.popup;
Menu.prototype.popup=function(options){
  const headings=this.items.map(item=>item.label);
  if(headings.includes('新建单关')){newOptions=headings;return;}
  return popup.call(this,options);
};
const feedback:string[]=[];
shell.openExternal=async url=>{feedback.push(url);};
shell.trashItem=async file=>{
  const relative=path.relative(output,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('仅回收验收目录内的测试文件');
  const destination=path.join(output,'recycle');
  await fs.mkdir(destination,{recursive:true});
  await fs.rename(file,path.join(destination,path.basename(file)));
};

// Build the real selected levels without touching installed game files or playable saves.
const playable=new Set<string>();
let started='';
Object.assign(EditorService.prototype,{
  async assertStopped(){},
  async worldDeploy(this:EditorService,world:import('../src/shared').WorldProject){
    const compiled=new WorldCompiler(this.pkg,this.codec!).build(world);
    playable.clear();
    for(const name of Object.values(compiled.levelNames))playable.add(name);
    return '已构建验收关卡';
  },
  async startPlaytest(initialLevel:string){
    assert.ok(playable.has(initialLevel),'试玩直接进入已构建的小关');
    started=initialLevel;
    return '已验证本机关卡试玩入口';
  },
});

app.whenReady().then(async()=>{
  const {work,representatives}=JSON.parse(await fs.readFile(path.join(sample,'catalog.json'),'utf8')) as {work:SharedWork;representatives:string[]};
  const host=await until(()=>BrowserWindow.getAllWindows()[0],'桌面首页');
  const home=(script:string)=>host.webContents.executeJavaScript(script,true);
  const library=await until(async()=>{const rows=await home('window.workbenchHome.list()') as HomeProject[];return rows.find(row=>row.name==='原版三层世界 · 本机样本');},'原版三层世界');
  assert.equal(library.count,998);
  const catalog=await home('window.workbenchHome.catalog()');
  assert.equal(catalog.directories[library.key].groups.length,83);
  await until(()=>home('document.querySelector(".hub-row-toggle")?.textContent.includes("原版三层世界")'),'样本所在工程行');

  const thumb=async (id:string)=>{
    const item=await until(()=>home('window.workbenchHome.thumbnail('+sign(library.key)+','+sign(id)+')'),id+' 缩略图');
    assert.match(item.image,/^data:image\/webp;base64,/);
    await fs.writeFile(path.join(sample,'images',id+'.webp'),Buffer.from(item.image.split(',')[1],'base64'));
  };
  await thumb('world');
  for(const id of representatives){
    await home(homeInput('[aria-label="搜索工程、分组或关卡"]',id));
    await until(()=>home('Boolean(Array.from(document.querySelectorAll(".hub-level-open")).find(e=>e.textContent.trim()==='+sign(id)+'))'),id+' 的本地检索结果');
    await home('Array.from(document.querySelectorAll(".hub-level-open")).find(e=>e.textContent.trim()==='+sign(id)+').scrollIntoView({block:"nearest"})');
    await thumb(id);
  }
  const display=representatives.at(-2)!;
  await home(homeInput('[aria-label="搜索工程、分组或关卡"]',display));
  await until(()=>home('Boolean(document.querySelector(".hub-level-item img")?.naturalWidth)'),'桌面实拍缩略图');
  await screenshot(host,'desktop-original-world');
  console.log('原版真实目录与三个世界层的场景缩略图通过');

  const desktopNav='[aria-label="工作台导航"] button';
  const clickDesktop=(title:string)=>home('Array.from(document.querySelectorAll('+sign(desktopNav)+')).find(button=>button.textContent.trim()==='+sign(title)+').click()');
  await clickDesktop('关卡社区');
  await until(()=>home('document.querySelector("#community-title")?.textContent'),'桌面端内置社区');
  await until(()=>home('document.querySelector(".hub-project-row")?.textContent.includes("原版三层世界")'),'桌面端社区目录');
  await home('document.querySelector(".hub-project-row > button:last-child").click()');
  await until(()=>home('document.querySelector(".hub-detail-copy h2")?.textContent.includes("原版三层世界")'),'桌面端社区作品详情');
  assert.deepEqual(await home('Array.from(document.querySelectorAll('+sign(desktopNav)+'),button=>button.textContent.trim())'),['我的工程','关卡库','关卡社区']);
  await screenshot(host,'desktop-community-navigation');
  await clickDesktop('关卡库');
  await until(()=>home('document.querySelector("#level-library-title")?.textContent'),'从社区详情切回本机关卡库');
  await clickDesktop('我的工程');
  await until(()=>home('document.querySelector(".hub-row-toggle")?.textContent.includes("原版三层世界")'),'回到我的工程');

  const web=new BrowserWindow({width:1366,height:850,show:false,webPreferences:{contextIsolation:true,sandbox:true}});
  const runWeb=(script:string)=>web.webContents.executeJavaScript(script,true);
  await web.loadURL(address+'/');
  await until(()=>runWeb('Boolean(document.querySelector(".hub-project-row img")?.naturalWidth)'),'网页样本封面');
  await runWeb(homeInput('[aria-label="搜索社区作品"]',display));
  await until(()=>runWeb('Boolean(document.querySelector(".hub-group-levels .hub-remote-preview img")?.naturalWidth)'),'网页按小关搜索及实际预览');
  await runWeb('document.querySelector(".hub-group-levels .hub-remote-preview img").decode()');
  await delay(300);
  await screenshot(web,'community-original-world');
  await web.loadURL(address+'/#work/'+work.id);
  await until(()=>runWeb('document.querySelectorAll(".hub-group-toggle").length>=80'),'网页作品详情的实际分组');
  await screenshot(web,'community-original-directory');
  web.destroy();
  console.log('本机网页可按关卡搜索原版工程，并展开实际分组');

  const identity={username:'import_'+randomBytes(6).toString('hex'),password:randomBytes(18).toString('hex')};
  await home('window.workbenchHome.request("/api/account/signup","POST",'+sign(identity)+')');
  const stage:EditorProject={format:'sinking-star-project',version:3,sourceBuild:work.manifest.sourceBuild,sourceHash:work.manifest.sourceHash,template:'mirror_1',name:'mirror_1',operations:[]};
  const bundle=encodeShare(stage,'level','0.11.0-beta.2',[{id:'mirror_1',title:importedName}]);
  const login=await fetch(address+'/api/account/login',{method:'POST',headers:{'content-type':'application/json','x-sstar-desktop':'1'},body:sign(identity)});
  assert.equal(login.status,200);
  const token=(await login.json()).token;
  const metadata=Buffer.from(sign({title:importedName,description:'本机跨工程导入检查',version:'1'})).toString('base64');
  const sent=await fetch(address+'/api/works',{method:'POST',headers:{authorization:'Bearer '+token,'x-work-meta':metadata,'content-type':'application/gzip'},body:new Uint8Array(bundle.bytes)});
  assert.equal(sent.status,201);
  const id=(await sent.json()).id;
  try{
    const saved=await home('window.workbenchHome.download('+sign(id)+')');
    assert.equal(saved.kind,'level');
    assert.equal((await home('window.workbenchHome.download('+sign(id)+')')).item.key,saved.item.key);
    assert.equal((await home('window.workbenchHome.downloads()')).length,1);
    const sourceTabs=new BrowserWindow({width:1180,height:760,show:false,webPreferences:{contextIsolation:true,sandbox:true}});
    await sourceTabs.loadURL(address+'/');
    const webNav='[aria-label="社区导航"] button';
    await until(()=>sourceTabs.webContents.executeJavaScript('document.querySelectorAll('+sign(webNav)+').length===2'),'网页版左侧的工程与关卡库');
    await sourceTabs.webContents.executeJavaScript('Array.from(document.querySelectorAll('+sign(webNav)+')).find(button=>button.textContent==="社区关卡库").click()');
    await until(()=>sourceTabs.webContents.executeJavaScript('document.querySelector(".hub-projects")?.textContent.includes('+sign(importedName)+')'),'社区关卡库显示独立发布的小关');
    assert.equal(await sourceTabs.webContents.executeJavaScript('document.querySelector(".hub-projects")?.textContent.includes("Steam 原版目录")'),false);
    await screenshot(sourceTabs,'community-level-library');
    await sourceTabs.webContents.executeJavaScript('document.querySelector(".hub-project-row > button:last-child").click()');
    await until(()=>sourceTabs.webContents.executeJavaScript('document.querySelector(".hub-detail-copy h2")?.textContent.includes('+sign(importedName)+')'),'社区关卡详情');
    await sourceTabs.webContents.executeJavaScript('Array.from(document.querySelectorAll('+sign(webNav)+')).find(button=>button.textContent==="社区工程").click()');
    await until(()=>sourceTabs.webContents.executeJavaScript('document.querySelector(".hub-projects")?.textContent.includes("原版三层世界")'),'从社区关卡详情切回社区工程');
    sourceTabs.destroy();
    await fetch(address+'/api/works/'+id,{method:'DELETE',headers:{authorization:'Bearer '+token}});

    async function append(start:'native'|'custom'){
      if(start==='native')await home('window.workbenchHome.open('+sign(library.key)+','+sign(display)+')');
      else await home('window.projectTabs.action("new")');
      const editor=await until(()=>host.contentView.children.filter((v):v is WebContentsView=>v instanceof WebContentsView).at(-1)?.webContents,'编辑器视图');
      const edit=(script:string)=>editor.executeJavaScript(script,true);
      await until(()=>edit('Boolean(document.querySelector("[aria-label=\\"导入单关工程\\"]"))'),'导入按钮');
      await edit('document.querySelector("[aria-label=\\"导入单关工程\\"]").click()');
      await until(()=>edit('document.querySelector(".s-import-downloads button")?.textContent.includes('+sign(importedName)+')'),'已下载关卡');
      await edit('document.querySelector(".s-import-downloads button").click()');
      await edit('document.querySelector(".s-import-level-dialog .primary").click()');
      await until(()=>edit('document.querySelector(".s-scene-breadcrumb")?.textContent.includes('+sign(importedName)+')'),'追加到 '+start);
      const toast=await edit('document.querySelector(".s-status")?.textContent');
      assert.ok(toast.includes('可一步撤销'));
      if(start==='native'){
        await edit('document.querySelector("[aria-label^=\\"撤销\\"]").click()');
        await until(()=>edit('!document.querySelector(".s-scene-breadcrumb")?.textContent.includes('+sign(importedName)+')'),'撤销导入');
      }else{
        await edit('document.querySelector("[aria-label=\\"导出关卡或工程\\"]").click()');
        await until(()=>edit('Array.from(document.querySelectorAll("button")).some(button=>button.textContent.includes("加入本机关卡库"))'),'把自己做的关卡存到库中');
        await edit('Array.from(document.querySelectorAll("button")).find(button=>button.textContent.includes("加入本机关卡库")).click()');
        await until(()=>edit('document.querySelector(".s-status")?.textContent.includes("已加入本机关卡库")'),'保存本机关卡');
        savePath=path.join(output,'saved-custom.sstar-world.json');
        await edit('document.querySelector("[aria-label^=\\"保存\\"]").click()');
        await until(()=>fs.readFile(savePath,'utf8').then(text=>JSON.parse(text).levels.some((level:{title:string})=>level.title===importedName)),'保存导入关卡');
      }
    }
    await append('native');
    await append('custom');
    const local=await home('window.workbenchHome.downloads()');
    assert.deepEqual(new Set(local.map((row:{origin:string})=>row.origin)),new Set(['local','community']));
    const persisted=JSON.parse(await fs.readFile(savePath,'utf8'));
    const imported=persisted.levels.find((level:{title:string})=>level.title===importedName);
    const files=await home('window.workbenchHome.list()');
    const rebuilt=files.find((row:HomeProject)=>row.path===savePath);
    assert.ok(rebuilt);
    const status=await home('window.projectTabs.state()');
    await home('window.projectTabs.action("close",'+sign(status.active)+')');
    await home('window.workbenchHome.open('+sign(rebuilt.key)+','+sign(imported.id)+')');
    await until(()=>host.contentView.children.filter((view):view is WebContentsView=>view instanceof WebContentsView).at(-1)?.webContents.executeJavaScript('document.querySelector(".s-scene-breadcrumb")?.textContent.includes('+sign(importedName)+')'),'从磁盘重新打开导入关卡');
    await home('window.projectTabs.action("home")');
    await clickDesktop('关卡库');
    await until(()=>home('document.querySelectorAll(".hub-download-row").length===1'),'我的关卡');
    await until(()=>home('Boolean(document.querySelector(".hub-download-row img")?.naturalWidth)'),'我的关卡自动生成缩略图');
    await home('Array.from(document.querySelectorAll(".hub-segment button")).find(button=>button.textContent==="已下载").click()');
    await until(()=>home('document.querySelector(".hub-download-row")?.textContent.includes("版本 1")'),'已下载独立标签');
    await until(()=>home('Boolean(document.querySelector(".hub-download-row img")?.naturalWidth)'),'作品下架后已下载关卡仍能生成缩略图');
    const downloaded=(await home('window.workbenchHome.downloads()') as DownloadedLevel[]).find(item=>item.origin==='community')!;
    assert.match((await home('window.workbenchHome.thumbnail('+sign(downloaded.key)+',"primary","library")')).image,/^data:image\/webp;base64,/);
    await home('Array.from(document.querySelectorAll(".hub-download-row button")).find(button=>button.textContent.trim()==="试玩").click()');
    const outcome=await until(()=>home('document.querySelector(".hub-error")?.textContent || (document.querySelector("[role=status]")?.textContent.includes("已验证本机关卡试玩入口") && "已验证")'),'直接试玩单关');
    assert.equal(outcome,'已验证');
    assert.equal(started,'ed_'+downloaded.key.slice(0,12)+'_mirror_1');
    assert.equal((await home('window.projectTabs.state()')).active,undefined);
    await clickDesktop('我的工程');
    const original=await fs.readFile(library.path,'utf8');
    const choices=[display,representatives[0]];
    const projectButton=(label:string)=>home('Array.from(document.querySelectorAll(".hub-collect button, .hub-message button")).find(button=>button.textContent.trim()==='+sign(label)+').click()');
    await home(homeInput('[aria-label="搜索工程、分组或关卡"]',choices[0]));
    await until(()=>projectButton('选关加入关卡库').then(()=>true),'从保存的原版工程开始选关');
    for(const id of choices){
      await home(homeInput('[aria-label="搜索工程、分组或关卡"]',id));
      await until(()=>home('Boolean(Array.from(document.querySelectorAll(".hub-level-pick")).find(label=>label.textContent=== '+sign(id)+'))'),'展开关卡 '+id);
      await home('Array.from(document.querySelectorAll(".hub-level-pick")).find(label=>label.textContent=== '+sign(id)+').querySelector("input").click()');
    }
    await until(()=>home('document.querySelector(".hub-collect small")?.textContent.includes("已选 2 关")'),'跨分组和检索保留两关');
    await projectButton('加入关卡库');
    await until(()=>home('document.querySelector(".hub-levels [role=status]")?.textContent.includes("已收录 2 关")'),'完成选关入库');
    await projectButton('查看我的关卡');
    await until(()=>home('document.querySelectorAll(".hub-download-row").length===3'),'本地关卡是独立条目');
    const repeat=await home('window.workbenchHome.libraryAddLevels('+sign(library.key)+','+sign(choices)+')');
    assert.deepEqual(repeat,{saved:2,failed:[]});
    assert.equal((await home('window.workbenchHome.downloads()')).length,4);
    assert.equal(await fs.readFile(library.path,'utf8'),original);
    const savedCustom=await home('window.workbenchHome.libraryAddLevels('+sign(rebuilt.key)+','+sign([imported.id])+')');
    assert.deepEqual(savedCustom,{saved:1,failed:[]});
    await until(()=>home('Array.from(document.querySelectorAll(".hub-download-row img")).filter(img=>img.naturalWidth).length===3'),'入库的各关显示实际缩略图');
    await screenshot(host,'desktop-level-library');
    console.log('同一份已下架关卡可导入两类工程，原版样本可撤销，自制工程可保存重开');
    console.log('可从保存的原版和自制工程选关入库，跨分组勾选、重复添加及来源标签通过');
    console.log('我的关卡与已下载都显示缩略图，单关直接试玩构建并指向正确小关，未启动游戏');

    const activeEditor=()=>host.contentView.children.filter((view):view is WebContentsView=>view instanceof WebContentsView).at(-1)?.webContents;
    const singleEditor=async(title:string)=>{
      const expected='单关 › '+title;
      const editor=await until(async()=>{
        const contents=activeEditor();
        if(contents&&await contents.executeJavaScript('document.querySelector(".s-scene-breadcrumb")?.textContent.trim()=== '+sign(expected)))return contents;
      },expected);
      const hidden='[data-dock-tab="levels"], [aria-label="返回大地图"], [aria-label="试玩范围"]';
      assert.equal(await editor.executeJavaScript('Boolean(document.querySelector('+sign(hidden)+'))'),false);
      return editor;
    };
    await clickDesktop('我的工程');
    await home('Array.from(document.querySelectorAll(".hub-header button")).find(button=>button.textContent.trim()==="新建单关").click()');
    const blank=await singleEditor('新建单关');
    await until(()=>blank.executeJavaScript('Boolean(document.querySelector(".s-object-row079"))'),'空白关可编辑物件');
    await blank.executeJavaScript('document.querySelector(".s-project-menu").click()');
    const nameSelector='input[aria-label="关卡名称"]',nameInput='document.querySelector('+sign(nameSelector)+')';
    await until(()=>blank.executeJavaScript('Boolean('+nameInput+')'),'单关名称输入框');
    await blank.executeJavaScript(nameInput+'.focus()');
    const singleName='单关文件验收';
    await blank.executeJavaScript(homeInput(nameSelector,singleName));
    await blank.executeJavaScript(nameInput+'.blur()');
    await until(async()=>(await home('window.projectTabs.state()')).tabs.some((row:{title:string;dirty:boolean})=>row.title===singleName&&row.dirty),'单关标题可编辑');
    savePath=path.join(output,'standalone.sstar.json');
    await blank.executeJavaScript('document.querySelector('+sign('.s-project-dialog [aria-label="关闭"]')+').click()');
    await blank.executeJavaScript('document.querySelector('+sign('[aria-label^="保存"]')+').click()');
    const savedLevel=await until(()=>fs.readFile(savePath,'utf8').then(text=>JSON.parse(text)),'保存为独立单关文件');
    assert.equal(savedLevel.format,'sinking-star-project');
    assert.equal(savedLevel.title,singleName);
    assert.deepEqual(savedLevel.base,{kind:'blank',width:16,height:16});
    assert.ok(!('map' in savedLevel));
    assert.equal((await fileImport(savePath)).title,singleName);
    await until(async()=>(await home('window.projectTabs.state()')).tabs.some((row:{title:string;dirty:boolean})=>row.title===singleName&&!row.dirty),'保存完成');
    const singleTab=(await home('window.projectTabs.state()')).active;
    await home('window.projectTabs.action("close",'+sign(singleTab)+')');
    await home('window.projectTabs.action("home")');
    const standalone=(await home('window.workbenchHome.list()') as HomeProject[]).find(row=>row.path===savePath)!;
    assert.ok(standalone.singleLevel);
    await home('window.workbenchHome.open('+sign(standalone.key)+')');
    const reopened=await singleEditor(singleName);
    await until(()=>reopened.executeJavaScript('Boolean(document.querySelector(".s-object-row079"))'),'单关重开恢复画布');
    const singleImage=await reopened.capturePage().catch(()=>null);
    if(singleImage&&!singleImage.isEmpty())await fs.writeFile(path.join(output,'desktop-standalone-level.png'),singleImage.toPNG());
    await home('window.projectTabs.action("home")');
    await clickDesktop('关卡库');
    await home('Array.from(document.querySelectorAll(".hub-segment button")).find(button=>button.textContent==="已下载").click()');
    await until(()=>home('Boolean(Array.from(document.querySelectorAll(".hub-download-row button")).find(button=>button.textContent==="编辑单关"))'),'关卡库单关编辑入口');
    await home('Array.from(document.querySelectorAll(".hub-download-row button")).find(button=>button.textContent==="编辑单关").click()');
    const fromLibrary=await singleEditor(importedName);
    started='';
    await fromLibrary.executeJavaScript('document.querySelector(".s-play").click()');
    const launchOutcome=await until(()=>fromLibrary.executeJavaScript('document.querySelector(".s-status .s-error")?.textContent || (document.querySelector(".s-status")?.textContent.includes("已验证本机关卡试玩入口") && "已验证")'),'单关编辑模式试玩');
    assert.equal(launchOutcome,'已验证');
    assert.match(started,/^ed_[a-f0-9]{12}_mirror_1$/);
    console.log('新建单关、独立文件保存重开、关卡库编辑副本和单关试玩范围通过');

    await home('document.querySelector('+sign('[aria-label="新建工程或单关"]')+').click()');
    await until(()=>newOptions.length,'顶部加号提供两个创建命令');
    assert.deepEqual(newOptions,['新建工程','新建单关']);
    const clickLabel=(label:string)=>home('Array.from(document.querySelectorAll("button")).find(button=>button.getAttribute("aria-label")=== '+sign(label)+').click()');
    const libraryRow=(name:string)=>'Array.from(document.querySelectorAll(".hub-download-row strong")).some(title=>title.textContent.trim()=== '+sign(name)+')';
    await home('window.projectTabs.action("home")');
    await clickDesktop('关卡库');
    await until(()=>home('Boolean(document.querySelector(".hub-download-row .hub-cover-open"))'),'缩略图可点击');
    await home('document.querySelector(".hub-download-row .hub-cover-open").click()');
    await until(()=>home('Boolean(document.querySelector("dialog[open] .hub-large-preview")?.naturalWidth)'),'缩略图放大对话框');
    await clickLabel('关闭');
    const renamedDownload='关卡库重命名验收';
    await clickLabel('重命名 '+importedName);
    await until(()=>home('Boolean(document.querySelector("dialog[open] input"))'),'关卡库重命名输入');
    await home(homeInput('dialog[open] input',renamedDownload));
    await home('document.querySelector("dialog[open] form").requestSubmit()');
    await until(()=>home(libraryRow(renamedDownload)),'关卡库重命名生效');
    await clickLabel('删除 '+renamedDownload);
    await until(()=>home('Boolean(document.querySelector("dialog[open] form"))'),'回收关卡库本地副本');
    await home('document.querySelector("dialog[open] form").requestSubmit()');
    await until(()=>home('!('+libraryRow(renamedDownload)+')'),'关卡库条目移除');
    assert.equal((await home('window.workbenchHome.downloads()') as DownloadedLevel[]).some(item=>item.key===downloaded.key),false);
    await clickDesktop('我的工程');
    const tabs=(await home('window.projectTabs.state()')).tabs as {title:string;id:string}[];
    await home('window.projectTabs.action("close",'+sign(tabs.find(tab=>tab.title===singleName)!.id)+')');
    await home(homeInput('[aria-label="搜索工程、分组或关卡"]',singleName));
    await until(()=>home('Boolean(document.querySelector('+sign('[aria-label="重命名 '+singleName+'"]')+'))'),'单关文件管理');
    const renamedProject='单关重命名验收';
    await clickLabel('重命名 '+singleName);
    await until(()=>home('Boolean(document.querySelector("dialog[open] input"))'),'工程重命名输入');
    await home(homeInput('dialog[open] input',renamedProject));
    await home('document.querySelector("dialog[open] form").requestSubmit()');
    await until(async()=>JSON.parse(await fs.readFile(savePath,'utf8')).title===renamedProject,'工程标题写入原文件');
    await home(homeInput('[aria-label="搜索工程、分组或关卡"]',renamedProject));
    await until(()=>home('Boolean(document.querySelector('+sign('[aria-label="删除 '+renamedProject+'"]')+'))'),'工程删除入口');
    await clickLabel('删除 '+renamedProject);
    await until(()=>home('Boolean(document.querySelector("dialog[open] form"))'),'确认工程删除');
    await home('document.querySelector("dialog[open] form").requestSubmit()');
    await until(()=>fs.stat(path.join(output,'recycle','standalone.sstar.json')).then(()=>true),'工程文件可恢复地移到回收站');
    await home('Array.from(document.querySelectorAll(".hub-nav-footer button")).find(button=>button.textContent.trim()==="报告问题").click()');
    await until(()=>feedback.length===1,'问题反馈链接');
    await home('Array.from(document.querySelectorAll(".hub-nav-footer button")).find(button=>button.textContent.trim()==="功能建议").click()');
    await until(()=>feedback.length===2,'功能建议链接');
    assert.deepEqual(feedback.map(url=>new URL(url).searchParams.get('labels')),['bug','enhancement']);
    console.log('顶部新建菜单、缩略图放大、工程与关卡库重命名和回收、GitHub 反馈入口通过');
  }finally{
    await fetch(address+'/api/works/'+id,{method:'DELETE',headers:{authorization:'Bearer '+token}}).catch(()=>{});
  }
  await delay(700);app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
