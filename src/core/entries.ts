import type{WorldProject,EditOp}from'../shared';import type{EntityFile}from'./entities';import type{PropertyCodec}from'./properties';
/** Upgrade loose native entrances without changing the source file on disk. */
export function migrateEntrances(world:WorldProject,file:EntityFile,c:PropertyCodec):WorldProject{
  const loose=file.records.filter(r=>r.type==='Level_Entry'&&(r.id>>>20)===900);if(!loose.length)return world;
  const w=structuredClone(world),ids=new Set(loose.map(r=>r.id));
  for(const r of loose){const target=String(c.get(r,'level_name','')),level=w.levels.find(l=>[l.id,l.project.name,`ed_${w.id}_${l.id}`].includes(target)),proto=w.map.objects?.find(op=>op.kind==='prefab'&&op.id===r.id);w.map.entries.push({id:'entry_native_'+r.id,title:level?.title||'未关联入口',levelId:level?.id??'',x:Math.round(Number(c.get(r,'position.x'))),y:Math.round(Number(c.get(r,'position.y'))),...(proto?.kind==='prefab'?{prototype:{template:proto.template,sourceId:proto.sourceId}}:{})});}
  w.map.objects=w.map.objects?.flatMap<EditOp>(op=>{if(op.kind==='duplicate'){const copies=op.copies.filter(p=>!ids.has(p.newId));return copies.length?[{...op,copies}]:[];}if(ids.has(op.id)||op.kind==='clone'&&ids.has(op.newId))return[];return[op];});return w;
}
