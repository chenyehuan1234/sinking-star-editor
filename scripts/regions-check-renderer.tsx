import {Modal} from '../src/renderer/studio-ui';
import '../src/renderer/studio.css';
import '../src/renderer/studio-v07.css';
import '../src/renderer/studio-v079.css';
import React from 'react';import{createRoot}from'react-dom/client';import{NativeLevelPicker}from'../src/renderer/native-level-picker';import type{Catalog}from'../src/shared';import'./ui-check-types';import'../src/renderer/style.css';import'../src/renderer/studio-v0713.css';
const checks:string[]=[],wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function assert(ok:unknown,label:string){if(!ok)throw Error(label);checks.push(label);console.log(label);}
async function until(fn:()=>unknown,label:string){for(let i=0;i<150;i++){if(fn())return;await wait(20);}throw Error(label);}
const root=createRoot(document.getElementById('root')!);let catalogue:Catalog,key=0;
function mount(){root.render(<div className="studio"><Modal title="从原版模板添加关卡" onClose={()=>{}}><NativeLevelPicker key={key++} catalog={catalogue} onAdd={()=>{}}/></Modal></div>);}
const query=()=>document.querySelector<HTMLInputElement>('[aria-label="搜索原版关卡"]')!;
async function input(text:string){query().focus();await window.uiCheck.input(text);await wait(80);}
async function run(){catalogue=await window.editor.connect();localStorage.removeItem('sstar04:nativeBrowser:'+catalogue.sourceHash);mount();await until(()=>document.querySelector('.s-native-tree summary'),'目录载入');
 assert(catalogue.regions!.filter(g=>g.nameSource==='native-volume').length>60,'目录获得原生区域范围及名称');
 await input('光随镜转');await until(()=>document.querySelectorAll('[data-native-level]').length>0,'跨分屏区域搜索');
 const group=catalogue.regions!.find(g=>g.title==='光随镜转')!;assert(document.querySelectorAll('[data-native-level]').length===group.levels.length,'区域名检索包含所有跨分屏小关');assert(document.querySelector('.s-native-tree summary')?.textContent?.includes('2 屏'),'跨分屏区域只占一个目录组');
 const first=document.querySelector<HTMLButtonElement>('[data-native-level]')!;first.click();mount();await until(()=>query()?.value==='光随镜转','检索记忆');assert(Boolean(document.querySelector('.last-used')),'重开目录保留最后选中关卡');
 await input('');await until(()=>document.querySelectorAll('.s-native-tree>section>details').length>60,'完整区域列表');const details=Array.from(document.querySelectorAll<HTMLDetailsElement>('.s-native-tree>section>details'));assert(!details.some(d=>d.querySelector('summary')?.textContent?.startsWith('未命名分区')),'没有将有名称的原生区域显示为未命名分区');
 const target=details.find(d=>d.querySelector('summary')?.textContent?.includes('镜之群岛'))!;target.querySelector('summary')!.click();await wait(60);const tree=document.querySelector<HTMLDivElement>('.s-native-tree')!;tree.scrollTop=320;tree.dispatchEvent(new Event('scroll',{bubbles:true}));const top=tree.scrollTop;root.render(null);await wait(60);mount();await wait(120);assert(document.querySelector<HTMLDetailsElement>('.s-native-tree details[open]')!==null,'重开目录保留区域展开');assert(Math.abs(document.querySelector<HTMLDivElement>('.s-native-tree')!.scrollTop-top)<2,'重开目录保留滚动位置');
 for(const[w,h,z]of[[1920,1080,1],[1366,768,1.25],[1366,768,1]]){await window.uiCheck.resize(w,h,z);await wait(150);const box=document.querySelector('.s-modal')!.getBoundingClientRect();assert(box.width<=innerWidth&&box.height<=innerHeight,`目录布局 ${w}×${h} 缩放${z}`);}
 const legacyGroup=catalogue.regions!.find(g=>g.nameSource==='native-volume'&&(g.cells?.length??0)>1)!;root.render(null);await wait(60);localStorage.setItem('sstar04:nativeBrowser:'+catalogue.sourceHash,JSON.stringify({query:'',open:{[legacyGroup.layer+':'+legacyGroup.cells![0].join(':')]:true},aux:false,scrollTop:0,lastLevel:''}));mount();await wait(100);let legacy=Array.from(document.querySelectorAll<HTMLDetailsElement>('.s-native-tree>section>details')).find(d=>d.querySelector('summary span')?.textContent===legacyGroup.title)!;assert(legacy.open,'旧分屏目录展开记录迁移到原生区域');legacy.querySelector('summary')!.click();root.render(null);await wait(60);mount();await wait(100);legacy=Array.from(document.querySelectorAll<HTMLDetailsElement>('.s-native-tree>section>details')).find(d=>d.querySelector('summary span')?.textContent===legacyGroup.title)!;assert(!legacy.open,'关闭迁移后的区域后重开仍保持关闭');
 await input('光照之石');await wait(100);await window.uiCheck.capture('v08-native-regions');await window.uiCheck.finish({checks});}
void run().catch(error=>window.uiCheck.finish({checks,error:String(error)}));
