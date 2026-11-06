import React from'react';import{createRoot}from'react-dom/client';import{StudioApp}from'../src/renderer/studio-app';import{executeCommand}from'../src/renderer/commands';import'./ui-check-types';
const key='memory-check-run',runId=document.querySelector<HTMLMetaElement>('meta[name=memory-run]')!.content,stored=JSON.parse(localStorage.getItem(key)??'null'),previous=stored?.runId===runId?stored:null;
if(!previous)localStorage.clear();
const checks:string[]=previous?.checks??[],wait=(ms:number)=>new Promise(r=>setTimeout(r,ms)),frame=()=>new Promise(r=>requestAnimationFrame(r));
function assert(ok:unknown,label:string){if(!ok)throw Error(label);checks.push(label);console.log(label);}
async function until(test:()=>unknown,label:string){for(let i=0;i<300;i++){if(test())return;await wait(30);}throw Error('等待超时：'+label);}
function click(selector:string){const e=document.querySelector<HTMLElement>(selector);if(!e)throw Error(selector);e.click();}
function category(label:string){const e=Array.from(document.querySelectorAll<HTMLButtonElement>('.s-bottom .s-assets nav button')).find(e=>e.textContent===label);if(!e)throw Error(label);e.click();}
const asset=()=>document.querySelector<HTMLDivElement>('.s-bottom .s-asset-grid')!,query=()=>document.querySelector<HTMLInputElement>('.s-bottom input[aria-label="搜索素材"]')!,variants=()=>document.querySelector<HTMLInputElement>('.s-bottom .s-variant-toggle input')!;
async function change(e:HTMLInputElement,v:string){e.focus();await frame();await window.uiCheck.input(v);await frame();}
async function scroll(e:HTMLElement,y:number){e.scrollTop=y;e.dispatchEvent(new Event('scroll',{bubbles:true}));await frame();return e.scrollTop;}
async function picker(){click('button[aria-label="从原版模板添加"]');await until(()=>document.querySelector('.s-native-tree'),'原版目录');return document.querySelector<HTMLDivElement>('.s-native-tree')!;}
async function close(){click('.s-modal button[aria-label="关闭"]');await frame();}
function inView(key:string){const card=Array.from(document.querySelectorAll<HTMLElement>('[data-preset-key]')).find(e=>e.dataset.presetKey===key);if(!card)return false;const c=card.getBoundingClientRect(),r=asset().getBoundingClientRect();return c.bottom>r.top&&c.top<r.bottom;}
function remember(phase:number,extra:Record<string,unknown>={}){localStorage.setItem(key,JSON.stringify({...previous,...extra,checks,phase,runId}));location.reload();}
createRoot(document.getElementById('root')!).render(<StudioApp/>);
async function run(){await until(()=>document.querySelector('[data-level-id]'),'工程');await until(()=>Number(document.querySelector('.s-bottom .s-count')?.textContent)>0,'素材');
 if(!previous){
  click('[data-level-id]');await wait(700);
  let tree=await picker();click('.s-native-tree summary');await frame();const at=await scroll(tree,600);assert(at>300,'原版目录可滚动到深处');await close();
  tree=await picker();await frame();assert(Boolean(document.querySelector('.s-native-tree details[open]')),'原版区域展开状态恢复');assert(Math.abs(tree.scrollTop-at)<2,'原版目录关闭重开恢复滚动位置');
  const nativeSearch=document.querySelector<HTMLInputElement>('input[aria-label="搜索原版关卡"]')!;await change(nativeSearch,'mirror');await frame();const searchTop=await scroll(tree,230),chosen=Array.from(tree.querySelectorAll<HTMLButtonElement>('[data-native-level]')).find(e=>{const b=e.getBoundingClientRect(),r=tree.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom;})!;const name=chosen.dataset.nativeLevel;chosen.click();await until(()=>!document.querySelector('.s-native-tree'),'添加完成');
  tree=await picker();assert(document.querySelector<HTMLInputElement>('input[aria-label="搜索原版关卡"]')!.value==='mirror','添加原版关后重新打开保留搜索词');assert(Math.abs(tree.scrollTop-searchTop)<2,'添加原版关后原位返回');assert(Boolean(tree.querySelector('.last-used[data-native-level="'+name+'"]')),'上次添加关卡有可见标记');await close();
  click('[data-level-id]');await wait(500);category('角色');await frame();await change(query(),'Guy');if(!variants().checked)variants().click();await frame();await wait(200);const charTop=await scroll(asset(),620);assert(charTop>100,'角色分类形成可恢复的滚动位置');
  category('方块');await frame();assert(query().value==='','新分类没有继承另一分类的搜索');await change(query(),'Rock');if(!variants().checked)variants().click();await frame();const blockTop=await scroll(asset(),350);
  category('角色');await frame();assert(query().value==='Guy'&&variants().checked,'素材分类分别恢复搜索和变体状态');assert(Math.abs(asset().scrollTop-charTop)<2,'切回角色恢复原滚动位置');
  category('方块');await frame();assert(query().value==='Rock'&&Math.abs(asset().scrollTop-blockTop)<2,'方块分类独立保留自己的位置');category('角色');await frame();
  const before=await window.uiCheck.stats();await scroll(asset(),charTop);click('button[aria-label="关闭素材与快捷槽"]');await frame();click('button[aria-label="工作区布局"]');await frame();Array.from(document.querySelectorAll<HTMLButtonElement>('.s-layout-panels button')).find(e=>e.textContent?.startsWith('素材与快捷槽'))!.click();await frame();click('button[aria-label="工作区布局"]');await wait(200);assert(query().value==='Guy'&&Math.abs(asset().scrollTop-charTop)<2,'隐藏素材栏后恢复分类、筛选与位置');assert((await window.uiCheck.stats()).previewUpdate===before.previewUpdate,'浏览记忆不触发原生预览或工程修改');
  await wait(200);const browser=JSON.parse(localStorage.getItem('sstar04:assetBrowser:main:false')!),anchor=browser.tabs.character.anchor;await window.uiCheck.resize(1920,1080,1);await wait(250);assert(inView(anchor),'窗口变宽后保持原物件可见');await window.uiCheck.capture('memory-1920');await window.uiCheck.resize(1920,1080,1.5);await wait(250);assert(inView(anchor),'150% 页面缩放仍保持原物件可见');await window.uiCheck.capture('memory-1920-150');await window.uiCheck.resize(1366,768,1);await wait(250);assert(inView(anchor),'恢复小窗口后仍定位原物件');
  executeCommand('save');await until(()=>!document.querySelector('.s-project-menu i'),'保存测试工程');const target=document.querySelector<HTMLElement>('[data-level-id].active')!.dataset.levelId;remember(1,{target,nativeName:name,searchTop,anchor});return;
 }
 if(previous.phase===1){
  await until(()=>document.querySelector('[data-level-id].active'),'恢复小关');assert(document.querySelector<HTMLElement>('[data-level-id].active')!.dataset.levelId===previous.target,'完整页面重载后恢复上次小关');await wait(250);assert(query().value==='Guy'&&variants().checked,'完整页面重载后恢复素材分类与筛选');assert(inView(previous.anchor),'完整页面重载后恢复素材浏览位置');
  const tree=await picker();assert(document.querySelector<HTMLInputElement>('input[aria-label="搜索原版关卡"]')!.value==='mirror','完整页面重载后保留原版搜索');assert(Math.abs(tree.scrollTop-previous.searchTop)<2,'完整页面重载后保留原版目录位置');await window.uiCheck.capture('memory-1366');await close();
  assert(!document.querySelector('.s-project-menu i'),'恢复本机界面记忆不标记工程未保存');const viewKey=Object.keys(localStorage).find(k=>k.startsWith('sstar04:lastView:'))!;localStorage.setItem(viewKey,JSON.stringify('removed-level'));remember(2);return;
 }
 assert(Boolean(document.querySelector('.s-level-row.active:not([data-level-id])')),'上次小关已不存在时安全回到大地图');assert(!document.querySelector('.s-project-menu i'),'失效记录回退不修改工程');await window.uiCheck.finish({checks,manualUiTested:false,nativeGameplayTested:false});
}
run().catch(async error=>{await window.uiCheck.capture('memory-failure');await window.uiCheck.finish({checks,error:String(error),stack:error.stack});});
