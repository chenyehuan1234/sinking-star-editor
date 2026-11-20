import {app,BrowserWindow,dialog,WebContentsView,type WebContents} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {ProjectTabAction,ProjectTabState} from '../src/project-tabs';
import '../src/main/main';

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const qa=process.env.SINKING_STAR_TABS_QA!;
const checks:string[]=[];
const mark=(text:string)=>{checks.push(text);console.log(text);};
let openFile='',saveFile='',dismiss:0|1=0,questionCount=0,lastParent=0;
dialog.showOpenDialog=async (parent:unknown)=>{
  lastParent=parent instanceof BrowserWindow?parent.id:0;
  return {canceled:!openFile,filePaths:openFile?[openFile]:[]};
};
dialog.showSaveDialog=async (parent:unknown)=>{
  lastParent=parent instanceof BrowserWindow?parent.id:0;
  return {canceled:!saveFile,filePath:saveFile};
};
dialog.showMessageBox=async ()=>{
  questionCount++;
  return {response:dismiss,checkboxChecked:false};
};

async function until<T>(fn:()=>T|Promise<T>,description:string):Promise<NonNullable<T>>{
  for(let attempt=0;attempt<240;attempt++){
    try{
      const result=await fn();
      if(result)return result as NonNullable<T>;
    }catch{}
    await wait(125);
  }
  throw Error('等待超时 · '+description);
}
const evaluate=(contents:WebContents,code:string)=>contents.executeJavaScript(code,true);
const info=(host:BrowserWindow):Promise<ProjectTabState>=>evaluate(host.webContents,'window.projectTabs.state()');
const action=(host:BrowserWindow,command:ProjectTabAction,id?:string,before?:string,point?:Electron.Point)=>
  evaluate(host.webContents,'window.projectTabs.action(...'+JSON.stringify([command,id,before,point])+')');
const editors=(host:BrowserWindow)=>host.contentView.children
  .filter((view):view is WebContentsView=>view instanceof WebContentsView&&view.webContents!==host.webContents)
  .map(view=>view.webContents);
const ready=(contents:WebContents)=>evaluate(contents,'Boolean(document.querySelector(".s-project-menu")&&!document.querySelector(".s-status-right")?.textContent?.includes("处理中"))');

async function name(contents:WebContents,value:string){
  await evaluate(contents,'document.querySelector(".s-project-menu").click()');
  await until(()=>evaluate(contents,'Boolean(document.querySelector("[aria-label=项目名称]"))'),'工程名称输入');
  await evaluate(contents,`
    (()=>{const el=document.querySelector('[aria-label="项目名称"]');
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.blur();
    document.querySelector('.s-project-dialog [aria-label="关闭"]').click();})()`);
}

