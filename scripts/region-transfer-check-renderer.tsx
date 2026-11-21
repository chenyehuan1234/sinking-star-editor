import React from 'react';import {createRoot} from 'react-dom/client';import {StudioApp} from '../src/renderer/studio-app';import {executeCommand} from '../src/renderer/commands';import * as T from 'three';import './ui-check-types';
const checks:string[]=[],wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));let probe:any;
function assert(x:unknown,label:string){if(!x)throw Error(label);checks.push(label);console.log(label);}
async function until(fn:()=>unknown,label:string){for(let i=0;i<1000;i++){if(fn())return;await wait(30);}throw Error('超时 '+label);}
function click(label:string){const b=Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')===label);if(!b)throw Error('缺少按钮 '+label);b.click();}

localStorage.clear();
window.confirm=()=>true;
createRoot(document.getElementById('root')!).render(<StudioApp onViewportProbe={p=>{probe=p;}}/>);
async function run(){
 await until(()=>document.querySelector('.s-project-menu'),'工作台');
 click(document.querySelector('.s-project-menu')!.textContent!.trim());
 await until(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='导入／编辑原版三层世界'),'工程菜单');
 click('导入／编辑原版三层世界');
 await until(()=>document.querySelector('[aria-label="打开大世界"]')?.textContent?.includes('大世界'),'原版工作台');
 await until(()=>probe?.level()?.name==='overworld'&&!document.querySelector('.s-status-right')?.textContent?.includes('处理中'),'世界初始分区');
 executeCommand('save');
 await wait(1000);
 let saved=await window.uiCheck.saved();
 const mode=document.querySelector<HTMLSelectElement>('[aria-label="高度显示方式"]')!;
 const nativeSetter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!;
 const index=await window.editor.nativeIndex(saved);
 const source=index.entryLinks?.find(e=>e.target==='mirror_1'&&e.position.every(Number.isInteger))??index.entryLinks?.find(e=>e.position.every(Number.isInteger));
 assert(source,'可定位原版入口');
 const [x,y,z]=source!.position;
 function project(px:number,py:number,pz:number){
   const rect=probe.renderer.domElement.getBoundingClientRect(),screen=new T.Vector3(px,py,pz).project(probe.camera);
   return {x:Math.round(rect.left+(screen.x+1)*rect.width/2),y:Math.round(rect.top+(1-screen.y)*rect.height/2)};
 }
 async function input(label:string,value:string){
   const field=document.querySelector<HTMLInputElement>('[aria-label="'+label+'"]')!;
   field.focus();await window.uiCheck.input(value);field.blur();
 }
 nativeSetter.call(mode,'all');mode.dispatchEvent(new Event('change',{bubbles:true}));
 await input('编辑高度层',String(z));
 for(const orthographic of [false,true]){
   const distance=650;
   probe.loadMemory({position:[x-18,y-26,z+distance],target:[x-18,y-19,z],fov:45,up:[0,0,1],orthographic,span:530});
   await wait(300);
   const screen=project(x,y,z),canvas=probe.renderer.domElement;
   const anchor=probe.coordinatePoint({clientX:screen.x,clientY:screen.y},false,undefined,z)??[x,y,z];
   for(let i=0;i<40;i++)canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100,clientX:screen.x,clientY:screen.y}));
   await wait(350);
   const zoomed=project(anchor[0],anchor[1],anchor[2]);
   assert(Math.hypot(screen.x-zoomed.x,screen.y-zoomed.y)<8,(orthographic?'正交':'透视')+'大世界缩放保持指针落点');
   assert(orthographic?probe.camera.span/probe.camera.zoom<2:probe.camera.position.distanceTo(probe.controls.target)<2,(orthographic?'正交':'透视')+'大世界可从总览尺度放大到一格');
 }
 await until(()=>!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='取消加载'),'缩放分区加载完成');
 const canvasBounds=probe.renderer.domElement.getBoundingClientRect();
 const middleStart={x:Math.round(canvasBounds.left+canvasBounds.width/2),y:Math.round(canvasBounds.top+canvasBounds.height/2)},middleBefore=probe.camera.position.clone();
 await window.uiCheck.pointer({type:'mouseMove',...middleStart});
 await window.uiCheck.pointer({type:'mouseDown',...middleStart,button:'middle',clickCount:1});
 await window.uiCheck.pointer({type:'mouseMove',x:middleStart.x+45,y:middleStart.y+18,button:'middle'});
 await window.uiCheck.pointer({type:'mouseUp',x:middleStart.x+45,y:middleStart.y+18,button:'middle',clickCount:1});
 await until(()=>probe.camera.position.distanceTo(middleBefore)>.005,'中键拖动更新画布');
 assert(probe.camera.position.distanceTo(middleBefore)>.005,'快速中键拖动平移大世界');
 probe.loadMemory({position:[x,y-.2,z+15],target:[x,y,z],fov:45,up:[0,0,1]});
 await wait(550);
 await until(()=>!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='取消加载'),'区域加载完成');
 click('区域复制');
 await until(()=>document.querySelector('.s-status')?.textContent?.includes('拖出矩形'),'区域工具');
 await wait(350);
 const a=project(x-1,y-1,z),b=project(x+1,y+1,z);
 await window.uiCheck.pointer({type:'mouseMove',...a});
 await window.uiCheck.pointer({type:'mouseDown',...a,button:'left',clickCount:1});
 await window.uiCheck.pointer({type:'mouseMove',...b,button:'left',buttons:1});
 await window.uiCheck.pointer({type:'mouseUp',...b,button:'left',clickCount:1});
 await until(()=>probe.regionFrame.visible,'矩形在画布上');
 executeCommand('copy');await until(()=>document.querySelector('.s-status')?.textContent?.includes('区域已复制'),'复制原版区域');
 assert((await window.uiCheck.stats()).worldRegionCapture===1,'走后台复制入口');
 click(document.querySelector('.s-project-menu')!.textContent!.trim());
 await until(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='新建世界工程'),'新工程菜单');
 click('新建世界工程');
 await until(()=>document.querySelector('.s-project-menu')?.textContent?.includes('区域目标')&&probe.level()?.name==='overworld','打开独立自制地图');
 assert(document.querySelector('[aria-label="大世界显示高度范围"]'),'自制大地图也有 Z 显示范围');
 probe.loadMemory({position:[6,4.8,15],target:[6,5,0],fov:45,up:[0,0,1]});
 await wait(350);
 executeCommand('paste');
 await wait(250);
 const spot=project(6,5,0);
 await window.uiCheck.pointer({type:'mouseMove',...spot});
 await window.uiCheck.pointer({type:'mouseDown',...spot,button:'left',clickCount:1});
 await window.uiCheck.pointer({type:'mouseUp',...spot,button:'left',clickCount:1});
 await until(()=>document.querySelector('[aria-label="粘贴区域"]'),'粘贴确认');
 const dialog=document.querySelector('[aria-label="粘贴区域"]')!;
 for(const select of Array.from(dialog.querySelectorAll<HTMLSelectElement>('select'))){
   if(select.querySelector('option[value="pending"]')){nativeSetter.call(select,'');select.dispatchEvent(new Event('change',{bubbles:true}));}
 }
 const dependencies=dialog.querySelector<HTMLInputElement>('details input[type=checkbox]');
 if(dependencies&&!dependencies.checked)dependencies.click();
 click('确认粘贴');
 await until(()=>document.querySelector('.s-status')?.textContent?.includes('区域已粘贴'),'粘贴成功');
 executeCommand('save');await wait(500);
 saved=await window.uiCheck.saved();
 assert(saved.version===4&&saved.map.entries.length&&saved.levels.some((l:any)=>l.project.template===source!.target),'入口、关卡和三维自制地图一起保存');
 executeCommand('undo');await wait(350);executeCommand('save');await wait(450);
 saved=await window.uiCheck.saved();
 assert(saved.version===4&&!saved.map.entries.length&&!saved.levels.length,'一步撤销区域和关卡');
 await window.uiCheck.finish({checks,manualUiTested:false,nativeGameplayTested:false});}
run().catch(async error=>{await window.uiCheck.capture('region-transfer-failure');await window.uiCheck.finish({checks,error:String(error),stack:error.stack});});
