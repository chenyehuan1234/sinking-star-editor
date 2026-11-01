import{applyCharacterControl}from'./character-control';import{applyTopology,topologyView,validateTopology}from'./topology';
import{applyStamp,validateBundle}from'./regions';
import { GamePackage } from './package';
import { baseFields, canEdit, EDITABLE, parseEntities, patchTransform, position, writeEntities, yawOf, type EntityFile } from './entities';
import type { EditorProject, LevelView } from '../shared';
import{PropertyCodec}from'./properties';
import{MECHANISM_TYPES,REMOVABLE_TYPES,mechanismProperties,validateProperties,transform}from'./mechanisms';
import {editableType,placeNative} from './placement';
import {objectFields,validateNativeProperties,nativeFieldDefault} from './object-catalog';
import {applyTerrain} from './terrain';
import {mergeManifests} from './manifests';
import {blankFile,updateBlankBounds} from './blank';
import {applyProfile,duplicateRecords} from './profiles';
import {applyCamera,cameraView,validateCamera} from './camera';

export function validateProject(value: unknown): asserts value is EditorProject {
  const p=value as EditorProject;
  if(!p||p.format!=='sinking-star-project'||![1,2,3].includes(p.version)||!/^[a-f0-9]{64}$/.test(p.sourceHash)||typeof p.sourceBuild!=='string'||!validName(p.template)||!validName(p.name)||!Array.isArray(p.operations)||p.operations.length>10000)throw new Error('无效的编辑工程');
  if(p.base){if(![2,3].includes(p.version)||!['blank','template'].includes(p.base.kind))throw new Error('无效的场景基础');if(p.base.kind==='blank'&&![p.base.width,p.base.height].every(n=>Number.isInteger(n)&&n>=4&&n<=128))throw new Error('空白场景尺寸无效');if(p.base.kind==='template'&&p.base.template!==p.template)throw new Error('模板基础与资源模板不一致');}
  validateCamera(p.camera);validateTopology(p.topology);
  for(const o of p.operations){
    if(!o||!['control','stamp','transform','clone','delete','properties','prefab','terrain','profile','duplicate'].includes(o.kind)||!Number.isInteger(o.id)||o.id<0||o.id>0xffffffff)throw new Error('无效的编辑操作');
    if(o.kind==='control'&&(!Array.isArray(o.ids)||!o.ids.includes(o.id)||!o.ids.length||o.ids.length>2000||new Set(o.ids).size!==o.ids.length||o.ids.some(id=>!Number.isInteger(id)||id<1||id>0xffffffff)||o.targetId!==undefined&&(!Number.isInteger(o.targetId)||o.targetId<1||o.targetId>0xffffffff)))throw Error('原生角色控制设置无效');
    if(o.kind==='profile'&&(!validName(o.template)||!Number.isInteger(o.sourceId)||o.sourceId<0||o.sourceId>0xffffffff))throw new Error('原版配置无效');
    if(o.kind==='stamp'){if(p.version!==3)throw new Error('区域快照需要 v3 工程');validateBundle(o.bundle);if(o.bundle.sourceHash!==p.sourceHash||o.bundle.sourceBuild!==p.sourceBuild)throw Error('区域快照与工程源版本不一致');if(!Number.isInteger(o.yaw)||o.yaw%90)throw new Error('区域旋转必须为90度倍数');}
    if(o.kind==='duplicate'&&o.associations!==undefined&&!['independent','shared'].includes(o.associations))throw new Error('复制关联策略无效');
    if(o.kind==='duplicate'&&(!Array.isArray(o.copies)||!o.copies.length||o.copies.length>2000||o.copies.some(p=>![p.id,p.newId].every(n=>Number.isInteger(n)&&n>0&&n<=0xffffffff))||!Array.isArray(o.offset)||o.offset.length!==3||!o.offset.every(n=>Number.isFinite(n)&&Math.abs(n)<10000)))throw new Error('批量复制无效');
    if(o.kind==='terrain'&&(!Array.isArray(o.cells)||o.cells.length>10000||o.cells.some(p=>!p||![p.x,p.y,p.z].every(v=>Number.isInteger(v)&&Math.abs(v)<10000)||typeof p.solid!=='boolean')))throw new Error('地形笔刷数据无效');
    if('position'in o&&(!Array.isArray(o.position)||o.position.length!==3||!o.position.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000)))throw new Error('坐标无效');
    if(o.kind==='transform'&&o.yaw!==undefined&&(!Number.isFinite(o.yaw)||Math.abs(o.yaw)>36000))throw new Error('朝向无效');
    if(o.kind==='transform')for(const [key,length]of[['rotation',4],['scale',3]]as const){const a=o[key];if(a!==undefined&&(!Array.isArray(a)||a.length!==length||!a.every(v=>Number.isFinite(v)&&Math.abs(v)<=10000)||(key==='rotation'&&Math.abs(Math.hypot(...a)-1)>.01)||(key==='scale'&&a.some(v=>Math.abs(v)<.0001))))throw new Error('旋转或缩放无效');}
    if(o.kind==='clone'&&(!Number.isInteger(o.newId)||o.newId<1||o.newId>0xffffffff||!Array.isArray(o.position)))throw new Error('复制实体 ID 或坐标无效');
    if(o.kind==='prefab'&&(!validName(o.template)||!Number.isInteger(o.sourceId)||o.sourceId<0||o.sourceId>0xffffffff||!Array.isArray(o.position)))throw new Error('物件预设无效');
    if(o.kind==='properties'&&o.sourceTemplate!==undefined&&!validName(o.sourceTemplate))throw new Error('属性资源来源无效');
  }
}
export function validName(s: unknown): s is string {return typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s);}
export function applyProject(pkg:GamePackage,project:EditorProject,codec?:PropertyCodec,base?:EntityFile):EntityFile {
  validateProject(project);
  const f=base??(project.base?.kind==='blank'?(codec?blankFile(pkg,codec,project.base.width,project.base.height):(()=>{throw new Error('空白场景需要游戏类型信息');})()):parseEntities(pkg.get(`data-common/${project.template}.entities`)));
  for(const o of project.operations){
    if(o.kind==='control'){if(!codec)throw Error('角色同步控制需要原生类型信息');applyCharacterControl(codec,f,o);continue;}
    if(o.kind==='stamp'){if(!codec)throw new Error('区域放置需要类型信息');applyStamp(pkg,codec,f,o);continue;}
    if(o.kind==='duplicate'){if(!codec)throw new Error('批量复制需要类型信息');if(o.copies.some(p=>!editableType(f.records.find(r=>r.id===p.id)?.type??'')))throw new Error('不能复制内部对象');duplicateRecords(codec,f,o);continue;}
    if(o.kind==='terrain'){if(!codec)throw new Error('地形编辑需要游戏类型信息');applyTerrain(pkg,codec,f,o);continue;}
    if(o.kind==='prefab'){
      if(!codec)throw new Error('机关预设需要游戏反射信息');
      placeNative(pkg,codec,f,o);continue;
    }
    const index=f.records.findIndex(r=>r.id===o.id),r=f.records[index];
    if(!r||!(codec?editableType(r.type)&&codec.parse(r).complete:canEdit(r)))throw new Error(`实体 ${o.id} 不存在或尚不支持修改`);
    if(o.kind==='profile'){if(!codec)throw new Error('配置切换需要类型信息');f.records[index]=applyProfile(pkg,codec,r,o);}
    else if(o.kind==='transform'){
      let out=codec?transform(codec,r,o.position,o.yaw):patchTransform(r,o.position,o.yaw);
      if(codec&&(o.rotation||o.scale)){const values:Record<string,number>={};o.rotation?.forEach((v,i)=>values['orientation.'+'xyzw'[i]]=v);o.scale?.forEach((v,i)=>values['scale.'+'xyz'[i]]=v);out=codec.patch(out,values);}f.records[index]=out;
    }
    else if(o.kind==='properties'){
      if(!codec)throw new Error('属性编辑需要反射信息');validateNativeProperties(codec,r.type,o.values);f.records[index]=codec.patch(r,o.values);
    }
    else if(o.kind==='clone'){
      if(!(codec?editableType(r.type):['Mirror','Rock'].includes(r.type)))throw new Error('此对象不能复制');
      if(f.records.some(r=>r.id===o.newId)||(o.newId>>>20)!==(r.id>>>20))throw new Error('新实体 ID 冲突或命名空间不匹配');
      const cloned=codec?codec.patch(transform(codec,r,o.position),{entity_name:''}):patchTransform(r,o.position);
      f.records.push({...cloned,id:o.newId});
    }else{
      if(!(codec?editableType(r.type):['Mirror','Rock'].includes(r.type)))throw new Error('此对象不能删除');
      f.records.splice(index,1);
    }
  }
  if(project.base?.kind==='blank'&&codec&&!project.topology)updateBlankBounds(codec,f);
  if(codec){applyCamera(codec,f,project.camera,pkg);applyTopology(codec,f,project.topology);}
  return f;
}
export function levelView(pkg:GamePackage,name:string,file?:EntityFile,codec?:PropertyCodec):LevelView {
  if(!validName(name))throw new Error('无效关卡名称');
  const f=file??parseEntities(pkg.get(`data-common/${name}.entities`));
  const terrain:{x:number;y:number;z:number;id?:number}[]=[];
  if(codec)for(const r of f.records.filter(r=>r.type==='Wall_Set')){
    const parsed=codec.parse(r),values=new Map(parsed.fields.map(f=>[f.schema.name,f.value]));if(!parsed.complete||Number(values.get('kind')??0)!==0)continue;const get=(s:string,d=0)=>Number(values.get(s)??d),p=position(r)??[0,0,0];
    const sx=get('wall_data.dimensions.x'),sy=get('wall_data.dimensions.y'),sz=get('wall_data.dimensions.z'),slots=(values.get('wall_data.bits.slots')??[])as string[];const cx=get('wall_data.corner.x'),cy=get('wall_data.corner.y'),cz=get('wall_data.corner.z'),bits=slots.map(v=>BigInt(v));
    if(sx*sy*sz>1000000||sx<1||sy<1||sz<1)continue;
    for(let i=0;i<sx*sy*sz&&terrain.length<30000;i++)if(((bits[i>>6]??0n)&(1n<<BigInt(i%64)))!==0n)terrain.push({id:r.id,x:p[0]+cx+i%sx,y:p[1]+cy+Math.floor(i/sx)%sy,z:p[2]+cz+Math.floor(i/(sx*sy))+1});
  }
  const waters=codec?f.records.filter(r=>r.type==='Ocean_Map'&&codec.parse(r).complete).map(r=>({id:r.id,x:Number(codec.get(r,'grid.corner.x')),y:Number(codec.get(r,'grid.corner.y')),z:Number(codec.get(r,'grid.corner.z'))-Number(codec.get(r,'sink')),width:Number(codec.get(r,'grid.squares_x')),height:Number(codec.get(r,'grid.squares_y')),cells:codec.get(r,'ocean_values',[])as number[]})):[];
  return {name,typeCount:f.types.length,terrain,waters,topology:codec?topologyView(codec,f):undefined,camera:codec?cameraView(codec,f):undefined,manifest:pkg.get(`data-common/${name}.level_manifest`).toString('utf8'),entities:f.records.map(r=>{
    const field=baseFields(r.diff).fields.find(f=>f.id===0x1f);
    const editable=codec?editableType(r.type)&&codec.parse(r).complete:canEdit(r);
    const raw=codec?Object.fromEntries(codec.parse(r).fields.map(f=>[f.schema.name,f.value])):{};
    const vector=(n:string,d:number)=>['x','y','z'].map(a=>Number(raw[n+'.'+a]??d))as[number,number,number];
    const nativeProperties=codec&&editable?objectFields(codec,r.type).filter(f=>f.access==='design'&&!/^(position|orientation|scale|visual_position|tint_color_[ab])\./.test(f.name)).map(field=>({field,value:raw[field.name]??nativeFieldDefault(r.type,field.name,field.kind)})):undefined;
    return {id:r.id,type:r.type,position:position(r),yaw:yawOf(r),editable,bytes:r.diff.length,mesh:codec?String(raw.mesh??''):field?r.diff.toString('utf8',field.value,field.end):'',cloneable:editable&&(codec?editableType(r.type):['Mirror','Rock'].includes(r.type)),properties:codec?mechanismProperties(codec,r):[],scale:vector('scale',1),rotation:[...vector('orientation',0),Number(raw['orientation.w']??1)]as[number,number,number,number],tint:vector('tint_color_a',1),materials:Array.isArray(raw.materials)?raw.materials as string[]:[],accessoryMask:r.type==='Monster'?Number(raw.accessory_mask??0):undefined,generatedSurface:['Inanimate','Wall_Set'].includes(r.type)&&String(raw.entity_name??'').startsWith('editor_voxel_'),nativeProperties};
  })};
}

