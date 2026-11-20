import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {wrappedScreenOrigin,wrapScreenPoint,screenAlignedTopology,screenWrappingWarnings} from '../src/screen-wrapping';
import {screenAt,screenLayout,plannedScreens} from '../src/camera-layout';
import {roomPowerObjects} from '../src/room-power';
import {cameraFrame,cameraObjectChange,poseCameraChange} from '../src/camera-math';
import {nativeScreenPose} from '../src/camera-pose';
import {GamePackage,sha256} from '../src/core/package';
import {ExeReflection} from '../src/core/reflection';
import {PropertyCodec} from '../src/core/properties';
import {applyProject,levelView} from '../src/core/project';
import {createBlank} from '../src/core/blank';
import {writeEntities} from '../src/core/entities';
import type {LevelView,TopologyConfig,Vec3} from '../src/shared';

const topology:TopologyConfig={corner:[3,0,-3],size:[15,15,6],wrapping:true,wrappingOverride:0,forceWrappingOverride:false};

test('循环分屏按整屏重定编号，不移动实际网格，跨接缝返回对应房间',()=>{
 const origin=wrappedScreenOrigin([3,5],[5,5],topology);
 assert.deepEqual(origin,[3,0]);
 for(const point of [[3,0,0],[17,14,0],[18,15,2],[-12,-15,-2]] as Vec3[]){
  const wrapped=wrapScreenPoint(point,topology);
  assert.ok(wrapped[0]>=3&&wrapped[0]<=17&&wrapped[1]>=0&&wrapped[1]<=14);
  assert.equal(wrapped[2],point[2]);
  const old=screenAt(wrapped,[3,5],[5,5]),next=screenAt(wrapped,origin,[5,5]);
  assert.deepEqual(next,[old[0],old[1]+1]);
 }
 assert.deepEqual(wrapScreenPoint([2,7,4],topology),[17,7,4]);
 assert.deepEqual(wrapScreenPoint([18,7,4],topology),[3,7,4]);
});

test('循环关的导航和供电预览使用完整循环范围，排除远处地形对屏数的干扰',()=>{
 const level={name:'wrap',typeCount:0,manifest:'',topology,terrain:[{x:100,y:100,z:0}],camera:{perScreen:true,origin:[3,5],screenSize:[5,5],controls:[]},entities:[{id:1,type:'Gem_Slot',position:[18,15,0]},{id:2,type:'Promesst_Light',position:[3,0,0]},{id:3,type:'Promesst_Light',position:[3,0,8]}]} as unknown as LevelView;
 const layout=screenLayout(level),plan=plannedScreens(level);
 assert.deepEqual(layout.origin,[3,5]);
 assert.deepEqual(plan,{start:[0,-1],columns:3,rows:3,automatic:true});
 const power=roomPowerObjects(level,layout,0);
 assert.equal(power.length,2);
 assert.deepEqual(power[0].room,power[1].room);
 assert.deepEqual(power[0].at,[3,0,0]);
 assert.deepEqual(plannedScreens(level,undefined,{start:[0,-1],columns:3,rows:3}).start,[0,-1]);
});

test('循环对齐只向外扩展 X/Y，报告截断房间的接缝并保留高度与原参数',()=>{
 const old={...topology,corner:[-4,-3,-3] as Vec3,size:[17,19,6] as Vec3};
 const before=JSON.stringify(old),result=screenAlignedTopology(old,[3,5],[5,5]);
 assert.ok(screenWrappingWarnings([3,5],[5,5],old).length>0);
 assert.equal(screenWrappingWarnings([3,5],[5,5],result).length,0);
 assert.deepEqual(result.corner,[-7,-5,-3]);
 assert.deepEqual(result.size,[20,25,6]);
 assert.equal(JSON.stringify(old),before);
 assert.deepEqual(wrappedScreenOrigin([0,0],[5,5],{...old,wrapping:false}),[0,0]);
});

const root=process.env.SINKING_STAR_GAME??'';
test('分屏姿态优先写入游戏，普通镜头保存值不覆盖分屏，循环配置重开一致',{skip:!fs.existsSync(root+'/sinking_star.exe')},()=>{
 const pkg=new GamePackage(fs.readFileSync(root+'/data/levels.package'));
 const codec=new PropertyCodec(new ExeReflection(fs.readFileSync(root+'/sinking_star.exe')));
 const project={...createBlank(sha256(pkg.buffer),'test'),version:3 as const,topology};
 const first=levelView(pkg,project.template,applyProject(pkg,project,codec),codec),id=first.camera!.controls[0].id;
 const frame={position:[5,-12,18] as Vec3,target:[5,2,0] as Vec3,up:[0,0,1] as Vec3};
 const screen=poseCameraChange(first,{mode:'screens',origin:[3,5],screenSize:[5,5]},id,[0,0],frame);
 const config=cameraObjectChange(screen,id,{position:[70,60,45],target:[70,60,0],up:[0,1,0]});
 const expected=nativeScreenPose(config.controls![0].pose!)!;
 assert.ok(expected);
 const built=applyProject(pkg,JSON.parse(JSON.stringify({...project,camera:config})),codec);
 const record=built.records.find(r=>r.id===id)!;
 assert.ok(Math.abs(Number(codec.get(record,'up_distance'))-expected.upDistance)<1e-5);
 assert.ok(Math.abs(Number(codec.get(record,'south_distance'))-expected.southDistance)<1e-5);
 const view=levelView(pkg,project.template,built,codec);
 assert.deepEqual(view.camera!.origin,[3,0]);
 assert.deepEqual(screenLayout(view,config).origin,[3,5]);
 const preview=cameraFrame(view,config,id,[0,0])!;
 assert.ok(Math.abs(preview.position[2]-expected.upDistance)<1e-5);
 assert.deepEqual(writeEntities(applyProject(pkg,JSON.parse(JSON.stringify({...project,camera:config})),codec)),writeEntities(built));
 const untouched={...project,topology:undefined,camera:undefined,base:undefined,template:'promesst1_streamlined'};
 assert.deepEqual(writeEntities(applyProject(pkg,untouched,codec)),pkg.get('data-common/promesst1_streamlined.entities'));
});
