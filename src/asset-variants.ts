import type {ObjectCatalog,ObjectPreset,NativeValue} from './catalog-types';
import {CHARACTER_LABELS,OBJECT_BY_TYPE} from './core/object-definitions';

export interface AssetVariant {preset:ObjectPreset;aliases:ObjectPreset[];label:string;details:string;searchText:string}
export interface AssetFamily {id:string;label:string;type:string;category:string;variants:AssetVariant[]}
const cache=new WeakMap<ObjectCatalog,AssetFamily[]>();
const bool=(v:NativeValue|undefined)=>Boolean(v);
export function normalizedMaterials(materials:string[]){const result=[...materials];while(result.at(-1)==='')result.pop();return result;}
const ignored=(key:string)=>/^(position|orientation)\./.test(key)||['entity_name','group_id','turn_order','turn_order_id','flavor'].includes(key);
/** Browsing identity only. Native presets and their source keys are never rewritten. */
export function variantIdentity(p:ObjectPreset,catalog:ObjectCatalog){
 const fields=catalog.types.find(t=>t.type===p.type)?.fields??[],values={...p.values,...p.signature},normalized:Record<string,unknown>={};
 for(const key of [...new Set([...fields.filter(f=>f.access==='design').map(f=>f.name),...Object.keys(values)])].sort()){
  if(ignored(key)||['mesh','materials'].includes(key))continue;const field=fields.find(f=>f.name===key);if(field?.kind==='reference')continue;
  const fallback=key.startsWith('tint_color_')||key.startsWith('scale.')?1:key==='height'&&p.type==='Gate'?2:field?.kind==='string'||field?.kind==='resource'?'':field?.kind==='array'?[]:0;
  const v=values[key]??fallback;normalized[key]=field?.kind==='boolean'?bool(v):v;
 }
 return JSON.stringify([p.type,p.mesh,normalizedMaterials(p.materials),normalized,p.placement==='assembly'?[p.template,p.sourceId]:null]);
}
export function assetFamilyId(p:ObjectPreset){
 let kind='';if(p.type==='Guy')kind=p.mesh.replace(/_alt$/,'');
 else if(p.type==='Monster')kind=Number(p.signature.constant_flags)&2?'dragon':'goblin';
 else if(p.type==='Gate')kind=bool(p.signature.is_monster_gate)?'monster':'ordinary';
 else if(p.type==='Rock')kind=Number(p.signature.properties)&2?'skipping':/Boulder/i.test(p.mesh)?'rolling':'block';
 else if(p.type==='Ocean_Map')kind=String(Number(p.values.kind??0));
 else if(p.type==='Fence')kind=bool(p.signature.is_floor??p.values.is_floor)?'floor':'fence';
 else if(p.category==='decoration')kind=p.mesh||String(p.values['attributes.texture_id']??p.label);
 else if(p.type==='Marker')kind=String(p.values.script_name??'');
 return p.type+':'+kind;
}
function familyLabel(p:ObjectPreset){
 if(p.type==='Guy')return CHARACTER_LABELS[p.mesh.replace(/_alt$/,'')]??p.label;
 if(p.type==='Monster')return Number(p.signature.constant_flags)&2?'敌对龙':'哥布林';
 if(p.type==='Gate')return bool(p.signature.is_monster_gate)?'怪物门闸':'门闸';
 if(p.type==='Rock')return Number(p.signature.properties)&2?'飞石':/Boulder/i.test(p.mesh)?'滚石':'方块';
 if(p.type==='Ocean_Map')return Number(p.values.kind??0)===1?'阻挡水域':'普通水域';
 if(p.type==='Fence')return bool(p.signature.is_floor??p.values.is_floor)?'薄地板':'栅栏';
 return p.category==='decoration'?p.label:OBJECT_BY_TYPE.get(p.type)?.label??p.label;
}
function variantName(p:ObjectPreset,catalog:ObjectCatalog){
 const s=p.signature,v=p.values,result:string[]=[],style=p.mesh.match(/(?:Glyph|Button)_([A-D])(?:_|$)/)?.[1];
 if(p.type==='Guy'){
  result.push(p.mesh.endsWith('_alt')?'替换外观':'标准外观');if(Number(s.skill_flags)&256&&!p.mesh.startsWith('queen'))result.push('女王能力变体');
  if(Number(s.inventory_flags))result.push('装备 '+s.inventory_flags);
 }else if(p.type==='Monster')result.push('配饰 0x'+(Number(s.accessory_mask)>>>0).toString(16));
 else if(p.type==='Gate'){
  if(style)result.push('样式 '+style);result.push(bool(s.notted)?'反向响应':'正常响应');
  result.push(bool(s.sideways)?'横向安装':p.mesh.includes('_Down')?'下置款':'竖向安装');
  if(p.mesh.includes('_Short'))result.push('短款');if(bool(s.negate_direction))result.push('开合方向反转');
  result.push('高度参数 '+(s.height??2));
 }else if(p.type==='Rock'){
  if(style)result.push('样式 '+style);else{const style=p.mesh.match(/_([A-D])$/)?.[1];if(style)result.push('样式 '+style);}
  if(p.mesh.includes('_Taller'))result.push('高款');else if(p.mesh.includes('_Tall'))result.push('中高款');
  const flags=Number(s.properties);result.push(flags&1?'可镜像':'不可镜像');if(flags&4)result.push('原生跳跃状态');if(flags&8)result.push('原生翻转目标');if(flags&256)result.push('无碎片');result.push('速度档 '+(s.speed_mod??0));
 }else if(p.type==='Switch'){
  result.push(({0:'普通压力开关',1:'终局 END1',2:'终局石块判定',3:'终局忽略人物'}as Record<number,string>)[Number(s.special_type)]??'特殊开关 '+s.special_type);if(style)result.push('样式 '+style);
 }else if(p.type==='Mirror'){
  result.push(bool(s.is_magic)?'魔法镜':'普通镜');if(bool(s.is_vertical))result.push(bool(s.is_vertical_downward)?'向下反射':'向上反射');if(bool(s.mirrorable))result.push('可镜像');
 }else{
  for(const [key,value]of Object.entries(s)){const field=catalog.types.find(t=>t.type===p.type)?.fields.find(f=>f.name===key),label=field?.label??key;
   result.push(field?.kind==='boolean'?(bool(value)?label:'非'+label):label+' '+(field?.options?.find(o=>String(o.value)===String(value))?.name??value));
  }
  if(!result.length)result.push(p.category==='decoration'&&p.mesh?p.mesh.replace(/^(GAME_SOKO_|ARCH_Order_)/,''):'标准配置');
 }
 if(p.type==='Ocean_Map')result.push('水面偏移 '+(v.sink??0));
 return result.join(' · ');
}
export function assetFamilies(catalog:ObjectCatalog){
 const cached=cache.get(catalog);if(cached)return cached;const families=new Map<string,AssetFamily>(),identities=new Map<string,Map<string,AssetVariant>>();
 for(const p of catalog.presets){if(!p.parsed||['internal','excluded'].includes(p.placement))continue;const id=assetFamilyId(p);let family=families.get(id);
  if(!family){family={id,label:familyLabel(p),type:p.type,category:['Friendly_Dragon','Baby_Dragon','Egg'].includes(p.type)?'creature':p.category,variants:[]};families.set(id,family);identities.set(id,new Map());}
  const identity=variantIdentity(p,catalog),existing=identities.get(id)!.get(identity);if(existing){existing.aliases.push(p);continue;}
  const variant:AssetVariant={preset:p,aliases:[p],label:variantName(p,catalog),details:'',searchText:''};family.variants.push(variant);identities.get(id)!.set(identity,variant);
 }
 for(const family of families.values()){
  const rank=(p:ObjectPreset)=>p.type==='Gate'?Number(bool(p.signature.notted))*10+Number(bool(p.signature.sideways))*4+Number(bool(p.signature.negate_direction))+(p.mesh.includes('_Down')?2:0)+(p.mesh.includes('_Short')?1:0)+(Number(p.signature.height??2)===2?0:.25):p.type==='Guy'?Number(p.mesh.endsWith('_alt'))+Number(p.signature.inventory_flags??0)*2:p.type==='Switch'?Number(p.signature.special_type)*10:p.type==='Monster'?Number(p.signature.accessory_mask)>>>0:0;family.variants.sort((a,b)=>rank(a.preset)-rank(b.preset)||a.preset.mesh.localeCompare(b.preset.mesh)||a.preset.key.localeCompare(b.preset.key));
  const descriptions=new Map<string,AssetVariant[]>();for(const v of family.variants){const list=descriptions.get(v.label)??[];list.push(v);descriptions.set(v.label,list);}
  for(const list of descriptions.values())if(list.length>1)list.forEach((v,i)=>v.label+=' · 配置 '+(i+1));
  for(const v of family.variants){const p=v.preset;v.details=[family.label,v.label,...p.tags,p.type==='Gate'?'height 为原生参数，具体用途尚待实机核实，不表示已验证的跨层阻挡高度':'',p.type==='Switch'&&Number(p.signature.special_type)?'特殊原生行为，需原版场景验证':'',p.placement==='assembly'?'需要原生关联或场景环境':'',p.mesh?'原生模型：'+p.mesh:'',normalizedMaterials(p.materials).some(Boolean)?'原生材质：'+normalizedMaterials(p.materials).join('、'):'',...v.aliases.map(a=>'来源：'+a.template),v.aliases.length>1?'已合并 '+v.aliases.length+' 条相同配置来源':''].filter(Boolean).join('\n');v.searchText=[family.label,v.label,v.details,...v.aliases.flatMap(a=>[a.label,a.type,a.mesh,a.template,...a.materials,...a.tags])].join(' ').toLowerCase();}
 }
 const result=[...families.values()];cache.set(catalog,result);return result;
}
export function variantMatches(family:AssetFamily,variant:AssetVariant,query:string){const terms=query.trim().toLowerCase();return !terms||terms.split(/\s+/).every(term=>variant.searchText.includes(term));}
export function variantForKey(family:AssetFamily,key?:string){return key?family.variants.find(v=>v.aliases.some(p=>p.key===key)):undefined;}
