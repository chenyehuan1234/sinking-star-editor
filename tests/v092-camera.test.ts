import {test} from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {panCamera,cameraTarget,cameraFrame} from '../src/camera-math';
import {axisPixels,toggleConstraint} from '../src/camera-gestures';
import {screenAt,screenCenter,screenCoverage,cameraLayer} from '../src/camera-layout';
import {transformLens} from '../src/view-navigation';
import {defaultBindings,validateBindings,commandScopes} from '../src/input-config';
import type {LevelView} from '../src/shared';
test('镜头抓住场景平移：四个水平朝向上下拖动均同向，Z 不变',()=>{
 for(const yaw of[0,90,180,-90]){const a=yaw*Math.PI/180,q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),a),up=new T.Vector3(0,1,0).applyQuaternion(q),right=new T.Vector3(1,0,0).applyQuaternion(q);
 const at=panCamera([0,0,7],yaw,.1,0,-10),horizontal=panCamera([0,0,7],yaw,.1,10,0);
 assert.ok(new T.Vector3(...at).setZ(0).dot(up)<0);assert.ok(new T.Vector3(...horizontal).setZ(0).dot(right)<0);assert.equal(at[2],7);}
});
test('轴朝向视线时仍能用上下拖动微调；约束切换可解除',()=>{assert.equal(axisPixels(new T.Quaternion(),2,0,-25),25);assert.equal(axisPixels(new T.Quaternion(),0,25,0),25);assert.deepEqual(toggleConstraint({action:'rotate',axis:0},0),{action:'rotate',axis:null});const pose={target:[4,6,3]as[number,number,number],upDistance:20,southDistance:10,yaw:0},next=transformLens(pose,'rotate',2,Math.PI/2);assert.deepEqual(next.target,pose.target);assert.ok(Math.abs(Math.hypot(next.upDistance,next.southDistance)-Math.hypot(20,10))<1e-8);});
test('分屏负坐标、半整数边界和每屏中心一致，不按地面生成相机副本',()=>{assert.deepEqual(screenAt([-.5,-.5,0],[0,0],[10,8]),[0,0]);assert.deepEqual(screenAt([-.501,-.501,0],[0,0],[10,8]),[-1,-1]);assert.deepEqual(screenAt([9.5,7.5,0],[0,0],[10,8]),[1,1]);assert.deepEqual(screenCenter([-1,2],[-3,4],[10,8],7),[-8.5,23.5,7]);assert.deepEqual(screenCoverage(new T.Box3(new T.Vector3(-.5,-.5,0),new T.Vector3(39.5,19.5,1)),[0,0],[10,10]),{low:[0,0],high:[3,1],columns:4,rows:2});});
test('多高度未关联镜头不再采用第一名角色高度，原生目标优先',()=>{const level={name:'layers',entities:[{type:'Guy',position:[0,0,-20]},{type:'Guy',position:[1,0,30]}],camera:{perScreen:true,origin:[0,0],screenSize:[10,10],margins:[0,0],regions:[],controls:[{id:1,name:'ground',position:[0,-8,18],rotation:[0,0,0,1],upDistance:18,southDistance:8,fov:45,panRate:1,primary:true,overview:false}]}}as unknown as LevelView;
 assert.equal(cameraLayer(level,1).known,false);assert.equal(cameraTarget(level,level.camera!.controls[0])[2],0);level.camera!.controls[0].resolvedTarget=[2,4,30];assert.equal(cameraLayer(level,1).z,30);assert.deepEqual(cameraTarget(level,level.camera!.controls[0]),[2,4,30]);const original=JSON.stringify(level);const a=cameraFrame(level,undefined,1,[0,0])!,b=cameraFrame(level,undefined,1,[1,2])!;assert.deepEqual(b.position.map((n,i)=>n-a.position[i]),[10,20,0]);assert.equal(JSON.stringify(level),original);
});
test('G/R/XYZ 在镜头作用域绑定；旧自定义键不重置，冲突新增键留空',()=>{const defaults=defaultBindings();assert.doesNotThrow(()=>validateBindings(defaults));assert.deepEqual(commandScopes('cameraMove'),['camera']);assert.ok(!commandScopes('snap').includes('camera'));const old=Object.fromEntries(Object.entries(defaults).filter(([id])=>!/^camera(Move|Rotate|Axis)/.test(id)));old.snap=[];old.camera=['KeyG'];const migrated=validateBindings(old);assert.deepEqual(migrated.camera,['KeyG']);assert.deepEqual(migrated.cameraMove,[]);assert.deepEqual(migrated.cameraRotate,['KeyR']);});
