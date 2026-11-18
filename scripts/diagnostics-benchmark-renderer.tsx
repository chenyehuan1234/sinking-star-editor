import React from 'react';
import {createRoot} from 'react-dom/client';
import * as T from 'three';
import {StudioApp} from '../src/renderer/studio-app';
import {executeCommand} from '../src/renderer/commands';
import {performanceCapture as capture,summarizePerformance} from '../src/renderer/performance-capture';
import type {LevelView,Vec3} from '../src/shared';
import './ui-check-types';

let probe:any;
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const frame=()=>new Promise<number>(resolve=>{const id=setTimeout(()=>resolve(performance.now()),125);requestAnimationFrame(time=>{clearTimeout(id);resolve(time);});});
const root=createRoot(document.getElementById('root')!);
const report:Record<string,unknown>={};

async function until(condition:()=>unknown,label:string){
  for(let i=0;i<600;i++){if(condition())return;await sleep(25);}
  throw Error('等待超时 '+label);
}
function check(value:unknown,label:string){if(!value)throw Error(label);}
function click(label:string){
  const button=Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(e=>e.getAttribute('aria-label')===label||e.textContent?.trim()===label);
  if(!button)throw Error('找不到 '+label);
  button.click();
}
function openLevel(id:string){document.querySelector<HTMLButtonElement>(`[data-level-id="${id}"]`)!.click();}
function current():LevelView{return probe.level();}
function viewAt(target:Vec3,distance:number){
  probe.loadMemory({position:[target[0],target[1]-distance*.5,target[2]+distance],target,fov:45,up:[0,0,1]});
}
function screen(point:T.Vector3){
  const r=probe.renderer.domElement.getBoundingClientRect(),p=point.clone().project(probe.camera);
  return {x:Math.round(r.left+(p.x+1)*r.width/2),y:Math.round(r.top+(1-p.y)*r.height/2)};
}
function center(id:number){
  const g=probe.groups.get(id) as T.Group;
  g.updateMatrixWorld(true);
  return new T.Box3().setFromObject(g).getCenter(new T.Vector3());
}
type Point={x:number;y:number};
async function pointer(type:string,point:Point,button='left'){await window.uiCheck.pointer({type,...point,button,clickCount:1});}
async function clickAt(point:Point,button='left'){
  await pointer('mouseMove',point);await pointer('mouseDown',point,button);await pointer('mouseUp',point,button);await frame();
}
function summary(values:number[]){
  const sorted=[...values].sort((a,b)=>a-b);
  const percentile=(p:number)=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
  return {samples:sorted.length,median:percentile(.5),p95:percentile(.95),max:sorted.at(-1)};
}
function snapshot(){
  const trace=capture.stop()!;
  return {...trace,totals:summarizePerformance(trace.samples)};
}
function selectVisible(position:Point){
  const r=probe.renderer.domElement.getBoundingClientRect();
  return position.x>r.left+24&&position.x<r.right-24&&position.y>r.top+24&&position.y<r.bottom-24;
}
function pickPoint(id:number){
  const point=screen(center(id));
  for(const d of [0,3,6,9,12,18,24])for(const [dx,dy]of [[0,0],[-d,0],[d,0],[0,-d],[0,d],[-d,-d],[d,d],[-d,d],[d,-d]]){
    const p={x:point.x+dx,y:point.y+dy};
    if(probe.hitCandidates({clientX:p.x,clientY:p.y})[0]?.userData.id===id)return p;
  }
  throw Error('找不到可拾取像素 '+id);
}
async function pickAndDrag(ids:number[],enabled:boolean){
  const selectionTimes:number[]=[],motionTimes:number[]=[];
  const startStats=await window.uiCheck.stats();
  const targets=ids.map(pickPoint);
  if(enabled)capture.start();
  for(let i=0;i<20;i++){
    const id=ids[i%ids.length],at=targets[i%ids.length],start=performance.now();
    await clickAt(at);
    selectionTimes.push(performance.now()-start);
    check(Array.from(document.querySelectorAll('.s-object-row079.active')).some(e=>e.getAttribute('data-entity-id')===String(id)),`canvas did not pick ${id}`);
  }
  let duringDrag=true;
  const savedView=current();
  for(let i=0;i<3;i++){
    const at=pickPoint(ids[0]),before=await window.uiCheck.stats();
    await pointer('mouseDown',at);
    for(let n=1;n<=18;n++){
      const old=performance.now();await pointer('mouseMove',{x:at.x+(i%2?-1:1)*n*2,y:at.y});await frame();
      motionTimes.push(performance.now()-old);
    }
    const during=await window.uiCheck.stats();
    duringDrag&&=during.previewUpdate===before.previewUpdate;
    await pointer('mouseUp',{x:at.x+(i%2?-1:1)*36,y:at.y});
    await sleep(300);
  }
  const stats=await window.uiCheck.stats();
  return {selection:summary(selectionTimes),motion:summary(motionTimes),noPreviewDuringDrag:duringDrag,previewRequests:(stats.previewUpdate??0)-(startStats.previewUpdate??0),objects:savedView.entities.length,cells:savedView.terrain?.length??0,trace:enabled?snapshot():null};
}

