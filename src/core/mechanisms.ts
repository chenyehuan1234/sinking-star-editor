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
export function validateReferences(c:PropertyCodec,f:EntityFile,options:{transient?:boolean;nativeWorld?:boolean}={}):string[]{
 const ids=new Map(f.records.map(r=>[r.id,r])),groups=new Map(f.records.filter(r=>r.type==='Group').map(r=>[r.id,r])),parents=new Map<number,number>(),fields=new Map<string,ReturnType<typeof objectFields>>(),errors:string[]=[],groupErrors:string[]=[];
 for(const r of f.records){let values:Map<string,unknown>|undefined;const get=(name:string)=>{if(!options.transient)return c.get(r,name);values??=new Map(c.parseTransient(r).fields.map(f=>[f.schema.name,f.value]));return values.get(name)??0;};const group=Number(get('group_id'));if(r.type==='Group')parents.set(r.id,group);if(group&&!groups.has(group))groupErrors.push(r.type+' #'+r.id+' 的组合 #'+group+' 不存在');
  if(options.nativeWorld){const names:Record<string,string[]>={Level_Entry:['unlocked_by_id','unlocked_by_id2','unlocked_by_id3'],Area_Pin:['map_label_marker_id'],Marker:['script_target_entity_id'],Camera_Control:['position_id','look_at_id'],Group:['unexist_this_id','unexist_this_id2','unexist_this_id3']};for(const name of names[r.type]??[]){const id=Number(get(name));if(id&&!ids.has(id))errors.push(r.type+' #'+r.id+' 的 '+name+' 引用 #'+id+' 不存在');}}
  if(r.type==='Teleporter'){const target=ids.get(Number(get('target_id')));if(!target||!['Teleporter','Marker'].includes(target.type))errors.push('传送器 #'+r.id+' 缺少有效目标');}
  let refs=fields.get(r.type);if(!refs){refs=objectFields(c,r.type).filter(f=>f.kind==='reference'&&f.targets&&f.name!=='group_id');fields.set(r.type,refs);}for(const field of refs){const id=Number(get(field.name)),target=ids.get(id);if(id&&(!target||!field.targets!.includes(target.type)))errors.push(r.type+' #'+r.id+' 的'+field.label+'没有有效目标');}
 }
 for(const r of groups.values()){const seen=new Set<number>([r.id]);let id=parents.get(r.id)??0;while(id&&groups.has(id)){if(seen.has(id)){groupErrors.push('组合 #'+r.id+' 存在循环关联');break;}seen.add(id);id=parents.get(id)??0;}}
 return[...new Set([...errors,...groupErrors])];
}
export function prefabs(pkg:GamePackage,c:PropertyCodec):PrefabView[]{
  const specs:[string,string,string,string][]=[['mirror','魔镜','mirror_1','Mirror'],['rock','石头','3d_intro_vanilla','Rock'],['switch','压力开关','make_thief_goblin_maze_v2','Switch'],['gate','门闸','make_thief_goblin_maze_v2','Gate'],['teleporter','传送器','make_thief_goblin_maze_v2','Teleporter'],['gem','宝石','3d_intro_promesst_v5','Gem'],['slot','宝石插槽','3d_intro_promesst_v5','Gem_Slot']];
  return specs.map(([key,label,template,type])=>{const f=parseEntities(pkg.get(`data-common/${template}.entities`)),r=f.records.find(r=>r.type===type&&c.parse(r).complete);if(!r)throw new Error(`缺少机关预设 ${label}`);return{key,label,template,type,sourceId:r.id,values:type==='Teleporter'?{discovered:true,enabled_t_target:1}:undefined};});
}
