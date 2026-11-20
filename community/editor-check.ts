import {app,BrowserWindow,WebContentsView} from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import '../src/main/main';

const output=process.env.SSTAR_COMMUNITY_QA!;
const address=process.env.SINKING_STAR_COMMUNITY_URL!;
const delay=(n:number)=>new Promise(resolve=>setTimeout(resolve,n));
async function until<T>(fn:()=>T|Promise<T>,label:string){
  for(let attempt=0;attempt<240;attempt++){
    try{const value=await fn();if(value)return value as NonNullable<T>;}catch{}
    await delay(150);
  }
  throw Error('等待超时：'+label);
}
async function capture(window:BrowserWindow,name:string){
  const image=await window.webContents.capturePage();
  if(!image.isEmpty())await fs.writeFile(path.join(output,name+'.png'),image.toPNG());
}

app.whenReady().then(async()=>{
  const window=await until(()=>BrowserWindow.getAllWindows()[0],'主窗口');
  const home=(code:string)=>window.webContents.executeJavaScript(code,true);
  await until(()=>home('Boolean(document.querySelector("#my-projects-title"))'),'我的工程');
  assert.deepEqual((await home('window.projectTabs.state()')).tabs,[]);
  const list=await until(async()=>{const rows=await home('window.workbenchHome.list()');return rows.length&&rows;},'读取离线工程目录');
  const source=list.find((row:{name:string})=>row.name==='首页与分享验收');
  assert.ok(source);
  console.log('从首页启动，工作区工程可在连接游戏前列出');
  await until(()=>home('Boolean(document.querySelector(".hub-row-toggle"))'),'项目行');
  await home('document.querySelector(".hub-row-toggle").click()');
  await until(()=>home('Boolean(document.querySelector(".hub-group-toggle"))'),'分组目录');
  await home('document.querySelector(".hub-group-toggle").click()');
  const scene=await until(()=>home('document.querySelector(".hub-level-item")?.textContent'),'展开关卡列表');
  await until(()=>home('Boolean(document.querySelector(".hub-level-item img"))'),'原生场景缩略图');
  await capture(window,'desktop-home');
  const levels=await home('window.workbenchHome.levels('+JSON.stringify(source.key)+')');
  await home('window.workbenchHome.open('+JSON.stringify(source.key)+','+JSON.stringify(levels[0].id)+')');
  const editor=await until(()=>window.contentView.children.find((child):child is WebContentsView=>child instanceof WebContentsView)?.webContents,'编辑器');
  const run=(code:string)=>editor.executeJavaScript(code,true);
  await until(()=>run('document.querySelector(".s-scene-breadcrumb")?.textContent'),'指定关卡打开');
  assert.ok(scene.includes(levels[0].title));
  const tabs=await home('window.projectTabs.state()');
  await home('window.projectTabs.action("home")');
  assert.deepEqual((await home('window.projectTabs.state()')).tabs.map((r:{id:string})=>r.id),tabs.tabs.map((r:{id:string})=>r.id));
  await home('window.projectTabs.action("activate",'+JSON.stringify(tabs.active)+')');
  console.log('实际场景生成缩略图，展开关卡并打开指定场景；返回首页保留编辑器');
  await until(()=>run(`Array.from(document.querySelectorAll('canvas')).some(canvas=>canvas.width>100&&canvas.getBoundingClientRect().height>100)&&!document.querySelector('.s-status-right')?.textContent.includes('处理中')`),'编辑器画布可见');

  const account={username:'qa_'+randomBytes(5).toString('hex'),password:randomBytes(16).toString('hex')};
  await home('window.workbenchHome.request("/api/account/signup","POST",'+JSON.stringify(account)+')');
  const names=['验收单关','验收工程'];
  for(let i=0;i<names.length;i++){
    await run('document.querySelector("[aria-label=\\\"导出关卡或工程\\\"]").click()');
    const title=i?'分享整个工程':'分享当前关';
    await until(()=>run('Array.from(document.querySelectorAll("button")).some(button=>button.textContent?.includes('+JSON.stringify(title)+'))'),'分享入口');
    await run('Array.from(document.querySelectorAll("button")).find(button=>button.textContent?.includes('+JSON.stringify(title)+')).click()');
    const draft=await until(()=>home('window.workbenchHome.shareDraft()'),'待发布包');
    assert.equal(draft.manifest.scope,i?'project':'level');
    assert.match(draft.cover??'',/^data:image\/webp;base64,/,JSON.stringify(await run(`({status:document.querySelector('.s-status')?.textContent,scene:document.querySelector('.s-scene-breadcrumb')?.textContent,canvases:Array.from(document.querySelectorAll('canvas')).map(canvas=>[canvas.width,canvas.height])})`)));
    assert.match(draft.manifest.editorVersion,/^0\.11\./);
    const published=await home('window.workbenchHome.publish('+JSON.stringify({title:names[i],version:'1.0',description:'浏览、下载与导入验收',images:true})+')');
    const found=await home('window.workbenchHome.request("/api/works?q="+encodeURIComponent('+JSON.stringify(names[i])+'))');
    assert.equal(found.works[0].id,published.id);
    assert.equal(found.works[0].cover,true,published.warning);
    const web=new BrowserWindow({width:1150,height:780,show:false,webPreferences:{contextIsolation:true,sandbox:true}});
    await web.loadURL(address+'/#work/'+published.id);
    await until(()=>web.webContents.executeJavaScript('Boolean(document.querySelector(".hub-work h2")&&document.querySelector(".hub-detail-cover img")?.naturalWidth)'),'网页版详情和实际封面');
    await capture(web,i?'web-project':'web-level');
    if(i===0){
      const practice=async (identity:{username:string;password:string},id:string)=>{
        const login=await fetch('/api/account/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(identity)});
        if(!login.ok)return false;
        const current=await (await fetch('/api/account/session')).json();
        if(current.username!==identity.username)return false;
        const bytes=await (await fetch('/api/works/'+id+'/download')).arrayBuffer();
        const response=await fetch('/api/works',{method:'POST',headers:{'content-type':'application/gzip','x-work-meta':btoa(JSON.stringify({title:'Web QA',description:'Web file flow',version:'1.0'}))},body:bytes});
        if(!response.ok)return false;
        return (await fetch('/api/works/'+(await response.json()).id,{method:'DELETE'})).ok;
      };
      const verified=await web.webContents.executeJavaScript('('+practice.toString()+')('+JSON.stringify(account)+','+JSON.stringify(published.id)+')');
      assert.equal(verified,true,'网页共用作者账号和分享包上传接口');
    }
    web.destroy();
    const download=await home('window.workbenchHome.download('+JSON.stringify(published.id)+')');
    if(i){
      assert.equal(download.kind,'project');
      const imported=download.project;
      assert.ok(imported.key!==source.key&&imported.count===draft.manifest.levels.length);
      const single=await home('window.workbenchHome.download('+JSON.stringify(published.id)+','+JSON.stringify(levels[0].id)+')');
      assert.equal(single.kind,'level');
      assert.equal(single.item.manifest.levels.length,1);
      await home('window.workbenchHome.openImported('+JSON.stringify(imported.key)+')');
      assert.equal((await home('window.projectTabs.state()')).tabs.length,2);
      await until(async()=>{
        const state=await home('window.projectTabs.state()');
        return state.tabs.some((tab:{id:string;title:string;busy:boolean})=>tab.id===state.active&&tab.title===imported.name&&!tab.busy);
      },'打开导入的工程');
      await home('window.projectTabs.action("activate",'+JSON.stringify(tabs.active)+')');
    }else{
      assert.equal(download.kind,'level');
      assert.equal(download.item.manifest.levels.length,1);
    }
    await home('window.workbenchHome.request("/api/works/'+published.id+'","DELETE")');
    console.log(i?'工程上架、网页详情、完整与逐关下载、导为独立可编辑工程':'单关上架、网页详情和下载导入通过');
  }
  await delay(800);
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
