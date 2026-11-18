import React from 'react';import {createRoot} from 'react-dom/client';
import {StudioApp} from '../src/renderer/studio-app';
import {PlaytestDialog} from '../src/renderer/playtest-dialog';
import type {PreparationProgress} from '../src/shared';import type {PlaytestPlan} from '../src/v08-types';
import './ui-check-types';
let probe:any;const checks:string[]=[],wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function assert(v:unknown,message:string){if(!v)throw Error(message);checks.push(message);console.log(message);}
async function until(fn:()=>unknown,label:string){for(let n=0;n<400;n++){if(fn())return;await wait(30);}throw Error('超时 '+label);}
const panes=()=>Array.from(document.querySelectorAll<HTMLElement>('[aria-label="试玩副本准备进度"]'));
const p:PreparationProgress={phase:'copy',copiedBytes:2*2**30,totalBytes:8*2**30,filesCopied:1234,totalFiles:9876,currentFile:'data-pc/'+('模型'.repeat(100))+'.compressed_mesh'};
async function progress(text:string,value?:PreparationProgress){await window.uiCheck.progress(text,value);await wait(100);}
const root=createRoot(document.getElementById('root')!);localStorage.clear();root.render(<StudioApp onViewportProbe={v=>{probe=v;}}/>);
async function run(){
 await until(()=>probe?.level(),'工作台');const saved=await window.uiCheck.saved(),stats=await window.uiCheck.stats();
 assert(!panes().length,'正常打开编辑器不复制游戏，也不显示复制条');
 await progress('统计试玩副本大小…',{...p,phase:'scan',copiedBytes:0,totalBytes:0,filesCopied:0,totalFiles:0});
 assert(panes().length===1&&!panes()[0].querySelector('progress')!.hasAttribute('value'),'统计阶段使用不定进度，不伪造百分比');
 await progress('首次复制试玩副本…',p);const bar=panes()[0];
 assert(bar.textContent?.includes('25%')&&bar.textContent.includes('2.00 GiB / 8.00 GiB'),'真实字节进度显示百分比与复制大小');
 assert(bar.querySelector('progress')!.value===25&&bar.textContent?.includes('1,234 / 9,876'),'进度条值与文件计数一致');
 assert(document.querySelector('.s-status')!.textContent?.includes('首次复制试玩副本'),'主进程状态文字与结构化进度通过同一 IPC 到达工作台');
 for(const [w,h,z]of[[1366,768,1],[1920,1080,1],[1920,1080,1.5]]){await window.uiCheck.resize(w,h,z);await wait(150);assert(bar.scrollWidth<=bar.clientWidth+1&&bar.getBoundingClientRect().bottom<=document.querySelector('footer.s-status')!.getBoundingClientRect().top+1,w+' / '+z+' 下进度不遮挡状态栏或横向溢出');}
 await window.uiCheck.capture('copy-progress-workbench');
 await progress('校验新版试玩资源…',{...p,phase:'verify',copiedBytes:p.totalBytes,filesCopied:p.totalFiles});assert(panes()[0].textContent?.includes('校验试玩资源')&&!panes()[0].querySelector('progress')!.hasAttribute('value'),'复制结束后明确显示校验阶段，不把 100% 当成已经启动游戏');
 await progress('试玩副本已准备完成');assert(!panes().length,'准备完成的普通状态消息会清除进度条');
 await progress('复制新版试玩副本…',p);await progress('准备试玩副本失败：磁盘写入失败');assert(!panes().length&&document.querySelector('.s-status')!.textContent?.includes('磁盘写入失败'),'失败消息清空进度，不残留忙碌条');
 const mount=document.createElement('div');document.body.append(mount);const modal=createRoot(mount);let finish:()=>void=()=>{};
 const plan={supported:true,reason:'独立测试',context:{projectId:'copy-ui',sourceHash:'x',scope:{mode:'single',levelIds:['camera_blank']},revision:'x'},compatible:[{id:'abc',name:'测试档',lastUsed:Date.now()}],incompatible:[],preparation:{workspace:'独立测试工作区',prepared:false,requiresRefresh:true,sourceBytes:8*2**30,requiredBytes:9*2**30,availableBytes:20*2**30,canPrepare:true}}as unknown as PlaytestPlan;
 modal.render(<PlaytestDialog title="复制进度界面检查" plan={async()=>plan} onRun={()=>new Promise<string>(resolve=>{finish=()=>resolve('已启动');})} onClose={()=>modal.unmount()}/>);
 await until(()=>document.querySelector('.s-playtest-actions .primary')&&!document.querySelector<HTMLButtonElement>('.s-playtest-actions .primary')!.disabled,'存档试玩');
 document.querySelector<HTMLButtonElement>('.s-playtest-actions .primary')!.click();await wait(80);await progress('复制新版试玩副本…',p);
 assert(panes().length===2&&document.querySelector('.s-playtest-dialog .s-preparation-progress progress')?.getAttribute('value')==='25','存档试玩弹窗也实时显示同一进度，不被遮罩盖住');
 assert(document.querySelector('.s-playtest-dialog')!.textContent?.includes('成功后自动清理旧副本'),'更新提示说明替换与临时空间需求');
 await window.uiCheck.resize(1366,768,1);await wait(120);await window.uiCheck.capture('copy-progress-dialog');
 await progress('试玩副本已更新');finish();await until(()=>!document.querySelector('.s-playtest-dialog'),'关闭试玩弹窗');await progress('清理旧副本…',{...p,phase:'cleanup'});assert(panes().length===1,'弹窗关闭后解除自身 IPC 订阅，工作台保留正常监听');await progress('就绪');
 assert(JSON.stringify(await window.uiCheck.saved())===JSON.stringify(saved),'进度通知不改工程，也不触发保存或复制');assert((await window.uiCheck.stats()).previewUpdate===stats.previewUpdate,'持续进度与窗口缩放不触发后台原生预览重建');
 await window.uiCheck.finish({checks,gameCopied:false,gameLaunched:false});
}
run().catch(async e=>{await window.uiCheck.capture('copy-progress-failure');await window.uiCheck.finish({checks,error:String(e),stack:e.stack});});
