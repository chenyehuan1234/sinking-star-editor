import {app,BrowserWindow,session,WebContentsView} from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {version as editorVersion} from '../package.json';
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
  const home=async(code:string)=>{
    const answer=await window.webContents.executeJavaScript(`(async()=>{try{return {value:await (${code})};}catch(error){return {error:String(error)};}})()`,true);
    if(answer.error)throw Error(answer.error+' while running '+code);
    return answer.value;
  };
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
  const clickHome=async(label:string,selector='button')=>{
    const button=`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(button=>!button.disabled&&(button.getAttribute('aria-label')??button.textContent.trim())===${JSON.stringify(label)})`;
    await until(()=>home(`Boolean(${button})`),label);
    await home(`${button}.click()`);
  };
  const network=session.defaultSession.webRequest;
  const communityButtons='.hub-main:not([hidden]) button';
  function stall(method:string,matches:(pathname:string)=>boolean){
    let start=0;
    let cancelled:(()=>void)|undefined;
    network.onBeforeRequest({urls:[address+'/api/*']},(request,done)=>{
      if(request.method!==method||!matches(new URL(request.url).pathname)){done({});return;}
      start=Date.now();
      cancelled=()=>done({cancel:true});
    });
    return {started:()=>start,stop:()=>{cancelled?.();network.onBeforeRequest(null);}};
  }
  await home(`Array.from(document.querySelectorAll('.hub-level-item .hub-publish')).find(button=>button.getAttribute('aria-label')===${JSON.stringify('发布 '+levels[0].title)}).click()`);
  await until(()=>home('Boolean(document.querySelector("#community-title"))'),'从工程逐关发布');
  assert.equal((await home('window.workbenchHome.shareDraft()')).manifest.scope,'level');
  assert.equal(await home('document.querySelector("[aria-label=\\"社区地址\\"]")===null'),true);
  const username='device_'+randomBytes(5).toString('hex');
  await clickHome('登录');
  await home(`(() => {
    const dialog=document.querySelector('dialog[aria-label="作者登录"]');
    if(dialog.querySelector('input[type="password"]'))throw Error('首次登录只应要求用户名');
    dialog.querySelector('input[name="username"]').value=${JSON.stringify(username)};
    dialog.querySelector('form').requestSubmit();
  })()`);
  await until(()=>home(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(username)})`),'用户名登录');
  assert.ok(await home(`Array.from(document.querySelectorAll('.hub-image-choice input[type="checkbox"]')).every(input=>input.getBoundingClientRect().width<=18&&input.getBoundingClientRect().height<=18)`));
  assert.ok(await home(`(() => { const tray=document.querySelector('.hub-image-tray');return !tray||tray.scrollWidth<=tray.clientWidth; })()`));
  await capture(window,'desktop-publish-preview');
  const pendingPublish=stall('POST',pathname=>pathname==='/api/works');
  await clickHome('确认发布');
  const publishStarted=await until(pendingPublish.started,'发布请求开始传输');
  await clickHome('我的工程','.hub-nav button');
  assert.ok(await home('Boolean(document.querySelector("#my-projects-title"))'));
  await clickHome('关卡库','.hub-nav button');
  await clickHome('关卡社区','.hub-nav button');
  assert.equal(await home('document.querySelector("[aria-label=刷新社区]").disabled'),false);
  await until(()=>home('document.querySelector("[aria-label=发布作品] [role=alert]")?.textContent.includes("超时")'),'发布超时后保留草稿');
  assert.ok(Date.now()-publishStarted<12_500,'发布应在约 10 秒超时');
  assert.ok(await home('window.workbenchHome.shareDraft()'));
  pendingPublish.stop();
  console.log('发布卡住时可切换工程、关卡库和社区，约十秒超时并保留草稿');
  await clickHome('确认发布');
  await until(()=>home('Boolean(document.querySelector(".hub-work h2"))'),'在桌面端发布并进入作品详情');
  assert.equal(await home('document.querySelector(".hub-work h2").textContent'),levels[0].title);
  await until(()=>home('Boolean(document.querySelector(".hub-detail-cover img")?.naturalWidth)'),'无自定义封面时使用场景缩略图');
  let reads=0;
  const directoryButtons='[aria-label="社区浏览类型"] button';
  network.onBeforeRequest({urls:[address+'/api/*']},(request,done)=>{
    if(request.method==='GET'&&new URL(request.url).pathname.startsWith('/api/works'))reads++;
    done({});
  });
  const catalogReady=()=>home('Boolean(document.querySelector(".hub-main:not([hidden]) .hub-projects"))&&!document.querySelector(".hub-main:not([hidden])")?.textContent.includes("正在读取作品…")');
  await clickHome('‹ 返回作品列表');
  await until(catalogReady,'单关目录首次加载');
  await until(()=>home('Boolean(document.querySelector(".hub-projects .hub-remote-preview img")?.naturalWidth)'),'单关目录封面首次加载');
  await clickHome('工程',directoryButtons);
  await until(catalogReady,'工程目录首次加载');
  await delay(350);
  const warmReads=reads;
  await home(`(() => {
    window.communityCacheFlash=false;
    window.communityCacheObserver=new MutationObserver(()=>{
      if(document.body.textContent.includes('正在读取作品…')||document.body.textContent.includes('正在加载作品…'))window.communityCacheFlash=true;
    });
    window.communityCacheObserver.observe(document.body,{childList:true,subtree:true,characterData:true});
  })()`);
  await clickHome('单关',directoryButtons);
  await clickHome('查看详情');
  await until(()=>home('Boolean(document.querySelector(".hub-detail-cover img")?.naturalWidth)'),'重新打开作品详情');
  await clickHome('‹ 返回作品列表');
  await clickHome('工程',directoryButtons);
  await delay(250);
  assert.equal(reads,warmReads,'切回已浏览的目录、详情和缩略图没有发出新请求');
  assert.equal(await home('window.communityCacheFlash'),false);
  await home('window.communityCacheObserver.disconnect()');
  await clickHome('刷新社区');
  await until(()=>reads===warmReads+1,'手动刷新向服务器发出一次目录请求');
  network.onBeforeRequest(null);
  await clickHome('单关',directoryButtons);
  console.log('社区缓存验收：往返目录与详情新增 0 个请求，无加载闪烁，手动刷新发出 1 个请求');
  await clickHome('我的发布','.hub-nav button');
  assert.equal(await home('document.querySelector("#community-title").textContent'),'我的发布');
  await clickHome('管理作品');
  await clickHome('修改作品信息');
  await home(`(() => {
    const dialog=document.querySelector('dialog[aria-label="修改作品信息"]');
    dialog.querySelector('input[name="title"]').value='桌面发布更新';
    dialog.querySelector('textarea').value='编辑简介无需重新上传';
    dialog.querySelector('input[name="tags"]').value='光学，机关';
    dialog.querySelector('form').requestSubmit();
  })()`);
  await until(()=>home('document.querySelector(".hub-work h2")?.textContent==="桌面发布更新"'),'管理已发布作品');
  await until(()=>home('Boolean(document.querySelector(".hub-work .hub-tags")?.textContent.includes("光学"))'),'作品标签更新');
  await capture(window,'desktop-published-work');
  await home('window.workbenchHome.request("/api/account/logout","POST")');
  const pendingDownload=stall('GET',pathname=>pathname.endsWith('/download'));
  await clickHome('下载关卡',communityButtons);
  const downloadStarted=await until(pendingDownload.started,'下载开始传输');
  await clickHome('我的工程','.hub-nav button');
  assert.ok(await home('Boolean(document.querySelector("#my-projects-title"))'));
  await until(()=>home('Boolean(document.querySelector(".hub-community-offline"))'),'下载超时后回传首页状态');
  assert.ok(Date.now()-downloadStarted<12_500,'下载应在约 10 秒超时');
  await clickHome('我的发布','.hub-nav button');
  await until(()=>home('document.querySelector(".hub-main:not([hidden]) [role=alert]")?.textContent.includes("超时")'),'返回社区后可见下载超时');
  pendingDownload.stop();
  console.log('下载卡住时仍可使用主页，约十秒超时且回到社区可重试');
  await clickHome('下载关卡');
  await clickHome('查看本机关卡库');
  await until(()=>home('Boolean(document.querySelector(".hub-download-row .hub-publish"))'),'游客下载到本机关卡库');
  const publishLocal=await home('document.querySelector(".hub-download-row .hub-publish").getAttribute("aria-label")');
  await clickHome(publishLocal,'.hub-download-row .hub-publish');
  await until(()=>home('Boolean(document.querySelector("[aria-label=\\"发布作品\\"]"))'),'关卡库发布入口');
  assert.equal((await home('window.workbenchHome.shareDraft()')).manifest.scope,'level');
  await home('document.querySelector("[aria-label=\\"关闭发布面板\\"]").click()');
  await clickHome('发布作品');
  await until(()=>home('Boolean(document.querySelector("dialog[aria-label=\\"选择发布内容\\"] select option[value=\\"'+source.key+'\\"]"))'),'社区选择发布内容');
  await home(`(() => {
    const dialog=document.querySelector('dialog[aria-label="选择发布内容"]');
    const select=dialog.querySelectorAll('select')[1];
    select.value=${JSON.stringify(source.key)};select.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await until(()=>home('Boolean(document.querySelector("[aria-label=\\"发布范围\\"]"))'),'工程发布范围');
  await clickHome('继续','dialog button');
  await until(async()=>(await home('window.workbenchHome.shareDraft()'))?.manifest.scope==='project','桌面社区选择完整工程');
  await home('document.querySelector("[aria-label=\\"关闭发布面板\\"]").click()');
  assert.equal(await home('location.protocol'),'file:','桌面社区仍在本地界面');
  assert.equal(BrowserWindow.getAllWindows().length,1,'桌面发布与下载无需另开网页');
  assert.equal((await home('window.workbenchHome.authorSignIn('+JSON.stringify({mode:'device',username})+')')).username,username);
  assert.match(await home('window.workbenchHome.authorRecovery()'),/^[a-f0-9]{24}$/);
  console.log('桌面逐关发布、用户名登录、缩略图封面、管理作品、游客下载和完整工程选择通过');

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
  const signup=await fetch(address+'/api/account/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(account)});
  assert.equal(signup.status,200);
  await home('window.workbenchHome.authorSignIn('+JSON.stringify({mode:'legacy',...account})+')');
  const names=['验收单关','验收工程'];
  for(let i=0;i<names.length;i++){
    await run('document.querySelector("[aria-label=\\\"导出关卡或工程\\\"]").click()');
    const title=i?'分享整个工程':'分享当前关';
    await until(()=>run('Array.from(document.querySelectorAll("button")).some(button=>button.textContent?.includes('+JSON.stringify(title)+'))'),'分享入口');
    await run('Array.from(document.querySelectorAll("button")).find(button=>button.textContent?.includes('+JSON.stringify(title)+')).click()');
    let draft=await until(()=>home('window.workbenchHome.shareDraft()'),'待发布包');
    assert.equal(draft.manifest.scope,i?'project':'level');
    if(!draft.cover){
      await clickHome('生成预览');
      draft=await until(async()=>{
        const value=await home('window.workbenchHome.shareDraft()');
        return value?.cover&&value;
      },'生成作品封面');
    }
    assert.match(draft.cover??'',/^data:image\/webp;base64,/,JSON.stringify(await run(`({status:document.querySelector('.s-status')?.textContent,scene:document.querySelector('.s-scene-breadcrumb')?.textContent,canvases:Array.from(document.querySelectorAll('canvas')).map(canvas=>[canvas.width,canvas.height])})`)));
    assert.equal(draft.manifest.editorVersion,editorVersion);
    let published:{id:string;warning?:string};
    if(i){
      // Use the actual publishing form so it must generate all missing stage previews.
      await home(`(() => {
        const input=document.querySelector('[aria-label="发布作品"] form input[required]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(names[i])});
        input.dispatchEvent(new Event('input',{bubbles:true}));
      })()`);
      if(await home('Array.from(document.querySelectorAll("button")).some(button=>button.textContent==="登录后发布")')){
        await clickHome('登录后发布');
        await home(`(() => {
          const dialog=document.querySelector('dialog[aria-label="作者登录"]');
          dialog.querySelector('input[name="username"]').value=${JSON.stringify(account.username)};
          dialog.querySelector('form').requestSubmit();
        })()`);
      }
      await clickHome('确认发布');
      const found=await until(async()=>{
        const result=await home('window.workbenchHome.request("/api/works?q="+encodeURIComponent('+JSON.stringify(names[i])+'))');
        return result.works.find((work:{author:string;previews:string[]})=>work.author===account.username&&work.previews.length===levels.length);
      },'工程全部单关的默认缩略图');
      published={id:found.id};
      await until(()=>home('document.querySelector(".hub-work h2")?.textContent==="验收工程"'),'工程作品详情');
      await home('document.querySelector(".hub-work .hub-group-toggle").click()');
      await home('document.querySelector(".hub-work .hub-group-levels").scrollIntoView({block:"center"})');
      await until(()=>home(`Array.from(document.querySelectorAll('.hub-work .hub-level-row img')).filter(image=>image.naturalWidth>0).length===${levels.length}`),'展开工程后逐关显示不同缩略图');
      await capture(window,'desktop-project-level-thumbnails');
    }else published=await home('window.workbenchHome.publish('+JSON.stringify({title:names[i],version:'1.0',description:'浏览、下载与导入验收',images:true})+')');
    const found=await home('window.workbenchHome.request("/api/works?q="+encodeURIComponent('+JSON.stringify(names[i])+'))');
    assert.equal(found.works[0].id,published.id);
    assert.equal(found.works[0].cover,true,published.warning??'作品默认封面');
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
      const newest=await home('window.workbenchHome.request("/api/works?sort=newest")');
      const oldest=await home('window.workbenchHome.request("/api/works?sort=oldest")');
      assert.ok(newest.works.length>=2);
      assert.deepEqual(oldest.works.map((work:{id:string})=>work.id),newest.works.map((work:{id:string})=>work.id).reverse());
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
      const fallback=await home('window.workbenchHome.publishedPreview('+JSON.stringify(published.id)+',"1.0",'+JSON.stringify(levels[0].id)+')');
      assert.ok(fallback.entities.length||fallback.terrain?.length,'已发布关卡无图片时可读取场景生成缩略图');
    }
    await home('window.workbenchHome.request("/api/works/'+published.id+'","DELETE")');
    console.log(i?'工程上架、网页详情、完整与逐关下载、导为独立可编辑工程':'单关上架、网页详情和下载导入通过');
  }
  await home('window.projectTabs.action("home")');
  await clickHome('关卡库','.hub-nav button');
  await clickHome('关卡社区','.hub-nav button');
  await home(`(() => {
    const back=[...document.querySelectorAll('.hub-main:not([hidden]) button')].find(button=>button.textContent.trim()==='‹ 返回作品列表');
    back?.click();
  })()`);
  await until(catalogReady,'断网前缓存目录');
  session.defaultSession.webRequest.onBeforeRequest({urls:[address+'/api/*']},(_details,callback)=>callback({cancel:true}));
  await clickHome('刷新社区');
  await until(()=>home('Array.from(document.querySelectorAll("[role=status]")).some(node=>node.textContent.includes("本地缓存")&&node.textContent.includes("VPN"))'),'联网失败时保留目录和 VPN 提示');
  assert.ok(await catalogReady());
  await clickHome('我的工程','.hub-nav button');
  await until(()=>home('document.querySelector(".hub-community-offline")?.textContent.includes("VPN")'),'返回首页时保留社区连接提示');
  session.defaultSession.webRequest.onBeforeRequest(null);
  await clickHome('关卡社区','.hub-nav button');
  await until(catalogReady,'恢复网络后可浏览社区');
  await clickHome('刷新社区');
  await until(()=>home('!Array.from(document.querySelectorAll("[role=status]")).some(node=>node.textContent.includes("VPN"))'),'刷新成功后清除离线状态');
  await clickHome('我的工程','.hub-nav button');
  assert.equal(await home('document.querySelector(".hub-community-offline")===null'),true);
  await delay(100);
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
