import {cameraFrame,cameraObjectFrame,cameraViewFrame} from '../src/camera-math';
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {cameraPanelState,cameraPanelSelection,cameraNumber,cameraUsage,filterPanelCameras} from '../src/camera-panel-state';
import type {CameraView,NativeCameraView,CameraObjectRequest} from '../src/shared';
import {GamePackage,sha256} from '../src/core/package';import {ExeReflection} from '../src/core/reflection';import {PropertyCodec} from '../src/core/properties';
import {createBlank} from '../src/core/blank';import {applyProject,levelView} from '../src/core/project';import {writeEntities} from '../src/core/entities';import {EditorService} from '../src/main/service';
const camera=(id:number,name:string,primary=true,overview=false)=>({id,name,primary,overview,position:[1,2,3]}as NativeCameraView);
test('面板首次打开只有规则与清单展开，损坏偏好安全回退，不修改原对象',()=>{
 const a=cameraPanelState();assert.deepEqual(Object.keys(a.open).filter(k=>a.open[k as keyof typeof a.open]),['rules','list']);
 const value={open:{parameters:true,regions:true,list:false},selection:{kind:'camera',id:19},query:'side',search:true,scroll:180},before=JSON.stringify(value),next=cameraPanelState(value);
 assert.equal(next.open.parameters,true);assert.equal(next.open.rules,true);assert.equal(next.open.list,false);assert.deepEqual(next.selection,value.selection);assert.equal(JSON.stringify(value),before);
 assert.equal(cameraPanelState({selection:{kind:'camera',id:-1},query:9,scroll:NaN}).selection,null);assert.equal(cameraPanelState(null).scroll,0);
});
test('清单可按名称、用途和ID搜索，不排序或更改原生名称',()=>{
 const cameras=[camera(1,'View'),camera(2,'side',false),camera(3,'overhead_downstairs',true,true)],before=JSON.stringify(cameras);
 assert.deepEqual(filterPanelCameras(cameras,'VIEW').map(c=>c.id),[1]);assert.deepEqual(filterPanelCameras(cameras,'额外').map(c=>c.id),[2]);assert.deepEqual(filterPanelCameras(cameras,'3').map(c=>c.id),[3]);assert.deepEqual(cameras.map(cameraUsage),['正常游玩','额外视角','地图总览']);assert.equal(JSON.stringify(cameras),before);
});
test('恢复选择以稳定ID校验，失效镜头回主镜头，区域不会被误选为相机',()=>{
 const view={controls:[camera(4,'side',false),camera(8,'main')],regions:[{id:9}]}as CameraView;
 assert.deepEqual(cameraPanelSelection(view,{kind:'region',id:9}),{kind:'region',id:9});assert.deepEqual(cameraPanelSelection(view,{kind:'camera',id:9}),{kind:'camera',id:8});assert.deepEqual(cameraPanelSelection(view,{kind:'camera',id:4}),{kind:'camera',id:4});assert.equal(cameraPanelSelection(undefined,{kind:'camera',id:4}),null);
});
test('三位小数仅格式化展示，不改写六轴原始精度',()=>{
 const value=60.00993763917974;assert.equal(cameraNumber(value),'60.01');assert.equal(value,60.00993763917974);assert.equal(cameraNumber(-0.00001),'0');assert.equal(cameraNumber(123.45678),'123.457');
});
const game=process.env.SINKING_STAR_GAME??'',available=fs.existsSync(game+'/sinking_star.exe');
test('新增额外视角原子写入辅助用途，复制依赖与原相机保持独立，一次恢复可撤销',{skip:!available},async()=>{
 const pkg=new GamePackage(fs.readFileSync(game+'/data/levels.package')),codec=new PropertyCodec(new ExeReflection(fs.readFileSync(game+'/sinking_star.exe'))),p=createBlank(sha256(pkg.buffer),'native-test'),before=JSON.stringify(p),bytes=writeEntities(applyProject(pkg,p,codec));
 const service=Object.assign(new EditorService('workspace'),{pkg,codec,checkProject:async()=>{}}),request:CameraObjectRequest={action:'create',kind:'play',role:'aux',position:[0,0,0]};
 const config=await service.cameraObject(p,request),out=applyProject(pkg,{...p,camera:config},codec),view=levelView(pkg,p.template,out,codec),extra=view.camera!.controls.find(c=>!c.primary&&!c.overview)!;
 assert.ok(extra);assert.deepEqual(extra.position,view.camera!.controls.find(c=>c.primary&&!c.overview)!.position);assert.equal(view.camera!.controls.filter(c=>c.primary&&!c.overview).length,1);assert.equal(JSON.stringify(p),before);assert.deepEqual(writeEntities(applyProject(pkg,p,codec)),bytes);
 const next=await service.cameraObject({...p,camera:config},request),again=levelView(pkg,p.template,applyProject(pkg,{...p,camera:next},codec),codec);assert.equal(new Set(again.camera!.controls.map(c=>c.name)).size,again.camera!.controls.length);
 await assert.rejects(()=>service.cameraObject(p,{action:'create',kind:'overview',role:'aux',position:[0,0,0]}),/用途无效/);
});

test('只读导航与镜头编辑共用取景，普通、辅助、总览均保留原始世界姿态',()=>{
 const l={name:'camera-views',entities:[],typeCount:0,manifest:'',camera:{perScreen:true,screenSize:[8,9],origin:[-8,0],margins:[0,0],regions:[],controls:[1,2,3].map(id=>({id,name:'camera'+id,primary:id===1,overview:id===3,position:[id*10,7,18],rotation:[0,0,0,1],upDistance:18,southDistance:12,fov:35,panRate:.35}))}}as import('../src/shared').LevelView;
 const config={mode:'screens' as const,controls:[{id:2,nativePose:{position:[2,3,4]as import('../src/shared').Vec3,target:[8,-2,1]as import('../src/shared').Vec3,up:[0,1,0]as import('../src/shared').Vec3}}]},before=JSON.stringify({l,config});
 for(const aspect of[16/9,4/3,21/9,0.8])for(const id of[1,2,3])assert.deepEqual(cameraViewFrame(l,config,{kind:'camera',id},aspect),cameraObjectFrame(l,config,id,aspect));
 assert.deepEqual(cameraViewFrame(l,config,{kind:'camera',id:3})!.position,[30,7,18]);assert.equal(cameraViewFrame(l,config,{kind:'camera',id:999}),null);
 for(const room of[[-2,-1],[0,0],[3,4]]as[number,number][])assert.deepEqual(cameraViewFrame(l,config,{kind:'screen',id:1,room}),cameraFrame(l,config,1,room));
 assert.notDeepEqual(cameraViewFrame(l,config,{kind:'camera',id:1}),cameraViewFrame(l,config,{kind:'screen',id:1,room:[0,0]}));assert.equal(JSON.stringify({l,config}),before);
});