async function run(){
  localStorage.clear();root.render(<StudioApp onViewportProbe={value=>{probe=value;}}/>);
  await until(()=>probe?.level()&&document.querySelector('[data-level-id="green_metamirror"]'),'编辑器连接');
  const settings=document.querySelector<HTMLButtonElement>('button[aria-label^="快捷键与鼠标设置"]');
  if(settings)settings.click();else executeCommand('settings');
  await until(()=>document.querySelector('.s-settings-modal07'),'操作设置');
  click('性能诊断');await until(()=>document.querySelector('.s-perf-panel'),'性能诊断设置');click('开始记录');
  await until(()=>capture.active&&document.querySelector('.s-perf-status.active'),'从设置开始采样');
  openLevel('green_metamirror');
  await until(()=>current()?.name==='green_metamirror'&&probe.groups.size>0,'原版多高度关卡');
  await Promise.allSettled([...probe.assets.geometries.values(),...probe.assets.materials.values()]);
  await sleep(300);
  click('停止性能记录');
  console.log('profiled first level load');
  report.cold={...capture.report,totals:summarizePerformance(capture.report!.samples)};
  check(capture.report!.samples.some(s=>s.phase==='asset.read'||s.source==='disk'),'后端资源计时缺失');
  await until(()=>document.querySelector('.s-perf-panel table'),'显示性能报告');
  await window.uiCheck.capture('performance-panel');
  click('清除报告');
  await until(()=>!capture.report&&!document.querySelector('.s-perf-status'),'清除性能报告');
  document.querySelector<HTMLButtonElement>('.s-perf-panel [aria-label="关闭"]')!.click();

  openLevel('camera_blank');
  await until(()=>current()?.entities.some(e=>e.type==='Gate')&&probe.groups.size>1,'独立放置测试关');
  const ids=['Guy','Gate'].map(type=>current().entities.find(e=>e.type===type)!.id);
  await until(()=>ids.every(id=>probe.groups.get(id)?.children.length),'角色和门闸模型');
  viewAt([8,8,0],24);await frame();
  for(const id of ids)check(selectVisible(screen(center(id))),'测试物件在画布外');
  await clickAt(screen(center(ids[0])));
  const sourcePosition=current().entities.find(e=>e.id===ids[0])!.position!;
  console.log('measure warm interaction, recording off');
  report.captureOff=await pickAndDrag(ids,false);
  for(let i=0;i<(report.captureOff as {previewRequests:number}).previewRequests;i++){executeCommand('undo');await sleep(220);}
  await until(()=>current().entities.find(e=>e.id===ids[0])?.position?.join()===sourcePosition.join(),'还原对照起点');
  console.log('measure warm interaction, recording on');
  report.captureOn=await pickAndDrag(ids,true);
  const measured=report.captureOn as Awaited<ReturnType<typeof pickAndDrag>>;
  check(measured.previewRequests===3&&measured.noPreviewDuringDrag,'拖动事务未保持一次松手一次提交');
  check(measured.trace?.totals.some(s=>s.phase==='select.feedback')&&measured.trace?.totals.some(s=>s.phase==='drag.frame'),'画布选择或帧间隔未采样');

  capture.start();
  for(let i=0;i<4;i++){
    await clickAt(pickPoint(ids[1]),'middle');
    const ground=screen(new T.Vector3(4,6,0));
    await pointer('mouseMove',ground);
    await until(()=>probe.ghost.visible,'机关放置虚像');
    await pointer('mouseMove',{x:ground.x+30,y:ground.y+10});await frame();
    click('切换地形放置');await frame();
    await pointer('mouseDown',ground);
    for(let n=1;n<=10;n++){await pointer('mouseMove',{x:ground.x+n*3,y:ground.y+n});await frame();}
    const r=probe.renderer.domElement.getBoundingClientRect();
    await pointer('mouseUp',{x:Math.round(r.left-8),y:ground.y});await frame();
    executeCommand('cancel');
  }
  report.placement=snapshot();console.log('measured terrain and object previews');

  executeCommand('save');
  await until(()=>document.querySelector('.s-status-right')?.textContent?.includes('已保存'),'保存测试工程');
  capture.start();
  click(document.querySelector('.s-project-menu')!.textContent!.trim());await until(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='导入／编辑原版三层世界'),'工程菜单');click('导入／编辑原版三层世界');
  await until(()=>current()?.name==='overworld'&&document.querySelector('[aria-label="大世界显示高度范围"]'),'原版世界');
  console.log('opened world');
  const native=await window.editor.nativeCreate(),index=await window.editor.nativeIndex(native);
  const cell=index.cells.filter(c=>c.entries.length).sort((a,b)=>b.entries.length-a.entries.length)[0];
  viewAt(cell.entries[0].position,26);
  await until(()=>current().partial&&!current().overview&&probe.groups.size>100,'密集分区');
  console.log('loaded bounded world');
  await sleep(800);
  const r=probe.renderer.domElement.getBoundingClientRect(),at={x:Math.round(r.left+r.width*.5),y:Math.round(r.top+r.height*.5)};
  await pointer('mouseDown',at,'middle');
  for(let n=1;n<=24;n++){await pointer('mouseMove',{x:at.x+n*2,y:at.y},'middle');await frame();}
  await pointer('mouseUp',{x:at.x+48,y:at.y},'middle');
  await sleep(650);
  report.world=snapshot();console.log('measured dense world window');
  await until(()=>!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='取消加载'),'等待世界预览完成');
  await Promise.allSettled([...probe.assets.geometries.values(),...probe.assets.materials.values(),...probe.assets.textures.values()]);
  root.unmount();
  await window.uiCheck.finish({report,nativeGameplayTested:false});
}
run().catch(async error=>{capture.stop();console.error(error);await window.uiCheck.finish({report,error:String(error),scene:current()?.name,groups:probe?.groups.size,status:document.querySelector('.s-status')?.textContent});});
