import {GamePackage} from './package';
import {PropertyCodec} from './properties';
import {parseEntities} from './entities';
import {applyProject,projectSources} from './project';
import {captureRegion} from './regions';
import {upgradeWorld} from './migrate';
import {validateWorld} from './world';
import type {WorldProject,EditOp,RegionSelection,Vec3} from '../shared';

interface CaptureRecipe {kind:'capture-level';id:number;sourceLevel:string;selection:RegionSelection;position:Vec3;yaw:number;name:string}
export interface ExampleRecipe {format:'sstar-example-recipe';version:1;world:unknown;checks?:{template:string;id:number;type:string}[]}
/** Recipes contain design intent only. Every native byte is obtained from the local game. */
export function materializeExample(recipe:ExampleRecipe,pkg:GamePackage,c:PropertyCodec,hash:string,build:string):WorldProject {
  if(recipe.format!=='sstar-example-recipe'||recipe.version!==1)throw Error('示例设计描述格式无效');
  const forbid=(value:unknown)=>{if(!value||typeof value!=='object')return;for(const [k,v]of Object.entries(value)){if(['diff','sourceHash','sourceBuild'].includes(k))throw Error('公开示例不能携带原生快照或固定游戏来源');forbid(v);}};forbid(recipe.world);
  for(const check of recipe.checks??[]){const r=parseEntities(pkg.get(`data-common/${check.template}.entities`)).records.find(r=>r.id===check.id);if(!r||r.type!==check.type||!c.parse(r).complete)throw Error(`当前游戏缺少示例预设：${check.template} / ${check.type} #${check.id}`);}
  const w=structuredClone(recipe.world) as WorldProject;w.sourceHash=hash;w.sourceBuild=build;
  const completed=new Map<string,WorldProject['levels'][number]>();
  for(const level of w.levels){
    level.project.sourceHash=hash;level.project.sourceBuild=build;
    const operations:EditOp[]=[];
    for(const op of level.project.operations as (EditOp|CaptureRecipe)[]){
      if(op.kind!=='capture-level'){operations.push(op);continue;}
      const from=completed.get(op.sourceLevel);if(!from)throw Error(`示例引用的先前关卡不存在：${op.sourceLevel}`);
      const file=applyProject(pkg,from.project,c),bundle=captureRegion(c,file,from.project,op.selection,projectSources(from.project));bundle.name=op.name;
      operations.push({kind:'stamp',id:op.id,bundle,position:op.position,yaw:op.yaw});
    }
    level.project.operations=operations;
    try{applyProject(pkg,level.project,c);}catch(e){throw Error(`示例「${level.title}」与当前游戏不兼容：${String(e)}`);}
    completed.set(level.id,level);
  }
  validateWorld(w);return upgradeWorld(w);
}
