import*as T from'three';import type{WaterView,LevelView}from'../shared';import{waterDirections,waterDirection,waterWet,WaterOcclusion}from'../water-edit';
export class WaterOverlay {
 readonly root=new T.Group();private water:WaterView|undefined;private visible=false;private cover=new WaterOcclusion();
 update(water:WaterView|undefined,visible:boolean,terrain?:LevelView['terrain']){this.root.visible=visible;const changed=this.cover.update(terrain);if(water===this.water&&visible===this.visible&&!changed)return;this.water=water;this.visible=visible;this.clear();if(!water||!visible)return;const cells=water.cells.flatMap((v,i)=>waterWet(v)&&waterDirection(v)>=1&&waterDirection(v)<=4&&!this.cover.covers(water.x+i%water.width,water.y+Math.floor(i/water.width),water.z)?[i]:[]);if(!cells.length)return;
 const mesh=new T.InstancedMesh(waterArrowGeometry(),new T.MeshBasicMaterial({color:0xb4f0ff,transparent:true,opacity:.9,depthWrite:false,side:T.DoubleSide}),cells.length),dummy=new T.Object3D();for(const[i,index]of cells.entries()){const d=waterDirections[waterDirection(water.cells[index])];dummy.position.set(water.x+index%water.width,water.y+Math.floor(index/water.width),water.z+.025);dummy.rotation.set(0,0,Math.atan2(d.dy,d.dx)-Math.PI/2);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.renderOrder=6;this.root.add(mesh);}
 clear(){for(const child of [...this.root.children]){const m=child as T.InstancedMesh;m.dispose();m.geometry.dispose();(m.material as T.Material).dispose();this.root.remove(child);}}
 dispose(){this.clear();}
}

export function waterArrowGeometry(){const shape=new T.Shape();shape.moveTo(-.12,-.32);shape.lineTo(.12,-.32);shape.lineTo(.12,.03);shape.lineTo(.3,.03);shape.lineTo(0,.36);shape.lineTo(-.3,.03);shape.lineTo(-.12,.03);shape.closePath();return new T.ShapeGeometry(shape);}
