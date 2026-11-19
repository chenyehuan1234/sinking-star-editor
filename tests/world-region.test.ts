import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {WorldCompiler,newWorld,validateWorld,worldIssues} from '../src/core/world';
import {GamePackage,sha256} from '../src/core/package';
import {ExeReflection} from '../src/core/reflection';
import {PropertyCodec} from '../src/core/properties';
import {captureWorldRegion,pasteWorldRegion} from '../src/core/world-region';
import {parseEntities,position} from '../src/core/entities';
import {mapSpawn,upgradeSpatialWorld,worldTerrain,worldVoxels} from '../src/world-space';
import type {EditorProject,RegionPasteOptions,Vec3} from '../src/shared';
import {randomUUID} from 'node:crypto';
import {EditorService} from '../src/main/service';
import {nativeWorkbench} from '../src/native-project';
import type {NativeWorldProject} from '../src/v08-types';

const root=process.env.SINKING_STAR_GAME??'';
const available=Boolean(root)&&fs.existsSync(path.join(root,'sinking_star.exe'));

test('自制地图迁移保留地面与墙，并按 XYZ 检查不同高度的入口',()=>{
  const old=newWorld('a'.repeat(64),'test');
  old.map.tiles[0]=2;
  const world=upgradeSpatialWorld(structuredClone(old));
  assert.equal(world.version,4);
  assert.deepEqual(mapSpawn(world.map),[6,5,0]);
  assert.deepEqual(worldVoxels(world.map).slice(0,2),[[0,0,-1],[0,0,0]]);
  assert.equal(old.map.tiles[0],2);
  worldTerrain(world.map,[[6,5,2]],true);
  world.levels.push({id:'test_level',title:'测试',project:{
    format:'sinking-star-project',version:3,sourceHash:world.sourceHash,sourceBuild:world.sourceBuild,
    template:'mirror_1',name:'test_level',operations:[]
  }});
  world.map.entries.push({id:'low',title:'低层',levelId:'test_level',x:6,y:5,z:0},{id:'high',title:'高层',levelId:'test_level',x:6,y:5,z:3});
  validateWorld(JSON.parse(JSON.stringify(world)));
  assert.equal(worldIssues(world).filter(issue=>issue.severity==='error').length,0);
});

test('区域可跨工程旋转、扩图和构建，分层入口共用导入关卡并保留锁定条件',{skip:!available},()=>{
  const pkg=new GamePackage(fs.readFileSync(path.join(root,'data','levels.package')));
  const codec=new PropertyCodec(new ExeReflection(fs.readFileSync(path.join(root,'sinking_star.exe'))));
  const compiler=new WorldCompiler(pkg,codec),hash=sha256(pkg.buffer);
  const source=upgradeSpatialWorld(newWorld(hash,'test'));
  worldTerrain(source.map,[[6,5,2],[7,5,2]],true);
  source.levels.push({id:'test_level',title:'测试关',project:{
    format:'sinking-star-project',version:3,sourceHash:hash,sourceBuild:'test',template:'mirror_1',name:'test_level',operations:[]
  }});
  source.map.entries.push(
    {id:'bottom',title:'低入口',levelId:'test_level',x:6,y:5,z:0},
    {id:'top',title:'高入口',levelId:'test_level',x:7,y:5,z:3,unlocks:['bottom']}
  );
  source.map.objects=[{kind:'waterCreate',id:900*0x100000+1,position:[7,6,3],width:1,height:1},
    {kind:'water',id:900*0x100000+1,mode:'flow',direction:1,cells:[[7,6]]}];
  const project:EditorProject={format:'sinking-star-project',version:3,sourceHash:hash,sourceBuild:'test',template:'overworld',name:'overworld',operations:[]};
  const bundle=captureWorldRegion(codec,compiler.previewMap(source),source,'world',project,
    {ids:[],bounds:{min:[6,5,0],max:[7,6,3]}},['overworld'],p=>compiler.file(p.template));
  assert.equal(bundle.transfer?.entries.length,2);
  assert.equal(bundle.transfer?.levels.length,1);
  assert.ok(bundle.records.some(r=>r.type==='Ocean_Map'));
  assert.ok(bundle.terrain.some(p=>p[2]===2));
  const world=upgradeSpatialWorld(newWorld(hash,'test'));
  const options:RegionPasteOptions={expand:false,skipConflicts:false,includeDependencies:false,unlocks:{}};
  const at:Vec3=[-1,-2,0],request={world,scene:'world',bundle,at,yaw:90,id:900*0x100000+4,options};
  assert.throws(()=>pasteWorldRegion(codec,compiler.previewMap(world),request),/边界/);
  const pasted=pasteWorldRegion(codec,compiler.previewMap(world),{...request,options:{...options,expand:true}});
  assert.deepEqual(pasted.map.origin,[-2,-2]);
  assert.equal(pasted.map.entries.length,2);
  assert.equal(pasted.levels.length,1);
  assert.equal(world.map.entries.length,0);
  assert.deepEqual(pasted.map.entries[1].unlocks?.[0],pasted.map.entries[0].id);
  const runtime=compiler.build(pasted);
  const records=parseEntities(runtime.changes.get('data-common/overworld.entities')!).records;
  const bottom=records.find(r=>r.type==='Level_Entry'&&position(r)?.[2]===0)!;
  const top=records.find(r=>r.type==='Level_Entry'&&position(r)?.[2]===3)!;
  assert.ok(top);
  assert.equal(codec.get(top,'unlocked_by_id'),bottom.id);
  assert.ok(records.some(r=>r.type==='Ocean_Map'&&position(r)?.[2]===3));
});

