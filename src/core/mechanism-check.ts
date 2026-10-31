import type{WorldIssue}from'../shared';import type{EntityFile}from'./entities';import type{PropertyCodec}from'./properties';import{objectFields}from'./object-catalog';
export function mechanismIssues(c:PropertyCodec,file:EntityFile):WorldIssue[]{
 const out:WorldIssue[]=[],ids=new Map(file.records.map(r=>[r.id,r])),channels=new Map<number,{switches:number[];gates:number[]}>();
 for(const r of file.records){if(!c.parse(r).complete)continue;for(const field of objectFields(c,r.type).filter(f=>f.kind==='reference'&&f.targets)){const id=Number(c.get(r,field.name));if(id&&(!ids.has(id)||!field.targets!.includes(ids.get(id)!.type)))out.push({severity:'error',category:'reference',entityId:r.id,entityIds:[r.id,...(ids.has(id)?[id]:[])],message:r.type+' #'+r.id+'：'+field.label+'目标不存在或类型不匹配'});}if(r.type==='Teleporter'&&!Number(c.get(r,'target_id')))out.push({severity:'error',category:'dependency',entityId:r.id,message:'传送器 #'+r.id+' 缺少必需目标'});
 if(!['Switch','Gate'].includes(r.type))continue;const special=r.type==='Switch'?Number(c.get(r,'special_type'))!==0:Boolean(c.get(r,'is_monster_gate'));if(special){out.push({severity:'warning',category:'native',entityId:r.id,message:r.type+' #'+r.id+' 使用特殊原生机制，需实机验证'});continue;}const channel=Number(c.get(r,'flavor')),group=channels.get(channel)??{switches:[],gates:[]};group[r.type==='Switch'?'switches':'gates'].push(r.id);channels.set(channel,group);
 }
 for(const[channel,group]of channels){const members=[...group.switches,...group.gates];if(!group.switches.length||!group.gates.length)out.push({severity:'warning',category:'channel',entityId:members[0],entityIds:members,message:'频道 '+channel+'：'+(!group.switches.length?'只有门闸，没有普通开关':'只有开关，没有普通门闸')+'；若由特殊机制控制，请实机验证'});}
 for(const warning of file.analysisWarnings??[]){const record=ids.get(warning.entityId);if(record&&!Number(c.get(record,warning.field)))out.push({severity:'warning',category:'dependency',entityId:warning.entityId,message:warning.message});}
 return out;
}
