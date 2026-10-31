import{GamePackage,sha256}from'./package';
import{parseEntities,type EntityRecord}from'./entities';
import{PropertyCodec}from'./properties';
import{OBJECT_BY_TYPE,CHARACTER_LABELS}from'./object-definitions';
import type{NativeValue,ObjectCatalog,ObjectDefinition,ObjectField,ObjectPreset,ObjectTypeView}from'../catalog-types';
const COMMON:Record<string,string>={entity_name:'名称',group_id:'所属组合／存在组',mesh:'模型',materials:'材质',...Object.fromEntries(['position','scale','orientation','tint_color_a','tint_color_b'].flatMap(n=>['x','y','z',...(n.startsWith('tint')||n==='orientation'?['w']:[])].map(a=>[n+'.'+a,n==='position'?'位置 '+a.toUpperCase():n==='scale'?'缩放 '+a.toUpperCase():n==='orientation'?'旋转四元数 '+a:'颜色 '+n.slice(-1).toUpperCase()+'.'+a])))};
const SIGNATURES:Record<string,string[]>={Guy:['skill_flags','inventory_flags'],Monster:['constant_flags','accessory_mask'],Rock:['properties','speed_mod'],Mirror:['is_magic','is_vertical','is_vertical_downward','mirrorable'],Switch:['special_type'],Gate:['is_monster_gate','notted','sideways','negate_direction','height'],Teleporter:['teleporter_type'],Promesst_Light:['color','reflected_vertically','vertical_down','vertical_up'],Fence:['is_floor','blocking'],Rover:['mirrorable'],Lily:['nonmoving'],Wardrobe:['skill_flags','inventory_flags'],Artifact:['kind','p3_wand_flags']};
const FALLBACKS:Record<string,NativeValue>={'Mirror.is_magic':true,'Gate.height':2,'Fence.blocking':true,'Teleporter.enabled_t_target':1};
export function nativeFieldDefault(type:string,name:string,kind:string):NativeValue{return FALLBACKS[type+'.'+name]??(kind==='boolean'?false:kind==='resource'||kind==='string'?'':kind==='array'?[]:/^tint_color_/.test(name)?1:0);}
const fieldCache=new WeakMap<PropertyCodec,Map<string,ObjectField[]>>();
export function objectFields(codec:PropertyCodec,type:string):ObjectField[]{
  let byType=fieldCache.get(codec);if(!byType)fieldCache.set(codec,byType=new Map());const cached=byType.get(type);if(cached)return cached;
  const def=OBJECT_BY_TYPE.get(type),base=codec.reflection.fields('Undoable_Entity_Data').slice(0,0x25),own=codec.reflection.fields(type);
  const result:ObjectField[]=[...base.map((f,index)=>({...f,index})),...own.map((f,i)=>({...f,index:0x1000+i}))].map(f=>{
    const options=codec.reflection.enumValues(f.type),flagEnum=options.length>2&&!options.some(v=>BigInt(v.value)===0n)&&options.every(v=>{const n=BigInt(v.value);return n>0n&&(n&(n-1n))===0n;});
    const kind:ObjectField['kind']=f.type.name==='Pid'?'reference':f.name==='mesh'||f.name==='materials'||f.type.kind===4&&/mesh|bitmap|texture|image/.test(f.name)?'resource':options.length?flagEnum?'flags':'enum':f.type.kind===1?'number':f.type.kind===2?'boolean':f.type.kind===3?'string':f.type.kind===8?'array':'integer';
    const deprecated=/deprecated/i.test(f.name),runtime=f.notes.includes('NoSerialize')||f.notes.includes('DoNotDisplay')||f.notes.includes('ReadOnly');
    const label=def?.fields[f.name]??COMMON[f.name]??f.name;
    const access:ObjectField['access']=deprecated?'deprecated':runtime?'runtime':def?.fields[f.name]||COMMON[f.name]?'design':'internal';
    const targets=f.name==='group_id'?['Group']:type==='Teleporter'&&f.name==='target_id'?['Teleporter','Marker']:type==='Stairs'&&f.name==='other_end_id'?['Stairs']:type==='Stairs'&&f.name==='platform_id'?['Elevator_Platform']:type==='Activator'&&/^spawner_\d+$/.test(f.name)?['Spawner']:undefined;
    return{name:f.name,label,kind,size:f.type.size,index:f.index,notes:[...f.notes],access,options:options.length?options:undefined,targets};
  });
  byType.set(type,result);return result;
}
export function nativeSignature(codec:PropertyCodec,r:EntityRecord,values:Record<string,NativeValue>):Record<string,NativeValue>{
  return Object.fromEntries((SIGNATURES[r.type]??[]).map(n=>[n,values[n]??FALLBACKS[r.type+'.'+n]??0]));
}
function presetLabel(type:string,mesh:string,sig:Record<string,NativeValue>){
  if(type==='Guy'){const base=mesh.replace(/_alt$/,'');return(CHARACTER_LABELS[base]??mesh)+(mesh.endsWith('_alt')?' · 替换外观':'')+(Number(sig.skill_flags)&256&&base!=='queen'?' · 女王变体':'');}
  if(type==='Monster')return(Number(sig.constant_flags)&2?'敌对龙':'哥布林');
  if(type==='Rock'){const p=Number(sig.properties);return(p&2?'飞石':p&1?'水晶方块':'普通石块')+(p===3?' · 可镜像':'')+' · '+mesh;}
  if(type==='Switch')return({0:'压力开关',1:'终局开关 END1',2:'终局石块判定开关',3:'终局忽略人物开关'}[Number(sig.special_type)]??'开关')+' · '+mesh;
  if(type==='Gate')return(Number(sig.is_monster_gate)?'怪物门闸':'门闸')+(sig.sideways?' · 横向':'')+(sig.notted?' · 反向':'')+' · '+mesh;
  if(type==='Mirror')return(sig.is_magic?'魔法镜':'普通镜')+(sig.is_vertical?sig.is_vertical_downward?' · 向下反射':' · 向上反射':'')+(sig.mirrorable?' · 可镜像':'');
  return(OBJECT_BY_TYPE.get(type)?.label??type)+(mesh?' · '+mesh:'');
}
export function buildObjectCatalog(pkg:GamePackage,codec:PropertyCodec,build:string,assetFiles:string[]):ObjectCatalog{
  const levels=pkg.entries.filter(e=>e.name.endsWith('.entities'));
  const counts=new Map<string,{instances:number;completeInstances:number}>(),presets=new Map<string,ObjectPreset>();let entities=0;
  const types=parseEntities(levels[0].data).types;
  for(const type of types)if(!OBJECT_BY_TYPE.has(type))throw new Error(`对象目录缺少类型定义：${type}`);
  for(const entry of levels){const template=entry.name.slice('data-common/'.length,-'.entities'.length),file=parseEntities(entry.data);
    for(const r of file.records){entities++;const def=OBJECT_BY_TYPE.get(r.type)!;let count=counts.get(r.type);if(!count){count={instances:0,completeInstances:0};counts.set(r.type,count);}count.instances++;
      if(def.placement==='excluded'||def.placement==='internal')continue;
      const parsed=codec.parse(r);if(parsed.complete)count.completeInstances++;
      const raw=Object.fromEntries(parsed.fields.map(f=>[f.schema.name,f.value]))as Record<string,NativeValue>,mesh=typeof raw.mesh==='string'?raw.mesh:'',materials=Array.isArray(raw.materials)?raw.materials as string[]:[];
      const signature=nativeSignature(codec,r,raw);
      // Material overrides for the same mesh can be selected from their original prototypes.
      const matKey=materials.map(m=>m.replace(/~[^~]+$/,'~level'));
      const key=sha256(JSON.stringify([r.type,mesh,matKey,signature])).slice(0,24);
      const previous=presets.get(key);if(previous?.parsed||previous&&!parsed.complete)continue;
      const values=Object.fromEntries(Object.entries(raw).filter(([k])=>def.fields[k]!==undefined||COMMON[k]!==undefined));
      const tags=Object.entries(signature).filter(([,v])=>Boolean(v)).map(([k,v])=>`${def.fields[k]??k}: ${v}`);
      if(r.type==='Rock')tags.push('透光／遮光：待逐变体实机核对');
      if(def.placement==='assembly')tags.push('需关联或原版场景');
      presets.set(key,{key,label:presetLabel(r.type,mesh,signature),type:r.type,category:def.category,template,sourceId:r.id,mesh,materials,signature,values,tags,parsed:parsed.complete,placement:def.placement,verification:'native-data'});
    }
  }
  const list=[...presets.values()].sort((a,b)=>a.type.localeCompare(b.type)||a.label.localeCompare(b.label)||a.key.localeCompare(b.key));
  const typeViews:ObjectTypeView[]=types.map(type=>{const def=OBJECT_BY_TYPE.get(type)!;return{...def,fields:objectFields(codec,type),...(counts.get(type)??{instances:0,completeInstances:0}),presetCount:list.filter(p=>p.type===type).length};});
  return{version:1,schemaRevision:2,sourceHash:sha256(pkg.buffer),exeHash:codec.reflection.hash,build,generatedAt:new Date().toISOString(),types:typeViews,presets:list,totals:{levels:levels.length,entities,types:types.length,meshes:assetFiles.filter(n=>n.endsWith('.compressed_mesh')).length,textures:assetFiles.filter(n=>n.endsWith('.texture')).length,presets:list.length}};
}
export function validateNativeProperties(codec:PropertyCodec,type:string,values:Record<string,NativeValue>){
  if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>128)throw new Error('对象属性无效');
  const fields=objectFields(codec,type);
  for(const[name,value]of Object.entries(values)){
    const f=fields.find(f=>f.name===name);if(!f||f.access!=='design')throw new Error(`此属性不用于关卡设计：${type}.${name}`);
    if(f.kind==='boolean'){if(typeof value!=='boolean')throw new Error(`${f.label} 必须是布尔值`);}
    else if(f.kind==='string'||f.kind==='resource'){if(name==='materials'){if(!Array.isArray(value)||!value.every(v=>typeof v==='string'&&v.length<4096))throw new Error('材质列表无效');}else if(typeof value!=='string'||Buffer.byteLength(value)>4096)throw new Error(`${f.label} 文本无效`);}
    else if(f.kind==='number'){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>100000)throw new Error(`${f.label} 数值无效`);}
    else if(f.kind==='array')throw new Error('此数组请通过专用地形或组合工具编辑');
    else{let n:bigint;try{if(typeof value==='number'&&!Number.isSafeInteger(value)||typeof value!=='number'&&typeof value!=='string')throw Error();n=BigInt(value as number|string);}catch{throw new Error(`${f.label} 必须是整数`);}
      if(f.kind==='reference'&&(n<0n||n>0xffffffffn))throw new Error('对象引用超出范围');
      if(f.kind==='enum'&&f.options&&!f.options.some(o=>BigInt(o.value)===n))throw new Error(`${f.label} 不属于原生枚举`);
      if(f.kind==='flags'&&f.options){const mask=f.options.reduce((a,o)=>a|BigInt(o.value),0n);if(n<0n||(n&~mask)!==0n)throw new Error(`${f.label} 含有未知标志`);}
      const schema=codec.schema(type).find(s=>s.name===name);if(schema?.kind==='int'&&[1,2,4,8].includes(schema.size)){const bits=BigInt(schema.size*8),min=schema.signed?-(1n<<(bits-1n)):0n,max=schema.signed?(1n<<(bits-1n))-1n:(1n<<bits)-1n;if(n<min||n>max)throw new Error(`${f.label} 超出原生字段范围`);}
    }
  }
}