test('原版大世界后台复制读取视野外入口，可取消并粘贴到独立工程',{skip:!available},async()=>{
  const service=new EditorService(path.resolve('workspace'));
  try{
    const catalog=await service.connect(root);
    const src:NativeWorldProject={format:'sinking-star-native-world',version:4,id:'777777777777',name:'测试源',sourceHash:catalog.sourceHash,sourceBuild:catalog.build,base:'overworld',edits:{},levelEdits:{},assignments:[]};
    const index=await service.nativeIndex(src),world=nativeWorkbench(src,index);
    const entrance=index.entryLinks?.find(e=>e.target==='mirror_1'&&e.position.every(Number.isInteger))??index.entryLinks?.find(e=>e.position.every(Number.isInteger));
    assert.ok(entrance);
    const [x,y,z]=entrance.position;
    const request={ids:[],bounds:{min:[x-1,y-1,z] as Vec3,max:[x+1,y+1,z] as Vec3}};
    const job=randomUUID();
    service.onRegionProgress=id=>service.cancelRegionJob(id);
    await assert.rejects(service.worldRegionCapture(world,'world',request,job),/已取消/);
    service.onRegionProgress=undefined;
    const bundle=await service.worldRegionCapture(world,'world',request);
    assert.ok(bundle.transfer?.entries.some(e=>e.id===entrance.id));
    assert.ok(bundle.transfer?.levels.some(l=>l.id===entrance.target));
    assert.equal(bundle.version,2);
    assert.ok(bundle.terrain.every(([x,y])=>x>=0&&x<=2&&y>=0&&y<=2));
    assert.equal(world.map.entries.length,0);
    const target=upgradeSpatialWorld(newWorld(src.sourceHash,src.sourceBuild));
    const unlocks:Record<string,string>={};
    const included=new Set(bundle.transfer!.entries.map(e=>e.id));
    for(const entry of bundle.transfer!.entries)entry.unlocks.forEach((id,slot)=>{if(id&&!included.has(id))unlocks[entry.id+':'+slot]='';});
    const pasted=await service.worldRegionPaste({world:target,scene:'world',bundle,at:[20,20,0],yaw:0,id:900*0x100000+1,
      options:{expand:false,skipConflicts:false,includeDependencies:true,unlocks}});
    assert.equal(pasted.map.entries.length,bundle.transfer!.entries.length);
    assert.ok(pasted.levels.some(l=>l.project.template===entrance.target));
    assert.equal(target.map.entries.length,0);
  }finally{
    await (service as unknown as {previews?:{dispose:()=>Promise<void>}}).previews?.dispose();
    await service.assets?.dispose();
  }
});
