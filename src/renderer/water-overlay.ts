import*as T from'three';import type{WaterView,LevelView}from'../shared';import{waterDirections,waterDirection,waterWet,WaterOcclusion}from'../water-edit';
export class WaterOverlay {
 readonly root=new T.Group();private cache=new Map<number,{water:WaterView;mesh:T.InstancedMesh|null}>();private cover=new WaterOcclusion();
 update(water:WaterView|undefined,visible:boolean,terrain?:LevelView['terrain']){this.updateAll(visible&&water?[water]:[],terrain);}
 updateAll(waters:WaterView[],terrain?:LevelView['terrain']){this.root.visible=waters.length>0;const changed=this.cover.update(terrain),keep=new Set(waters.map(w=>w.id));for(const id of this.cache.keys())if(!keep.has(id))this.remove(id);for(const water of waters){const old=this.cache.get(water.id);if(old?.water===water&&!changed)continue;this.remove(water.id);this.cache.set(water.id,{water,mesh:null});const cells=water.cells.flatMap((v,i)=>waterWet(v)&&waterDirection(v)>=1&&waterDirection(v)<=4&&!this.cover.covers(water.x+i%water.width,water.y+Math.floor(i/water.width),water.z)?[i]:[]);if(!cells.length)continue;
 const mesh=new T.InstancedMesh(waterArrowGeometry(),new T.MeshBasicMaterial({color:0xb4f0ff,transparent:true,opacity:.9,depthWrite:false,side:T.DoubleSide}),cells.length),dummy=new T.Object3D();for(const[i,index]of cells.entries()){const d=waterDirections[waterDirection(water.cells[index])];dummy.position.set(water.x+index%water.width,water.y+Math.floor(index/water.width),water.z+.025);dummy.rotation.set(0,0,Math.atan2(d.dy,d.dx)-Math.PI/2);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.renderOrder=6;mesh.userData.waterId=water.id;this.root.add(mesh);this.cache.set(water.id,{water,mesh});}}
 private remove(id:number){const m=this.cache.get(id)?.mesh;if(m){m.dispose();m.geometry.dispose();(m.material as T.Material).dispose();this.root.remove(m);}this.cache.delete(id);}
 clear(){for(const id of this.cache.keys())this.remove(id);}
 dispose(){this.clear();}
}

export function waterArrowGeometry(){const shape=new T.Shape();shape.moveTo(-.12,-.32);shape.lineTo(.12,-.32);shape.lineTo(.12,.03);shape.lineTo(.3,.03);shape.lineTo(0,.36);shape.lineTo(-.3,.03);shape.lineTo(-.12,.03);shape.closePath();return new T.ShapeGeometry(shape);}
