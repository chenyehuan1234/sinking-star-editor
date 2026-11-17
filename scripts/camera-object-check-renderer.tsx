import React from 'react';
import {createRoot} from 'react-dom/client';
import {StudioApp} from '../src/renderer/studio-app';
import {executeCommand} from '../src/renderer/commands';
import './ui-check-types';

let probe:any;
const checks:string[]=[],wait=(n:number)=>new Promise(r=>setTimeout(r,n));
function assert(v:unknown,label:string){if(!v)throw Error(label);checks.push(label);console.log(label);}
async function until(f:()=>unknown,label:string){for(let n=0;n<500;n++){if(f())return;await wait(30);}throw Error('超时 '+label);}
const count=()=>probe.level().camera.controls.length+probe.level().camera.regions.length;
async function saved(){executeCommand('save');await wait(350);return(await window.uiCheck.saved()).levels.find((l:any)=>l.id==='camera_blank').project;}
const control=(label:string)=>document.querySelector<HTMLButtonElement>('[aria-label="'+label+'"]')!;
async function create(kind:string){const n=count();if(kind==='play'||kind==='overview'){control('新建镜头').click();await wait(50);control(kind==='play'?'新建正常游玩镜头':'新建地图总览镜头').click();}else{document.querySelector<HTMLDetailsElement>('[data-camera-section="regions"]')!.open=true;await wait(80);const select=document.querySelector<HTMLSelectElement>('[aria-label="新建控制区域类别"]')!;select.value=kind;select.dispatchEvent(new Event('change',{bubbles:true}));await wait(50);control('新建控制区域').click();}await until(()=>count()===n+1,'创建 '+kind);await wait(100);const p=await saved();return p.camera.edits.at(-1);}

localStorage.clear();createRoot(document.getElementById('root')!).render(<StudioApp onViewportProbe={p=>{probe=p;}}/>);
async function run(){
 await until(()=>document.querySelector('[data-level-id="camera_blank"]'),'测试关卡');document.querySelector<HTMLElement>('[data-level-id="camera_blank"]')!.click();await until(()=>probe.level()?.camera,'兼容历史工程');
 assert(probe.level().entities.find((e:any)=>e.id===900*0x100000+1)?.type==='View_Giver','旧镜头删除后编号被卷轴复用，关卡仍能正常预览');
 document.querySelector<HTMLButtonElement>('.s-camera-edit-button')!.click();await until(()=>document.querySelector('[data-camera-section="list"]'),'相机面板');await wait(80);
 const base=count(),ids=new Set<number>([900*0x100000+1]);
 for(const kind of ['play','overview','height-lock','limiter','overview-region']){
  const edit=await create(kind);for(const id of Object.values(edit.ids)as number[]){assert(!ids.has(id),kind+' 新建使用独立编号');ids.add(id);}
 }
 assert(count()===base+5,'五种对象通过真实新建按钮连续创建成功');
 const before=await saved(),last=before.camera.edits.at(-1),removed=last.ids[last.sourceId];
 control('删除控制区域').click();await wait(60);Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='删除并解除相机引用')!.click();await until(()=>count()===base+4,'删除区域');await wait(150);
 assert(!probe.level().camera.regions.some((r:any)=>r.id===removed),'删除区域后立即从列表和场景移除');
 const next=await create('overview-region');assert(next.ids[next.sourceId]!==removed,'删除再新建不会复用历史区域编号');
 const final=await saved();executeCommand('undo');await until(()=>count()===base+4,'撤销新建');assert(count()===base+4,'一次撤销完整移除新区域');executeCommand('redo');await until(()=>count()===base+5,'重做新建');assert(count()===base+5,'一次重做完整恢复新区域');await saved();
 control('打开工程').click();await until(()=>probe.level()?.entities.some((e:any)=>e.type==='View_Giver'),'保存重开');await wait(250);assert(count()===base+5,'保存重开保留全部镜头、控制区域及卷轴');assert(JSON.stringify((await saved()).camera)===JSON.stringify(final.camera),'保存重开不改写历史配置');
 await window.uiCheck.resize(1366,768,1);await wait(200);assert(control('新建控制区域').getBoundingClientRect().width>0,'1366×768 新建入口可用');await window.uiCheck.resize(1920,1080,1.25);await wait(200);assert(control('新建控制区域').getBoundingClientRect().width>0,'1920×1080 / 125% 新建入口可用');
 assert(!document.querySelector('.s-error')?.textContent?.includes('ID 冲突'),'操作结束没有相机编号冲突');await window.uiCheck.capture('camera-object-create');await window.uiCheck.finish({checks,nativeGameplayTested:false});
}
run().catch(async e=>{await window.uiCheck.capture('camera-object-failure');await window.uiCheck.finish({checks,error:String(e),stack:e.stack});});
