import {GamePackage} from './package';
import {parseEntities,type EntityRecord} from './entities';
import {PropertyCodec,type PropertyValue} from './properties';
import {applyProject,levelView} from './project';
import {objectFields} from './object-catalog';
import type {EditorProject} from '../shared';

// Rebuild physical and puzzle objects through the same prefab operations used by
// the editor. Native art, cameras, environment and narrative NPCs stay as context.
export const RECREATED_TYPES=new Set(['Guy','Door','Rock','Mirror','Monster','Switch','Gate','Teleporter','Gem','Gem_Slot','Promesst_Light','Fence','Lily','Rover','Wall_Set','Ocean_Map','Stairs','Elevator_Platform','Wardrobe','Artifact']);
export interface RecreationReport {
  template:string;recreated:number;byType:Record<string,number>;idMap:{source:number;rebuilt:number;type:string}[];
  originalIdsRemaining:number[];terrain:{source:number;rebuilt:number;equal:boolean};water:{source:number;rebuilt:number;equal:boolean};
  untouchedContext:number;contextEqual:boolean;differences:{type:string;sourceId:number;field:string;source:PropertyValue;rebuilt:PropertyValue}[];
  ignoredFields:string[];unsupportedReferences:string[];
}
function fallback(c:PropertyCodec,r:EntityRecord,name:string):PropertyValue{
  const s=c.schema(r.type).find(s=>s.name===name)!;
  return s.kind==='bool'?false:s.kind==='string'?'':s.kind==='strings'||s.kind==='array'||s.kind==='fixed'?[]:/^scale\.|^orientation\.w$|^tint_color_[ab]\./.test(name)?1:0;
}
function sortedCells(v:{x:number;y:number;z:number}[]){return v.map(p=>[p.x,p.y,p.z].join(',')).sort();}
export function recreateLevel(pkg:GamePackage,c:PropertyCodec,base:Omit<EditorProject,'operations'>):{project:EditorProject;report:RecreationReport}{
  const original=parseEntities(pkg.get(`data-common/${base.template}.entities`)),records=original.records.filter(r=>RECREATED_TYPES.has(r.type));
  if(!records.some(r=>r.type==='Guy'))throw new Error('测试关卡缺少可操控角色');
  if(records.some(r=>!c.parse(r).complete))throw new Error('测试关卡有未完整解析的玩法对象');
  const ids=new Map(records.map((r,i)=>[r.id,900*0x100000+i+1]));
  const project:EditorProject={...base,operations:[]},unsupportedReferences:string[]=[];
  const place=(r:EntityRecord)=>{const position=['x','y','z'].map(a=>Number(c.get(r,'position.'+a)))as[number,number,number];const name=String(c.get(r,'entity_name',''));project.operations.push({kind:'prefab',id:ids.get(r.id)!,template:base.template,sourceId:r.id,position,...name?{values:{entity_name:name}}:{}});};
  // Add the new actors before deleting the originals so the editor's last-actor
  // safeguard remains active throughout the operation sequence.
  records.filter(r=>r.type==='Guy').forEach(place);
  records.forEach(r=>project.operations.push({kind:'delete',id:r.id}));
  records.filter(r=>r.type!=='Guy').forEach(place);
  for(const r of records){const fields=objectFields(c,r.type),values:Record<string,PropertyValue>={};
    for(const p of c.parse(r).fields){if(!p.schema.pid||Number(p.value)===0)continue;
      const field=fields.find(f=>f.name===p.schema.name),target=ids.get(Number(p.value))??Number(p.value);
      if(field?.access==='design')values[p.schema.name]=target;
      else unsupportedReferences.push(`${r.type} #${r.id}.${p.schema.name} -> ${p.value}`);
    }
    if(Object.keys(values).length)project.operations.push({kind:'properties',id:ids.get(r.id)!,values});
  }
  const rebuilt=applyProject(pkg,project,c),inverse=new Map([...ids].map(([a,b])=>[b,a])),differences:RecreationReport['differences']=[];
  for(const r of records){const copy=rebuilt.records.find(e=>e.id===ids.get(r.id))!;const names=new Set([...c.parse(r).fields,...c.parse(copy).fields].map(f=>f.schema.name));
    for(const name of names){const a=c.get(r,name,fallback(c,r,name));let b=c.get(copy,name,fallback(c,copy,name));const schema=c.schema(r.type).find(s=>s.name===name)!;
      if(schema.pid)b=inverse.get(Number(b))??b;
      if(schema.pidArray)b=(b as number[]).map(n=>inverse.get(n)??n);
      if(JSON.stringify(a)!==JSON.stringify(b))differences.push({type:r.type,sourceId:r.id,field:name,source:a,rebuilt:b});
    }
  }
  const a=levelView(pkg,base.template,original,c),b=levelView(pkg,base.template,rebuilt,c),context=original.records.filter(r=>!RECREATED_TYPES.has(r.type));
  const waters=(v:typeof a)=>v.waters?.map(({id,...p})=>p).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))??[];
  const report:RecreationReport={template:base.template,recreated:records.length,byType:Object.fromEntries([...new Set(records.map(r=>r.type))].map(type=>[type,records.filter(r=>r.type===type).length])),idMap:records.map(r=>({source:r.id,rebuilt:ids.get(r.id)!,type:r.type})),originalIdsRemaining:records.filter(r=>rebuilt.records.some(e=>e.id===r.id)).map(r=>r.id),terrain:{source:a.terrain?.length??0,rebuilt:b.terrain?.length??0,equal:JSON.stringify(sortedCells(a.terrain??[]))===JSON.stringify(sortedCells(b.terrain??[]))},water:{source:a.waters?.length??0,rebuilt:b.waters?.length??0,equal:JSON.stringify(waters(a))===JSON.stringify(waters(b))},untouchedContext:context.length,contextEqual:context.every(r=>rebuilt.records.find(e=>e.id===r.id)?.diff.equals(r.diff)),differences,ignoredFields:[],unsupportedReferences};
  return{project,report};
}
