import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {EditorCamera, keyPanOffset, viewportXY, zoomEditorCamera} from '../src/editor-camera';
import {bindingsOverlap, commandScopes, validateBindings} from '../src/input-config';

for(const orthographic of [false,true])test(`指针锚定缩放穿过旧距离限制 · ${orthographic?'正交':'透视'}`,()=>{
 const camera=new EditorCamera(45,1.6,.05,200000);
 const target=new T.Vector3(1200,-450,0),anchor=new T.Vector3(2500,600,0);
 camera.position.copy(target).add(new T.Vector3(0,-12000,61000));
 camera.up.set(0,0,1);camera.lookAt(target);camera.setProjection(orthographic,camera.position.distanceTo(target));
 camera.updateMatrixWorld();
 const a=anchor.clone().project(camera);
 const before=viewportXY(camera,target,[0]).getSize(new T.Vector2()).length();
 for(let i=0;i<85;i++){zoomEditorCamera(camera,target,anchor,.84,200000);camera.lookAt(target);camera.updateMatrixWorld();}
 const b=anchor.clone().project(camera);
 assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-6);
 assert.ok(viewportXY(camera,target,[0]).getSize(new T.Vector2()).length()<before/500);
 assert.ok([camera.position,target].flatMap(v=>v.toArray()).every(Number.isFinite));
});

test('方向键按画面平移，默认键位与物件微移按操作状态区分',()=>{
 const camera=new EditorCamera();camera.position.set(0,-10,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const offset=keyPanOffset(camera.quaternion,100,[1,0]);
 assert.ok(offset.distanceTo(new T.Vector3(2.5,0,0))<1e-6);
 assert.deepEqual(commandScopes('viewPanRight'),['idle','camera']);
 assert.equal(bindingsOverlap('viewPanRight','nudgeEast'),false);
 const migrated=validateBindings({focus:['ArrowRight']});
 assert.deepEqual(migrated.focus,['ArrowRight']);
 assert.deepEqual(migrated.viewPanRight,[]);
});