// Legacy fixture compatibility only: 0x1060 is sound_level_name, not level identity.
// Real-game paths use PropertyCodec and preserve this field.
// Require an exact, unique, length-delimited source value followed by a member boundary.
export function renameSettings(file:EntityFile,from:string,to:string):void {
  if(from===to)return;
  if(!validName(to))throw new Error('关卡名仅允许英文字母、数字、下划线与短横线');
  const settings=file.records.filter(r=>r.type==='Settings');
  if(settings.length!==1)throw new Error('Settings 数量异常，不能另存为');
  const r=settings[0],hits:{start:number;end:number}[]=[];
  for(const member of [0x1060,0x1054]){
    const prefix=Buffer.alloc(19);prefix[0]=0xfd;prefix.writeUInt16LE(member,1);prefix.writeBigUInt64LE(BigInt(Buffer.byteLength(from)),11);
    const needle=Buffer.concat([prefix,Buffer.from(from),Buffer.from([0xfd])]);
    let p=r.diff.indexOf(needle);while(p>=0){hits.push({start:p,end:p+needle.length-1});p=r.diff.indexOf(needle,p+1);}
  }
  if(hits.length!==1)throw new Error('此版本的关卡名称字段尚未验证，不能另存为');
  const {start,end}=hits[0],head=Buffer.from(r.diff.subarray(start,start+19));head.writeBigUInt64LE(BigInt(Buffer.byteLength(to)),11);
  r.diff=Buffer.concat([r.diff.subarray(0,start),head,Buffer.from(to),r.diff.subarray(end)]);
}
export function buildChanges(pkg:GamePackage,p:EditorProject,codec?:PropertyCodec):Map<string,Buffer> {
  const f=applyProject(pkg,p,codec);
  if(p.name!==p.template&&pkg.entries.some(e=>e.name===`data-common/${p.name}.entities`))throw new Error('自定义名称与官方关卡重名');
  if(!codec)renameSettings(f,p.template,p.name);
  const sources=projectSources(p);
  const manifest=sources.length===1?pkg.get(`data-common/${p.template}.level_manifest`):mergeManifests(sources.map(n=>pkg.get(`data-common/${n}.level_manifest`).toString()));
  return new Map([[`data-common/${p.name}.entities`,writeEntities(f)],[`data-common/${p.name}.level_manifest`,manifest]]);
}
export function projectSources(p:EditorProject){return[...new Set([p.template,...(p.camera?.edits??[]).flatMap(e=>e.kind==='clone'&&e.sourceTemplate?[e.sourceTemplate]:[]),...p.operations.flatMap(o=>o.kind==='stamp'?o.bundle.sources:o.kind==='prefab'||o.kind==='profile'?[o.template]:o.kind==='properties'&&o.sourceTemplate?[o.sourceTemplate]:[]),...p.base?.kind==='blank'||p.operations.some(o=>o.kind==='terrain'||o.kind==='stamp')?['3d_intro_heroes','heroes1_1']:[]])];}
