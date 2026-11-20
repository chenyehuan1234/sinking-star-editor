import {freezerConditions,isFreezerCondition} from '../association';
import type {EditorProject,RegionBundle,RegionEntrance,RegionLevelLink,RegionPasteRequest,RegionSelection,StampOp,Vec3,WorldEntry,WorldLevel,WorldProject} from '../shared';
import type {EntityFile} from './entities';
import type {PropertyCodec} from './properties';
import {position} from './entities';
import {captureRegion,stampPaint,validateRegionTransfer} from './regions';
import {regionPoint,regionCorners} from '../region-placement';
import {cellKey,upgradeSpatialWorld,worldContains,worldExpansion,worldTerrain,worldVerticalBounds} from '../world-space';
import {waterLayout,waterView} from './water';
import {rotatedWaterValue} from '../water-edit';

export const entranceUnlockFields=['unlocked_by_id','unlocked_by_id2','unlocked_by_id3'] as const;

export function captureWorldRegion(codec:PropertyCodec,file:EntityFile,world:WorldProject,scene:string,project:EditorProject,selection:RegionSelection,sources:string[],loadLevel:(project:EditorProject)=>EntityFile,progress:(phase?:string)=>void=()=>{}){
  progress('读取区域边界与入口');
  const box=selection.bounds;
  if(!box||box.min.some((v,i)=>!Number.isInteger(v)||!Number.isInteger(box.max[i])||v>box.max[i]||Math.abs(v)>=10000||Math.abs(box.max[i])>=10000))throw Error('区域边界无效');
  const size=box.max.map((v,i)=>v-box.min[i]+1) as Vec3;
  if(size[0]*size[1]*size[2]>1_000_000)throw Error('选框超过 100 万格，请缩小范围');
  const worldScene=scene==='world';
  const levelsById=new Map(world.levels.map(l=>[l.id,l]));
  const levelsByName=new Map<string,WorldLevel>();
  for(const l of world.levels)if(!levelsByName.has(l.project.name))levelsByName.set(l.project.name,l);
  const findLevel=(target:string)=>levelsById.get(target)??levelsByName.get(target)??levelsById.get(target.replace('ed_'+world.id+'_',''));
  const entries:RegionEntrance[]=[];
  const managedEntries=new Map(world.map.entries.map(entry=>[file.managedEntryIds?.get(entry.id),entry]));
  const rawEntries=worldScene?file.records.filter(r=>r.type==='Level_Entry'):[];
  for(let i=0;i<rawEntries.length;i++){
    if((i&127)===0)progress();
    const r=rawEntries[i],pos=position(r);
    if(!pos||pos.some((v,a)=>v<box.min[a]||v>box.max[a]))continue;
    if(!codec.parse(r).complete)throw Error('入口 #'+r.id+' 无法读取');
    const managed=managedEntries.get(r.id);
    const target=managed?.levelId??String(codec.get(r,'level_name',''));
    if(!findLevel(target))throw Error('入口 #'+r.id+' 的目标关卡不存在：'+target);
    entries.push({
      id:r.id,title:managed?.title??findLevel(target)!.title,levelId:findLevel(target)!.id,
      position:pos.map((v,a)=>v-box.min[a]) as Vec3,appearance:r.diff.toString('base64'),
      unlocks:entranceUnlockFields.map(field=>Number(codec.get(r,field,0))),
      unlockAny:Boolean(codec.get(r,'unlock_is_or_gate',false))
    });
  }
  const spawn=worldScene?file.records.find(r=>r.type==='Guy'&&(r.id>>>20)<899):undefined;
  const source=spawn?{...file,records:file.records.filter(r=>r.id!==spawn.id)}:file;
  progress('按范围读取地形、水域和玩法物件');
  const bundle=captureRegion(codec,source,project,{...selection,ids:[],volume:true,copyPolicy:'preserve'},sources,progress);
  progress('收集入口关联的小关与依赖');
  const queue=entries.map(e=>e.levelId),copied=new Map<string,WorldLevel>(),links:RegionLevelLink[]=[];
  for(let index=0;index<queue.length;index++){
    progress();
    const id=queue[index],level=levelsById.get(id);
    if(!level||copied.has(id))continue;
    copied.set(id,{...level,folderId:undefined});
    const design=loadLevel(level.project);
    for(const door of design.records.filter(record=>record.type==='Door')){
      for(const field of ['target_level','switch_to_level_set'] as const){
        const target=String(codec.get(door,field,''));
        if(!target||['overworld','intro'].includes(target))continue;
        const dependency=findLevel(target);
        links.push({levelId:id,doorId:door.id,field,target,targetId:dependency?.id});
        if(dependency&&!copied.has(dependency.id))queue.push(dependency.id);
      }
    }
  }
  const selectedIds=new Set(bundle.records.map(record=>record.id));
  const channels=[...new Set(file.records.filter(record=>selectedIds.has(record.id)&&['Switch','Gate'].includes(record.type)).map(record=>String(codec.get(record,'flavor',0))))];
  const entriesById=new Map(rawEntries.map(record=>[record.id,managedEntries.get(record.id)?.title??findLevel(String(codec.get(record,'level_name','')))?.title??String(codec.get(record,'level_name',''))]));
  const conditionLinks=file.records.filter(record=>record.type==='Freezer'&&selectedIds.has(record.id)).flatMap(record=>freezerConditions.flatMap(field=>{
    const targetId=Number(codec.get(record,field,0));
    return entriesById.has(targetId)?[{sourceId:record.id,field,targetId,title:entriesById.get(targetId)}]:[];
  }));
  bundle.transfer={size,entries,levels:[...copied.values()],links,channels,conditionLinks};
  bundle.name='复制区域 '+size.join(' × ');
  if(!bundle.records.length&&!bundle.terrain.length&&!entries.length)throw Error('复制范围内没有可复用内容');
  validateRegionTransfer(bundle);
  return bundle;
}

