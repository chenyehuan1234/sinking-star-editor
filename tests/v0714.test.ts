import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,MeshStandardMaterial,Group,Mesh,BoxGeometry} from 'three';
import {bevelCube,lensAxisReason,lensDirectionReason,lensPoseForDirection,transformLens} from '../src/view-navigation';
import {terrainGridMaterial,setTerrainGrid} from '../src/renderer/terrain-grid';

test('倒角立方体具有 6 主面、8 切角、12 切棱，法线和面顶点一致',()=>{
 const faces=bevelCube();assert.equal(faces.length,26);assert.equal(new Set(faces.map(f=>f.key)).size,26);
 for(const [count,expected]of [[1,6],[2,12],[3,8]])assert.equal(faces.filter(f=>f.direction.filter(Boolean).length===count).length,expected);
 for(const face of faces){assert.ok(face.vertices.length>=3);const normal=new Vector3(...face.direction),distance=normal.dot(new Vector3(...face.vertices[0]));for(const p of face.vertices)assert.ok(Math.abs(normal.dot(new Vector3(...p))-distance)<1e-6);const [a,b,c]=face.vertices.map(v=>new Vector3(...v));assert.ok(b.sub(a).cross(c.sub(a)).dot(normal)>0);}
});
const pose={target:[3,4,2]as[number,number,number],upDistance:20,southDistance:10,yaw:0};
test('镜头方向对齐保留取景中心与距离，不伪造不支持方向',()=>{for(const face of bevelCube()){const reason=lensDirectionReason(face.direction);if(face.direction[2]<=0){assert.ok(reason);assert.throws(()=>lensPoseForDirection(pose,face.direction));}else{assert.equal(reason,'');const next=lensPoseForDirection(pose,face.direction);assert.deepEqual(next.target,pose.target);assert.ok(Math.abs(Math.hypot(next.upDistance,next.southDistance)-Math.hypot(20,10))<1e-6);}}assert.ok(lensDirectionReason([1,-1,1],true));assert.equal(lensDirectionReason([0,-1,1],true),'');});
test('镜头三轴平移和绕中心旋转保留身份、距离、中心且不改原值',()=>{const before=JSON.stringify(pose);for(let axis=0;axis<3;axis++){const moved=transformLens(pose,'translate',axis,3);assert.equal(moved.target[axis],pose.target[axis]+3);const rotated=transformLens(pose,'rotate',axis,.2);assert.deepEqual(rotated.target,pose.target);assert.ok(Math.abs(Math.hypot(rotated.upDistance,rotated.southDistance)-Math.hypot(20,10))<1e-6);}assert.equal(JSON.stringify(pose),before);assert.throws(()=>transformLens(pose,'rotate',0,Math.PI));assert.ok(lensAxisReason('translate',0,true,false));assert.ok(lensAxisReason('rotate',2,false,true));});
test('地形格线开关只修改共享 uniform，不重建几何和材质',()=>{const root=new Group(),material=terrainGridMaterial(new MeshStandardMaterial()),mesh=new Mesh(new BoxGeometry(),material);root.add(mesh);const version=material.version,geometry=mesh.geometry;setTerrainGrid(root,false);assert.equal(material.userData.terrainGrid.value,0);setTerrainGrid(root,true);assert.equal(material.userData.terrainGrid.value,1);assert.equal(material.version,version);assert.equal(mesh.geometry,geometry);geometry.dispose();material.dispose();});
