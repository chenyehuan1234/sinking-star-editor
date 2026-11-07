import{objectFields}from'./object-catalog';
import type{EditableProperty,PrefabView}from'../shared';import type{EntityRecord,EntityFile}from'./entities';import{PropertyCodec}from'./properties';import{GamePackage}from'./package';import{parseEntities}from'./entities';
export const MECHANISM_TYPES=new Set(['Mirror','Rock','Guy','Door','Switch','Gate','Teleporter','Gem','Gem_Slot']);
export const REMOVABLE_TYPES=new Set(['Mirror','Rock','Switch','Gate','Teleporter','Gem','Gem_Slot']);
const property=(name:string,label:string,kind:EditableProperty['kind']='number',min=0,max=1000000,targets?:string[])=>({name,label,kind,min,max,targets});
const RULES:Record<string,ReturnType<typeof property>[]>={
  Switch:[property('flavor','开关频道')],
  Gate:[property('flavor','门闸频道'),property('notted','反向响应','boolean'),property('sideways','横向门闸','boolean'),property('height','门闸高度','number',.25,4)],
  Teleporter:[property('target_id','传送目标','target',0,0xffffffff,['Teleporter','Marker']),property('discovered','已发现','boolean'),property('enabled_t_target','启用程度','number',0,1)],
};
export function mechanismProperties(c:PropertyCodec,r:EntityRecord):EditableProperty[]{return(RULES[r.type]??[]).map(p=>({...p,value:c.get(r,p.name,p.kind==='boolean'?false:p.name==='height'?2:p.name==='enabled_t_target'?1:0)as number|boolean}));}
export function validateProperties(type:string,values:Record<string,number|boolean>){
  if(!values||typeof values!=='object'||Object.keys(values).length>16)throw new Error('机关属性无效');
  for(const[name,value]of Object.entries(values)){const p=RULES[type]?.find(p=>p.name===name);if(!p)throw new Error(`尚未开放属性 ${type}.${name}`);
    if(p.kind==='boolean'?typeof value!=='boolean':typeof value!=='number'||!Number.isFinite(value)||value<p.min||value>p.max||(name!=='height'&&name!=='enabled_t_target'&&!Number.isInteger(value)))throw new Error(`属性「${p.label}」无效`);
  }
}
export function transform(c:PropertyCodec,r:EntityRecord,pos?:[number,number,number],yaw?:number):EntityRecord{
  const values:Record<string,number>={};if(pos)for(const[i,axis]of['x','y','z'].entries()){values[`position.${axis}`]=pos[i];values[`visual_position.${axis}`]=pos[i];}
  if(yaw!==undefined){const a=yaw*Math.PI/360;Object.assign(values,{'orientation.x':0,'orientation.y':0,'orientation.z':Math.sin(a),'orientation.w':Math.cos(a),theta_current:yaw,theta_target:yaw});}
  return c.patch(r,values);
}
export function validateReferences(c:PropertyCodec,f:EntityFile):string[]{
  const groups=new Map(f.records.filter(r=>r.type==='Group').map(r=>[r.id,r]));
  const groupErrors:string[]=[];
  for(const r of f.records){const group=Number(c.get(r,'group_id'));if(group&&!groups.has(group))groupErrors.push(`${r.type} #${r.id} 的组合 #${group} 不存在`);}
  for(const r of groups.values()){const seen=new Set<number>([r.id]);let id=Number(c.get(r,'group_id'));while(id&&groups.has(id)){if(seen.has(id)){groupErrors.push(`组合 #${r.id} 存在循环关联`);break;}seen.add(id);id=Number(c.get(groups.get(id)!,'group_id'));}}
  const errors:string[]=[];for(const r of f.records){if(r.type==='Teleporter'){const target=Number(c.get(r,'target_id'));if(!target||!f.records.some(e=>e.id===target&&['Teleporter','Marker'].includes(e.type)))errors.push(`传送器 #${r.id} 缺少有效目标`);}
  }for(const r of f.records)for(const field of objectFields(c,r.type).filter(f=>f.kind==='reference'&&f.targets&&f.name!=='group_id')){const id=Number(c.get(r,field.name));if(id&&!f.records.some(e=>e.id===id&&field.targets!.includes(e.type)))errors.push(r.type+' #'+r.id+' 的'+field.label+'没有有效目标');}return[...new Set([...errors,...groupErrors])];
}
export function prefabs(pkg:GamePackage,c:PropertyCodec):PrefabView[]{
  const specs:[string,string,string,string][]=[['mirror','魔镜','mirror_1','Mirror'],['rock','石头','3d_intro_vanilla','Rock'],['switch','压力开关','make_thief_goblin_maze_v2','Switch'],['gate','门闸','make_thief_goblin_maze_v2','Gate'],['teleporter','传送器','make_thief_goblin_maze_v2','Teleporter'],['gem','宝石','3d_intro_promesst_v5','Gem'],['slot','宝石插槽','3d_intro_promesst_v5','Gem_Slot']];
  return specs.map(([key,label,template,type])=>{const f=parseEntities(pkg.get(`data-common/${template}.entities`)),r=f.records.find(r=>r.type===type&&c.parse(r).complete);if(!r)throw new Error(`缺少机关预设 ${label}`);return{key,label,template,type,sourceId:r.id,values:type==='Teleporter'?{discovered:true,enabled_t_target:1}:undefined};});
}