async function run(){
  const first=await until(()=>BrowserWindow.getAllWindows()[0],'主窗口');
  await until(()=>evaluate(first.webContents,'Boolean(document.querySelector("#my-projects-title"))'),'工程首页');
  assert.equal((await info(first)).tabs.length,0);
  await action(first,'new');
  const initial=await until(async()=>(await info(first)).tabs[0],'初始标签');
  const editor=await until(()=>editors(first)[0],'初始编辑器');
  await until(()=>ready(editor),'连接 Steam 游戏');
  await name(editor,'甲工程');
  await until(async()=>(await info(first)).tabs.some(tab=>tab.title==='甲工程'&&tab.dirty),'甲工程未保存');
  await action(first,'home');
  assert.equal((await info(first)).tabs[0].dirty,true);
  assert.equal((await info(first)).active,undefined);
  await action(first,'activate',initial.id);

  await action(first,'new');
  const second=await until(async()=>{const state=await info(first);return state.tabs.find(t=>t.id!==initial.id&&!t.busy);},'第二个工程');
  const other=editors(first).find(contents=>contents!==editor)!;
  await until(()=>ready(other),'第二个工程连接');
  await name(other,'乙工程');
  await until(async()=>(await info(first)).tabs.some(tab=>tab.title==='乙工程'&&tab.dirty),'乙工程未保存');
  mark('同一窗口拥有两个独立工程及未保存标记');

  const bounds=first.getContentBounds();
  await action(first,'begin-drag',second.id);
  await action(first,'end-drag',second.id,undefined,{x:bounds.x+200,y:bounds.y+160});
  const detached=await until(()=>BrowserWindow.getAllWindows().find(w=>w!==first),'独立窗口');
  await until(async()=>(await info(detached)).tabs.some(t=>t.id===second.id&&t.dirty),'拖出后的标签');
  assert.ok(editors(detached).includes(other));
  assert.equal((await info(first)).tabs.length,1);
  mark('分离时保留原画布进程和未保存工程');

  await evaluate(other,`window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,cancelable:true}))`);
  await until(async()=>(await info(detached)).tabs.find(t=>t.id===second.id)?.title!=='乙工程','分离后撤销');
  assert.equal((await info(first)).tabs[0].title,'甲工程');
  mark('分离后撤销仍可用，另一工程不受影响');

  saveFile=path.join(qa,'project-b.sstar-world.json');
  await evaluate(other,`window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',code:'KeyS',ctrlKey:true,cancelable:true}))`);
  await until(async()=>{try{await fs.access(saveFile);return true;}catch{return false;}},'保存独立窗口');
  const saved=JSON.parse(await fs.readFile(saveFile,'utf8'));
  assert.equal(lastParent,detached.id);
  openFile=saveFile;
  await action(first,'open');
  assert.equal((await info(first)).tabs.length,1);
  assert.equal((await info(detached)).tabs.length,1);
  mark('保存对话框归属当前窗口，重复打开会定位已有标签');

  const region={format:'sstar-region',version:1,sourceHash:saved.sourceHash,sourceBuild:saved.sourceBuild,name:'区域验证',sources:['mirror_1'],records:[],terrain:[[0,0,-1]],warnings:[]};
  const copy=(bundle:typeof region)=>evaluate(editor,'window.editor.regionClipboard('+JSON.stringify(bundle)+')');
  const paste=()=>evaluate(other,`window.dispatchEvent(new KeyboardEvent('keydown',{key:'v',code:'KeyV',ctrlKey:true,cancelable:true}))`);
  const status=(text:string)=>evaluate(other,`document.querySelector('.s-status')?.textContent.includes(${JSON.stringify(text)})`);
  await copy(region);
  await paste();
  await until(()=>status('放置区域'),'跨窗口粘贴进入预览');
  await evaluate(other,"window.dispatchEvent(new Event('sstar:cancel-gesture'));");
  await evaluate(other,"window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',cancelable:true}));");
  await copy({...region,sourceHash:'f'.repeat(64)});
  await paste();
  await until(()=>status('区域与目标工程的游戏来源不一致'),'目标标签读取更新后的剪贴板');
  await action(detached,'begin-drag',second.id);
  await action(first,'drop',second.id,initial.id);
  await until(async()=>(await info(first)).tabs[0]?.id===second.id,'拖回并排序');
  assert.ok(editors(first).includes(other));
  assert.equal(BrowserWindow.getAllWindows().length,1);
  mark('跨窗口共享区域剪贴板，标签可拖回并排序');

  await action(first,'close',initial.id);
  assert.equal(questionCount,1);
  assert.equal((await info(first)).tabs.length,2);
  dismiss=1;
  await action(first,'close',initial.id);
  assert.equal((await info(first)).tabs.length,1);
  mark('关闭未保存工程时可返回继续编辑');
}

void app.whenReady().then(run).then(async()=>{
  await fs.writeFile(path.join(qa,'results.json'),JSON.stringify({checks},null,2));
  app.exit(0);
}).catch(async error=>{
  await fs.writeFile(path.join(qa,'results.json'),JSON.stringify({checks,error:String(error),stack:error.stack},null,2));
  console.error(error);
  app.exit(1);
});
