import {appearancePurpose} from '../render-purpose';
import type {EntityView} from '../shared';

/** Prefer the author's name; unnamed static art is identified by its actual model. */
export function entityLabel(e:EntityView,fallback:string):string {
 const name=e.nativeProperties?.find(p=>p.field.name==='entity_name')?.value;
 if(typeof name==='string'&&name.trim())return name.trim();
 const purpose=appearancePurpose(e);if(purpose==='effect')return (/Nebula/i.test(e.mesh)?'星云特效载体':e.materials?.some(m=>/^smoke/i.test(m))?'烟雾特效载体':'云层／环境特效载体')+' · '+e.mesh;if(purpose==='helper')return '编辑辅助／隐藏布景 · '+(e.mesh||fallback);if(!['Inanimate','Decal','Animating','Procedurally_Animating','Statue'].includes(e.type))return fallback;
 if(!e.mesh)return e.type==='Decal'?'贴花 · '+(e.materials?.find(Boolean)??'未命名'):fallback;
 const family=/^ISLE_/i.test(e.mesh)?'岛屿模型':/^TER_TILE_/i.test(e.mesh)||/_Tile_/i.test(e.mesh)?'地砖':/^FOL_/i.test(e.mesh)?'植物':/^TER_MTN_|^TER_Canyon_/i.test(e.mesh)?'山岩模型':/^ARCH_/i.test(e.mesh)?'建筑模型':e.type==='Decal'?'贴花':'模型';
 const model=e.mesh.replace(/^(ISLE_|TER_TILE_|TER_MTN_|FOL_|ARCH_)/i,'').replace(/_/g,' ');
 return family+' · '+model;
}
