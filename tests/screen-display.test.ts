import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,OrthographicCamera,PerspectiveCamera,Vector3} from 'three';
import {projectScreenSegment} from '../src/screen-line-projection';
import {terrainFaceColor} from '../src/terrain-paint';

test('地形取样使用命中面颜色，未刷色面采用关卡默认色和中性色',()=>{
  const cells=[{x:2,y:3,z:5,colors:{4:'#23a98d',0:'#b4673e'}}];
  assert.equal(terrainFaceColor(cells,[2,3,4],[0,0,1],{floor:'#ffffff'}),'#23a98d');
  assert.equal(terrainFaceColor(cells,[2,3,4],[1,0,0],{wall:'#ffffff'}),'#b4673e');
  assert.equal(terrainFaceColor(cells,[2,3,4],[-1,0,0],{wall:'#738fad'}),'#738fad');
  assert.equal(terrainFaceColor(cells,[2,3,4],[-1,0,0]),'#84978b');
  assert.equal(terrainFaceColor([{x:2,y:3,z:-2,colors:{4:'#aa6655'}}],[2,3,-3],[0,0,1]),'#aa6655');
});

test('边界投影裁去相机背面和近裁面外部分，输出始终处于视口内',()=>{
  const camera=new PerspectiveCamera(45,16/9,.1,2000);
  camera.position.set(0,-5,2);
  camera.up.set(0,0,1);
  camera.lookAt(0,0,0);
  camera.updateMatrixWorld();
  const matrix=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const visible=projectScreenSegment(new Vector3(-10000,0,0),new Vector3(10000,0,0),matrix)!;
  assert.ok(visible);
  assert.ok(visible.every(n=>Number.isFinite(n)&&Math.abs(n)<=1+1e-8));
  const crossing=projectScreenSegment(new Vector3(0,-20,0),new Vector3(0,20,0),matrix)!;
  assert.ok(crossing);
  assert.ok(crossing.every(n=>Number.isFinite(n)&&Math.abs(n)<=1+1e-8));
  assert.equal(projectScreenSegment(new Vector3(-1,-20,0),new Vector3(1,-20,0),matrix),null);
});

test('正交俯视、侧视和透视使用相同的边界端点投影，不产生宽线三角形',()=>{
  for(const camera of [new OrthographicCamera(-10,10,10,-10,.1,100),new PerspectiveCamera(45,4/3,.1,100)]){
    camera.position.set(0,0,20);
    camera.up.set(0,1,0);
    camera.lookAt(0,0,0);
    camera.updateMatrixWorld();
    const matrix=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const start=new Vector3(-2,3,0),end=new Vector3(2,3,0);
    const result=projectScreenSegment(start,end,matrix)!;
    const a=start.clone().project(camera),b=end.clone().project(camera);
    assert.deepEqual(result,[a.x,a.y,b.x,b.y]);
    camera.position.set(20,0,0);
    camera.up.set(0,0,1);
    camera.lookAt(0,0,0);
    camera.updateMatrixWorld();
    matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const side=projectScreenSegment(new Vector3(0,-5,0),new Vector3(0,5,0),matrix)!;
    assert.ok(side&&side.every(n=>Number.isFinite(n)&&Math.abs(n)<=1));
  }
});
