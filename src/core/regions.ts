import{nativeWaterCells,waterLayout,waterView}from'./water';import{rotatedWaterValue}from'../water-edit';
import{copiedControlValues}from'./character-control';
import type{RegionBundle,RegionSelection,EditorProject,StampOp,Vec3}from'../shared';
import {position,type EntityFile,type EntityRecord}from'./entities';import{PropertyCodec,type PropertyValue}from'./properties';import{GamePackage}from'./package';import{editableType}from'./placement';import{addRegionTerrain,applyTerrain}from'./terrain';import{transform,rotationValues}from'./mechanisms';
import {OBJECT_BY_TYPE} from './object-definitions';
import {rotateTerrainFace,validateTerrainFaces,type TerrainFacePaint} from '../terrain-paint';

export function validateBundle(b:RegionBundle){if(b?.terrainPaint!==undefined){validateTerrainFaces(b.terrainPaint,(b.terrain?.length??0)*6,false);const cells=new Set((b.terrain??[]).map(p=>p.join(',')));if(b.terrainPaint.some(p=>!cells.has(p.cell.join(','))))throw Error('配色超出复制地形范围');}if(b?.copyPolicy!==undefined&&!['preserve','independent'].includes(b.copyPolicy)||b?.origin!==undefined&&(typeof b.origin!=='string'||b.origin.length>250))throw Error('区域复制策略无效');if(b?.associations!==undefined&&!['independent','shared'].includes(b.associations))throw Error('组合关联策略无效');if(!b||b.format!=='sstar-region'||![1,2].includes(b.version)||!/^[a-f0-9]{64}$/.test(b.sourceHash)||typeof b.sourceBuild!=='string'||typeof b.name!=='string'||b.name.length>100||!Array.isArray(b.sources)||!b.sources.length||!b.sources.every(n=>/^(?!.*\.\.)[\w.-]{1,100}$/.test(n))||!Array.isArray(b.warnings)||!b.warnings.every(n=>typeof n==='string')||!Array.isArray(b.records)||b.records.length>(b.version===2?100_000:2000)||!Array.isArray(b.terrain)||b.terrain.length>(b.version===2?1_000_000:4096)||!b.terrain.every(p=>Array.isArray(p)&&p.length===3&&p.every(n=>Number.isInteger(n)&&Math.abs(n)<10000)))throw Error('区域快照无效或超过容量限制');const ids=new Set<number>();for(const r of b.records){if(!Number.isInteger(r.id)||r.id<1||r.id>0xffffffff||ids.has(r.id)||!editableType(r.type)||(['Wall_Set','Camera_Control','Camera_Marker'].includes(r.type)||b.version===1&&r.type==='Level_Entry')||typeof r.diff!=='string'||r.diff.length>2_000_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(r.diff))throw Error('区域对象无效');ids.add(r.id);}}
export function validateRegionTransfer(bundle:RegionBundle){
  validateBundle(bundle);
  const transfer=bundle.transfer;
  if(!transfer)return;
  const id=(n:number)=>Number.isInteger(n)&&n>0&&n<=0xffffffff;
  const point=(p:Vec3)=>Array.isArray(p)&&p.length===3&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<10000);
  if(bundle.version!==2||!point(transfer.size)||transfer.size.some(n=>!Number.isInteger(n)||n<1)||
    !Array.isArray(transfer.entries)||transfer.entries.length>5000||!Array.isArray(transfer.levels)||transfer.levels.length>5000||
    !Array.isArray(transfer.links)||transfer.links.length>100000||
    transfer.entries.some(e=>!id(e.id)||!point(e.position)||typeof e.title!=='string'||typeof e.levelId!=='string'||typeof e.appearance!=='string'||e.appearance.length>100000||!/^[A-Za-z0-9+/]*={0,2}$/.test(e.appearance)||!Array.isArray(e.unlocks)||e.unlocks.length!==3||e.unlocks.some(n=>n!==0&&!id(n)))||
    new Set(transfer.entries.map(e=>e.id)).size!==transfer.entries.length)throw Error('区域传输数据无效');
}
export function captureRegion(c:PropertyCodec,file:EntityFile,p:EditorProject,selection:RegionSelection,sources:string[],check=()=>{}):RegionBundle{
 const selected=new Set(selection.ids),bounds=selection.bounds;if(bounds&&![...bounds.min,...bounds.max].every(Number.isFinite))throw Error('复制范围无效');
 const ocean=(r:EntityRecord)=>c.patch(r,{ocean_values:nativeWaterCells(c,file,r),detect_holes:false});
 const inside=(v:number[])=>!bounds||v.every((n,a)=>n>=bounds.min[a]&&n<=bounds.max[a]);const points:Vec3[]=[],records:EntityRecord[]=[];
 let visited=0;
 for(let r of file.records){
  if((visited++&1023)===0)check();
  const pos=position(r)??[0,0,0];
  const spatial=r.type==='Wall_Set'||r.type==='Ocean_Map';
  if(!spatial&&!selected.has(r.id)&&(!bounds||!inside(pos)))continue;
  if(selection.volume&&!spatial&&!['character','monster','block','mechanism','world'].includes(OBJECT_BY_TYPE.get(r.type)?.category??''))continue;
  if(!editableType(r.type)||['Camera_Control','Camera_Marker','Level_Entry','Group'].includes(r.type)||!c.parse(r).complete)continue;
  const added=[899,900].includes(r.id>>>20),name=String(c.get(r,'entity_name',''));
  if(name.startsWith('editor_voxel_')&&r.type==='Inanimate')continue;
  if(r.type==='Wall_Set'){
    if(!bounds&&!selected.has(r.id)||Number(c.get(r,'kind'))!==0)continue;
    const size=['x','y','z'].map(a=>Number(c.get(r,'wall_data.dimensions.'+a)));
    const corner=['x','y','z'].map((a,i)=>pos[i]+Number(c.get(r,'wall_data.corner.'+a)));
    const slots=(c.get(r,'wall_data.bits.slots',[]) as string[]).map(BigInt);
    if(size.reduce((a,b)=>a*b,1)>1_000_000)throw Error('地形范围过大');
    const lower=corner.map((v,i)=>bounds?Math.max(0,Math.ceil(bounds.min[i]-v-(i===2?1:0))):0);
    const upper=corner.map((v,i)=>bounds?Math.min(size[i]-1,Math.floor(bounds.max[i]-v-(i===2?1:0))):size[i]-1);
    for(let z=lower[2];z<=upper[2];z++){
      check();
      for(let y=lower[1];y<=upper[1];y++){
        const row=(z*size[1]+y)*size[0];
        for(let x=lower[0];x<=upper[0];x++){
          const i=row+x;
          if(((slots[i>>6]??0n)&(1n<<BigInt(i%64)))!==0n)points.push([corner[0]+x,corner[1]+y,corner[2]+z]);
        }
      }
    }
    continue;
  }
  if(r.type==='Ocean_Map'&&bounds&&selection.volume){
    const layout=waterLayout(c,r);
    if(layout.gridZ<bounds.min[2]||layout.gridZ>bounds.max[2])continue;
    const left=Math.max(bounds.min[0],layout.x),bottom=Math.max(bounds.min[1],layout.y);
    const right=Math.min(bounds.max[0],layout.x+layout.worldWidth-1),top=Math.min(bounds.max[1],layout.y+layout.worldHeight-1);
    if(right<left||top<bottom)continue;
    const water=waterView(c,file,r);
    if(water.error)throw Error(water.error);
    const width=right-left+1,height=top-bottom+1,cells:number[]=[];
    for(let y=bottom;y<=top;y++)for(let x=left;x<=right;x++)cells.push(water.cells[(y-water.y)*water.width+x-water.x]??0);
    if(cells.some(Boolean))records.push(c.patch(transform(c,r,[left,bottom,layout.gridZ]),{
      'orientation.x':0,'orientation.y':0,'orientation.z':0,'orientation.w':1,
      'grid.corner.x':0,'grid.corner.y':0,'grid.corner.z':0,'grid.squares_x':width,'grid.squares_y':height,'grid.num_squares':width*height,
      'grid.wrapping':false,ocean_values:cells,detect_holes:false
    }));
    continue;
  }
  if(r.type==='Ocean_Map'&&bounds){r=ocean(r);const layout=waterLayout(c,r),cells=c.get(r,'ocean_values',[])as number[];const values=cells.map((v,i)=>inside([...layout.at(i),layout.gridZ])?v:0);if(values.some(Boolean))records.push(c.patch(r,{ocean_values:values}));continue;}
  const scenery=['Inanimate','Decal','Animating','Procedurally_Animating'].includes(r.type);if(selected.has(r.id)||bounds&&inside(pos)&&(!scenery||added||selection.includeBackground))records.push(r.type==='Ocean_Map'?ocean(r):r);
 }
 // Preserve parent group chains, never pull unrelated group members into a region.
 const copiedIds=new Set(records.map(record=>record.id));
 const groups=new Map(file.records.filter(record=>record.type==='Group').map(record=>[record.id,record]));
 for(const r of records){
  const group=selection.single?0:Number(c.get(r,'group_id'));
  if(group&&!copiedIds.has(group)){
    const parent=groups.get(group);
    if(parent&&c.parse(parent).complete){records.push(parent);copiedIds.add(group);}
  }
  if(records.length>(selection.volume?100_000:2000))throw Error('区域对象超过容量限制');
 }
 if(!records.length&&!points.length&&!selection.volume)throw Error('复制范围内没有可复用内容');
 const least:Vec3=[Infinity,Infinity,Infinity];
 for(const [x,y,z] of points){least[0]=Math.min(least[0],x);least[1]=Math.min(least[1],y);least[2]=Math.min(least[2],z+1);}
 for(const r of records){if(r.type==='Group')continue;const pos=position(r)??[0,0,0];for(let i=0;i<3;i++)least[i]=Math.min(least[i],pos[i]);}
 const origin=selection.volume&&bounds?bounds.min:selection.single?least:least.map(Math.floor) as Vec3;
 const ids=new Set(records.map(r=>r.id)),warnings:string[]=[];
 const controls=copiedControlValues(c,records,new Map(records.map(r=>[r.id,r.id])),selection.copyPolicy==='independent'||!selection.copyPolicy&&selection.associations!=='shared',selection.copyPolicy==='preserve');
 const normalized=records.map(r=>{const values:Record<string,PropertyValue>={};for(const f of c.parse(r).fields){if((selection.copyPolicy?selection.copyPolicy==='independent':selection.associations!=='shared')&&f.schema.pid&&!ids.has(Number(f.value))&&Number(f.value)){if(!['turn_order_id','transmute_stashed_turn_order_id'].includes(f.schema.name))warnings.push(`${r.type} #${r.id}：外部关联 ${f.schema.name} → ${f.value} 已清除`);values[f.schema.name]=0;}if((!selection.copyPolicy&&selection.associations!=='shared'||selection.copyPolicy==='independent')&&f.schema.pidArray)values[f.schema.name]=(f.value as number[]).filter(n=>ids.has(n));}Object.assign(values,controls.get(r.id));const pos=['x','y','z'].map((a,i)=>Number(c.get(r,'position.'+a))-origin[i])as Vec3;const out=c.patch(transform(c,r,pos),values);return{id:r.id,type:r.type,diff:out.diff.toString('base64')};});
 const bundle:RegionBundle={format:'sstar-region',version:selection.volume?2:1,sourceHash:p.sourceHash,sourceBuild:p.sourceBuild,name:'未命名组合',copyPolicy:selection.copyPolicy,origin:selection.origin,sources:[...new Set([...sources,'3d_intro_heroes'])],records:normalized,terrain:[...new Map(points.map(v=>{const p=v.map((n,i)=>n-origin[i])as Vec3;return[p.join(','),p]as const;})).values()],warnings:[...new Set(warnings)],...(selection.associations==='shared'?{associations:'shared' as const}:{})};
 if(file.terrainPaint?.length){const selectedCells=new Set(points.map(p=>p.join(',')));const colors=file.terrainPaint.filter(item=>selectedCells.has(item.cell.join(','))).map(item=>({...item,cell:item.cell.map((v,i)=>v-origin[i]) as Vec3}));if(colors.length)bundle.terrainPaint=colors;}
 validateBundle(bundle);return bundle;
}
export function stampPaint(op:StampOp):TerrainFacePaint[]{
 const co=Math.round(Math.cos(op.yaw*Math.PI/180)),si=Math.round(Math.sin(op.yaw*Math.PI/180));
 return (op.bundle.terrainPaint??[]).map(({cell:[x,y,z],face,color})=>({cell:[x*co-y*si+op.position[0],x*si+y*co+op.position[1],z+op.position[2]],face:rotateTerrainFace(face,op.yaw),color}));
}
export function applyStamp(pkg:GamePackage,c:PropertyCodec,file:EntityFile,op:StampOp){
 validateBundle(op.bundle);const preserve=op.bundle.copyPolicy==='preserve'&&!!op.bundle.origin&&op.bundle.origin===op.context,shared=op.bundle.copyPolicy?op.bundle.copyPolicy==='preserve':op.bundle.associations==='shared';const used=new Set(file.records.map(r=>r.id)),ids=new Map<number,number>();let next=op.id;for(const r of op.bundle.records){while(used.has(next))next++;if(next>901*0x100000-1)throw Error('新增对象编号空间已满');ids.set(r.id,next);used.add(next++);}
 for(const warning of op.bundle.warnings){const match=warning.match(/#(\d+)：外部关联 (\S+)/);if(match&&ids.has(Number(match[1])))(file.analysisWarnings??=[]).push({entityId:ids.get(Number(match[1]))!,field:match[2],message:'复制时清除了外部关联 '+match[2]+'，请重新关联或确认无需使用'});}
 const angle=op.yaw*Math.PI/180,co=Math.round(Math.cos(angle)),si=Math.round(Math.sin(angle)),at=(v:Vec3)=>[v[0]*co-v[1]*si+op.position[0],v[0]*si+v[1]*co+op.position[1],v[2]+op.position[2]]as Vec3;
 const occupied=new Set(file.records.filter(r=>['Switch','Gate'].includes(r.type)).map(r=>String(c.get(r,'flavor')))),channels=new Map<string,number>();for(const r of op.bundle.records.filter(r=>!shared&&['Switch','Gate'].includes(r.type))){const raw={...r,typeIndex:file.types.indexOf(r.type),diff:Buffer.from(r.diff,'base64')},old=String(c.get(raw,'flavor'));if(!channels.has(old)){let n=1;while(occupied.has(String(n)))n++;channels.set(old,n);occupied.add(String(n));}}
 const controls=copiedControlValues(c,op.bundle.records.map(r=>({...r,typeIndex:file.types.indexOf(r.type),diff:Buffer.from(r.diff,'base64')})),ids,op.bundle.copyPolicy? !preserve:op.bundle.associations!=='shared',preserve);
 for(const snap of op.bundle.records){let r:EntityRecord={...snap,id:ids.get(snap.id)!,typeIndex:file.types.indexOf(snap.type),diff:Buffer.from(snap.diff,'base64')};if(r.typeIndex<0||!c.parse(r).complete)throw Error('组合包含当前游戏无法解析的对象');const values:Record<string,PropertyValue>={};for(const f of c.parse(r).fields){if(op.bundle.copyPolicy&&f.schema.pid&&Number(f.value)&&!ids.has(Number(f.value))&&!['turn_order_id','transmute_stashed_turn_order_id'].includes(f.schema.name)&&(!preserve||!file.records.some(r=>r.id===Number(f.value))))(file.analysisWarnings??=[]).push({entityId:r.id,field:f.schema.name,message:'跨关或独立副本清除了外部关联 '+f.schema.name+' → #'+f.value+'，请重新关联'});if(f.schema.pid)values[f.schema.name]=ids.get(Number(f.value))??((op.bundle.copyPolicy?preserve&&file.records.some(r=>r.id===Number(f.value)):op.bundle.associations==='shared')?Number(f.value):0);if(f.schema.pidArray)values[f.schema.name]=(f.value as number[]).flatMap(n=>ids.has(n)?[ids.get(n)!]:(op.bundle.copyPolicy?preserve&&file.records.some(r=>r.id===n):op.bundle.associations==='shared')?[n]:[]);}Object.assign(values,controls.get(snap.id));
  if(snap.type==='Level_Entry'){
    const binding=op.entries?.[snap.id];
    if(!binding||typeof binding.level!=='string'||!Array.isArray(binding.externalUnlocks)||binding.externalUnlocks.length!==3)throw Error('复制入口缺少目标关卡');
    values.level_name=binding.level;
    for(const [index,field] of ['unlocked_by_id','unlocked_by_id2','unlocked_by_id3'].entries()){
      const external=binding.externalUnlocks[index];
      if(!Number.isInteger(external)||external<0||external&&!file.records.some(e=>e.type==='Level_Entry'&&e.id===external))throw Error('复制入口的解锁目标不存在');
      if(external)values[field]=external;
    }
  }if(channels.size&&['Switch','Gate'].includes(r.type))values.flavor=channels.get(String(c.get(r,'flavor')))!;
  const pos=['x','y','z'].map(a=>Number(c.get(r,'position.'+a)))as Vec3;
  if(r.type==='Ocean_Map'&&op.yaw%360)values.ocean_values=(c.get(r,'ocean_values',[])as number[]).map(v=>rotatedWaterValue(v,op.yaw));
  const q=['x','y','z','w'].map(a=>Number(c.get(r,'orientation.'+a,a==='w'?1:0))),sn=Math.sin(angle/2),cs=Math.cos(angle/2),rotation=[cs*q[0]-sn*q[1],sn*q[0]+cs*q[1],cs*q[2]+sn*q[3],cs*q[3]-sn*q[2]];if(op.yaw%360)Object.assign(values,rotationValues(r.type,rotation));r=transform(c,r,at(pos));r=c.patch(r,values);file.records.push(r);
 }
 if(op.bundle.terrain.length&&!op.position.every(Number.isInteger))throw Error('含地形的区域必须按整数格放置');
 if(op.bundle.version===2&&op.bundle.terrain.length)addRegionTerrain(pkg,c,file,op.bundle.terrain.map(at));
 else if(op.bundle.terrain.length)applyTerrain(pkg,c,file,{kind:'terrain',id:op.id,cells:op.bundle.terrain.map(p=>{const[x,y,z]=at(p);return{x,y,z,solid:true};})});
}
