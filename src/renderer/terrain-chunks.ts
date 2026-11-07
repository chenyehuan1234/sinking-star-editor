import{waterWet,WaterOcclusion}from'../water-edit';
import * as T from 'three';
import type {LevelView} from '../shared';
import {chunkTerrain} from '../preview-delta';
import {heightVisibility,type SceneDisplay} from './scene-display';
export class TerrainChunks {
 private waterCover=new WaterOcclusion();
 private cached=new Map<string,{cells:unknown[];style:string;mesh:T.InstancedMesh}>();
 constructor(readonly root:T.Group){}
 update(level:LevelView|null,d:SceneDisplay,layer:number,design:boolean,collision:boolean){
  this.waterCover.update(level?.terrain);const keep=new Set<string>(),style=JSON.stringify([d.mode,d.min,d.max,d.follow,d.upper,layer,design]);
  const put=(key:string,cells:unknown[],positions:T.Vector3[],water:boolean,faded:boolean)=>{keep.add(key);const old=this.cached.get(key),signature=style+':'+water+':'+faded+(water?':'+this.waterCover.revision:'');let mesh=old?.mesh;
   if(!old||old.style!==signature||old.cells.length!==cells.length||cells.some((c,i)=>c!==old.cells[i])){if(old)this.remove(key);mesh=new T.InstancedMesh(water?new T.PlaneGeometry(1,1):new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:water?0x4b9bb9:0x84978b,roughness:.95,side:water?T.DoubleSide:T.FrontSide,transparent:water||faded,opacity:faded?.14:water?.5:1,depthWrite:!water&&!faded,wireframe:!water&&!design,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}),positions.length);const matrix=new T.Matrix4();positions.forEach((p,i)=>mesh!.setMatrixAt(i,matrix.makeTranslation(p.x,p.y,p.z)));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.root.add(mesh);this.cached.set(key,{cells,style:signature,mesh});}
   mesh!.visible=water?d.categories.water.visible:(design||collision)&&d.categories.terrain.visible;mesh!.userData.support=!faded&&!(water?d.categories.water.locked:d.categories.terrain.locked);mesh!.userData.faded=faded;
  };
  for(const[key,cells]of chunkTerrain(level?.terrain??[]))for(const faded of[false,true]){const shown=cells.filter(c=>heightVisibility(c.z,d,layer)===(faded?'faded':'visible'));if(shown.length)put(key+':'+faded,shown,shown.map(c=>new T.Vector3(c.x,c.y,c.z-.5)),false,faded);}
  for(const w of level?.waters??[]){if(d.objects?.[`entity:${w.id}`]?.hidden)continue;const vis=heightVisibility(w.gridZ??w.z,d,layer);if(vis==='hidden')continue;const positions=w.cells.flatMap((v,i)=>waterWet(v)&&!this.waterCover.covers(w.x+i%w.width,w.y+Math.floor(i/w.width),w.z)?[new T.Vector3(w.x+i%w.width,w.y+Math.floor(i/w.width),w.z)]:[]);if(positions.length)put('water:'+w.id,[w],positions,true,vis==='faded');}
  for(const key of this.cached.keys())if(!keep.has(key))this.remove(key);
 }
 private remove(key:string){const v=this.cached.get(key);if(!v)return;this.root.remove(v.mesh);v.mesh.dispose();v.mesh.geometry.dispose();(v.mesh.material as T.Material).dispose();this.cached.delete(key);}
 dispose(){for(const key of this.cached.keys())this.remove(key);}
}