export function pasteWorldRegion(codec:PropertyCodec,file:EntityFile,request:RegionPasteRequest,progress:(phase?:string)=>void=()=>{}){
  progress('检查粘贴范围与入口冲突');
  const {scene,bundle,at,yaw,id,options}=request;
  validateRegionTransfer(bundle);
  const transfer=bundle.transfer;
  if(!transfer||!Array.isArray(at)||at.length!==3||!at.every(n=>Number.isInteger(n)&&Math.abs(n)<10000)||![0,90,180,270].includes((yaw%360+360)%360))throw Error('区域粘贴位置或方向无效');
  const world=structuredClone(request.world);
  if(bundle.sourceHash!==world.sourceHash||bundle.sourceBuild!==world.sourceBuild)throw Error('区域与目标工程的原生来源不一致');
  const worldScene=scene==='world',managed=worldScene&&!world.native;
  const project=worldScene?undefined:world.levels.find(l=>l.id===scene)?.project;
  if(!worldScene&&!project)throw Error('目标关卡已不存在');
  const entries=worldScene?transfer.entries:[];
  const placed=(p:Vec3)=>regionPoint(p,at,yaw);
  const entryPoint=(e:RegionEntrance):Vec3=>placed(e.position).map(Math.round) as Vec3;
  const nativeEntries=file.records.filter(r=>r.type==='Level_Entry');
  const occupied=new Set(managed?world.map.entries.map(e=>cellKey([e.x,e.y,e.z??0])):nativeEntries.map(e=>cellKey((position(e)??[0,0,0]).map(Math.round) as Vec3)));
  const accepted:RegionEntrance[]=[];
  for(const e of entries){
    const key=cellKey(entryPoint(e));
    if(occupied.has(key)){
      if(!options.skipConflicts)throw Error('入口「'+e.title+'」与目标入口重叠，请移开或选择跳过冲突项');
      continue;
    }
    occupied.add(key);
    accepted.push(e);
  }

  progress('重映射关卡与解锁条件');
  const levelIds=new Map<string,string>(),copied:WorldLevel[]=[];
  const sources=new Map(transfer.levels.map(l=>[l.id,l]));
  const pending=accepted.map(e=>e.levelId);
  const usedLevels=new Set(world.levels.map(l=>l.id));
  for(let i=0;i<pending.length;i++){
    progress();
    const oldId=pending[i];
    if(levelIds.has(oldId))continue;
    const source=sources.get(oldId);
    if(!source)throw Error('缺少要复制的关卡：'+oldId);
    let next='copied_'+id.toString(36)+'_'+levelIds.size.toString(36);
    while(usedLevels.has(next))next+='_';
    usedLevels.add(next);
    levelIds.set(oldId,next);
    copied.push({id:next,title:source.title,project:{...structuredClone(source.project),name:next}});
    for(const link of transfer.links.filter(link=>link.levelId===oldId)){
      if(link.targetId&&options.includeDependencies)pending.push(link.targetId);
    }
  }
  for(const link of transfer.links){
    const level=copied.find(l=>l.id===levelIds.get(link.levelId));
    if(!level)continue;
    const target=(link.targetId&&levelIds.get(link.targetId))??world.levels.find(l=>[l.id,l.project.name].includes(link.target))?.id;
    if(!target)throw Error('关卡「'+level.title+'」缺少出口／关卡序列依赖：'+link.target);
    level.project.operations.push({kind:'properties',id:link.doorId,values:{[link.field]:target}});
  }

  const usedEntries=new Set(world.map.entries.map(e=>e.id));
  const copiedEntries=new Map(accepted.map((e,i)=>{
    let next='entry_'+id.toString(36)+'_'+i.toString(36);
    while(usedEntries.has(next))next+='_';
    usedEntries.add(next);
    return [e.id,next];
  }));
  const existingNative=new Set(nativeEntries.map(e=>e.id));
  const external=(e:RegionEntrance,slot:number)=>{
    if(!e.unlocks[slot]||copiedEntries.has(e.unlocks[slot]))return '';
    const choice=options.unlocks[e.id+':'+slot];
    if(choice===undefined)throw Error('请处理入口「'+e.title+'」的框外解锁条件');
    if(choice&&(managed?!world.map.entries.some(v=>v.id===choice):!existingNative.has(Number(choice))))throw Error('目标解锁入口已不存在');
    return choice;
  };
  progress('合并水格并检查水流冲突');
  const existingWater=new Map<string,number>();
  for(const record of file.records){
    if(record.type!=='Ocean_Map')continue;
    progress();
    const water=waterView(codec,file,record);
    if(water.error)continue;
    for(let i=0;i<water.cells.length;i++)if(water.cells[i])existingWater.set(cellKey([water.x+i%water.width,water.y+Math.floor(i/water.width),water.gridZ??water.z]),water.cells[i]);
  }
  const records=bundle.records.flatMap(record=>{
    if(record.type!=='Ocean_Map')return [record];
    const raw={...record,typeIndex:file.types.indexOf(record.type),diff:Buffer.from(record.diff,'base64')};
    const layout=waterLayout(codec,raw);
    const previous=codec.get(raw,'ocean_values',[]) as number[];
    const cells=previous.map((value,i)=>{
      if(!value)return 0;
      const key=cellKey(placed([...layout.at(i),layout.gridZ]));
      const output=rotatedWaterValue(value,yaw);
      if(!existingWater.has(key)){existingWater.set(key,output);return value;}
      if(existingWater.get(key)!==output&&!options.skipConflicts)throw Error('水流在 '+key+' 与目标水域冲突，请移动落点或选择跳过冲突项');
      return 0;
    });
    return cells.some(Boolean)?[{...record,diff:codec.patch(raw,{ocean_values:cells}).diff.toString('base64')}]:[];
  });
  const stamp:StampOp={kind:'stamp',id,position:at,yaw,bundle:{...bundle,transfer:undefined,records}};
  progress('生成粘贴后的地形与物件');
  if(managed){
    upgradeSpatialWorld(world);
    const corners=regionCorners(transfer.size,at,yaw);
    if(corners.some(([x,y])=>!worldContains(world.map,x,y))){
      if(!options.expand)throw Error('选框超出大地图边界，请确认扩图或调整落点');
      Object.assign(world.map,worldExpansion(world.map,corners));
    }
    worldTerrain(world.map,bundle.terrain.map(placed),true);
    const colors=stampPaint(stamp);
    for(let i=0;i<colors.length;i+=4096)(world.map.objects??=[]).push({kind:'terrainPaint',id:0,faces:colors.slice(i,i+4096)});
    stamp.bundle.terrain=[];
    delete stamp.bundle.terrainPaint;
    const inserted:WorldEntry[]=accepted.map(e=>{
      const [x,y,z]=entryPoint(e);
      return {id:copiedEntries.get(e.id)!,title:e.title,levelId:levelIds.get(e.levelId)!,x,y,z,appearance:e.appearance,
        unlocks:e.unlocks.map((target,i)=>copiedEntries.get(target)||external(e,i)||null) as WorldEntry['unlocks'],unlockAny:e.unlockAny};
    });
    world.map.entries.push(...inserted);
    worldVerticalBounds(world.map,corners);
  }else if(worldScene){
    stamp.entries={};
    for(const e of accepted){
      stamp.entries[e.id]={level:levelIds.get(e.levelId)!,externalUnlocks:e.unlocks.map((_,i)=>Number(external(e,i)||0))};
      stamp.bundle.records.push({id:e.id,type:'Level_Entry',diff:codec.patch({id:e.id,type:'Level_Entry',typeIndex:file.types.indexOf('Level_Entry'),diff:Buffer.from(e.appearance,'base64')},{
        'position.x':e.position[0],'position.y':e.position[1],'position.z':e.position[2],
        'visual_position.x':e.position[0],'visual_position.y':e.position[1],'visual_position.z':e.position[2],
        tower_flags:0,dropdown:false,currently_broken:false,currently_disfavored:false,can_move:false,riding_on_id:0,enabled_t_target:1
      }).diff.toString('base64')});
    }
  }
  for(const link of transfer.conditionLinks??[]){
    if(!isFreezerCondition(link.field)||!stamp.bundle.records.some(r=>r.id===link.sourceId&&r.type==='Freezer'))throw Error('区域的冰封屏障条件无效');
    let target:string|number=0;
    if(worldScene){
      const copied=copiedEntries.get(link.targetId);
      if(copied)target=managed?copied:-link.targetId;
      else{
        const choice=options.unlocks['freezer:'+link.sourceId+':'+link.field];
        if(choice===undefined)throw Error('请处理冰封屏障 #'+link.sourceId+' 的框外解冻条件');
        if(choice){
          if(managed?!world.map.entries.some(e=>e.id===choice):!existingNative.has(Number(choice)))throw Error('解冻条件入口已不存在');
          target=managed?choice:Number(choice);
        }
      }
    }
    ((stamp.conditionTargets??={})[link.sourceId]??={})[link.field]=target;
  }
  world.levels.push(...copied);
  if(stamp.bundle.records.length||stamp.bundle.terrain.length){
    const operations=worldScene?(world.map.objects??=[]):project!.operations;
    operations.push(stamp);
  }
  return world;
}
