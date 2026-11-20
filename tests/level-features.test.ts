import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {GamePackage,sha256} from '../src/core/package';
import {parseEntities,writeEntities} from '../src/core/entities';
import {ExeReflection} from '../src/core/reflection';
import {PropertyCodec} from '../src/core/properties';
import {applyProject,levelView,validateProject} from '../src/core/project';
import {captureRegion,stampPaint,validateBundle} from '../src/core/regions';
import {createBlank} from '../src/core/blank';
import {newWorld,WorldCompiler} from '../src/core/world';
import {upgradeSpatialWorld} from '../src/world-space';
import {levelSettingsFields} from '../src/level-settings';
import {withPrismColors} from '../src/prism-settings';
import {terrainPlacementFaces,terrainTint} from '../src/terrain-paint';
import {changedPowerRooms,roomBoundaryOpacity,roomPowerObjects} from '../src/room-power';
import {diffPreview} from '../src/preview-delta';
import type {EditorProject,EditOp,Vec3} from '../src/shared';

const root=process.env.SINKING_STAR_GAME??'';
const native=Boolean(root)&&fs.existsSync(path.join(root,'sinking_star.exe'));
const draft:EditorProject={format:'sinking-star-project',version:3,sourceHash:'a'.repeat(64),sourceBuild:'test',name:'test',template:'mirror_1',operations:[]};
let cached:{pkg:GamePackage;codec:PropertyCodec;hash:string}|undefined;
function source(){
  if(cached)return cached;
  const pkg=new GamePackage(fs.readFileSync(path.join(root,'data','levels.package')));
  const codec=new PropertyCodec(new ExeReflection(fs.readFileSync(path.join(root,'sinking_star.exe'))));
  return cached={pkg,codec,hash:sha256(pkg.buffer)};
}

test('验证时序字段与地形色，三棱镜保留非波段标志',()=>{
  assert.throws(()=>validateProject({...draft,operations:[{kind:'levelSettings',id:0,values:{lilyInterval:0}}]}),/超出范围/);
  assert.throws(()=>validateProject({...draft,operations:[{kind:'levelSettings',id:0,values:{per_screen_camera:1}}]}),/未知的关卡设置/);
  assert.throws(()=>validateProject({...draft,operations:[{kind:'terrainPaint',id:0,faces:[{cell:[0,0,0],face:5,color:'#fff'}]}]}),/刷色数据无效/);
  assert.equal(withPrismColors(4096+15,43),4096+43);
});

test('西 1 保留 6×6，镜头改构图不动分屏，新增分屏显式写入 16×16',{skip:!native},()=>{
  const {pkg,codec,hash}=source();
  const west={...draft,sourceHash:hash,template:'promesst1_streamlined'};
  const record=applyProject(pkg,west,codec);
  assert.deepEqual(writeEntities(record),pkg.get('data-common/promesst1_streamlined.entities'));
  const view=levelView(pkg,west.template,record,codec);
  assert.deepEqual(view.camera!.screenSize,[6,6]);
  assert.equal(Math.round(view.levelSettings!.roomGlow!*10),7);
  assert.ok(Math.abs(roomBoundaryOpacity(view.levelSettings)-.7)<1e-6);
  const noBoundary=levelView(pkg,'annoying_orange_v3',undefined,codec);
  assert.equal(noBoundary.camera!.perScreen,true);
  assert.equal(roomBoundaryOpacity(noBoundary.levelSettings),0);
  assert.ok(noBoundary.entities.some(e=>e.type==='Gem_Slot'));
  const hidden=levelView(pkg,west.template,applyProject(pkg,{...west,operations:[{kind:'levelSettings',id:0,values:{roomGlow:0}}]},codec),codec);
  assert.equal(roomBoundaryOpacity(hidden.levelSettings),0);
  assert.deepEqual(roomPowerObjects(hidden,{size:[6,6],origin:[0,0]},0),roomPowerObjects(view,{size:[6,6],origin:[0,0]},0));
  assert.ok(changedPowerRooms(view,{size:[6,6],origin:[0,0]},{size:[6,6],origin:[1,0]},0)>0);
  assert.equal(changedPowerRooms(view,{size:[6,6],origin:[0,0]},{size:[6,6],origin:[6,0]},0),0);
  const beamRooms=levelView(pkg,'beam_rooms',undefined,codec);
  assert.equal(beamRooms.camera!.perScreen,false);
  assert.equal(beamRooms.entities.filter(e=>e.type==='Gem_Slot').length,1);
  assert.equal(beamRooms.entities.filter(e=>e.type==='Promesst_Light').length,4);
  const generated=applyProject(pkg,{...createBlank(hash,'test',4,4),camera:{mode:'screens'}},codec);
  assert.deepEqual(levelView(pkg,'mirror_1',generated,codec).camera!.screenSize,[16,16]);
});

test('铺设地板和墙体分别保留每笔颜色和关卡默认色',{skip:!native},()=>{
  const {pkg,codec,hash}=source();
  const blank={...createBlank(hash,'test',4,4),version:3 as const};
  const floor:Vec3=[4,0,-1],wall:Vec3=[4,1,0];
  const operations:EditOp[]=[
    {kind:'terrainPaint',id:0,defaults:{floor:'#a3b7ad',wall:'#8998ad'}},
    {kind:'terrain',id:0,cells:[floor,wall].map(([x,y,z])=>({x,y,z,solid:true}))},
    {kind:'terrainPaint',id:0,faces:[...terrainPlacementFaces([floor],'floor','#229988'),...terrainPlacementFaces([wall],'wall','#b4875b')]},
  ];
  const view=levelView(pkg,blank.template,applyProject(pkg,{...blank,operations},codec),codec);
  const ground=view.terrain!.find(c=>c.x===0&&c.y===0&&c.z===0)!;
  const floorCell=view.terrain!.find(c=>c.x===4&&c.y===0&&c.z===0)!;
  const wallCell=view.terrain!.find(c=>c.x===4&&c.y===1&&c.z===1)!;
  assert.equal(ground.colors?.[4],'#a3b7ad');
  assert.equal(floorCell.colors?.[4],'#229988');
  assert.equal(floorCell.colors?.[0],'#8998ad');
  assert.equal(wallCell.colors?.[4],'#a3b7ad');
  assert.deepEqual([0,1,2,3].map(face=>wallCell.colors?.[face]),Array(4).fill('#b4875b'));
});

test('原生 Settings 写回四类时间和高亮，三棱镜写回保留原版来源',{skip:!native},()=>{
  const {pkg,codec,hash}=source();
  const template='end2_prism_hp';
  const original=applyProject(pkg,{...draft,sourceHash:hash,template},codec);
  const wand=original.records.find(record=>record.type==='Artifact'&&Number(codec.get(record,'kind'))===2)!;
  assert.equal(codec.get(wand,'p3_wand_flags'),43);
  const values={fallingRate:.55,lilyInterval:.51,skipInterval:.17,roverInterval:.92,lilyStart:.23,roomGlow:.7,lowerRoomDimming:.6};
  const operations:EditOp[]=[{kind:'levelSettings',id:0,values},{kind:'properties',id:wand.id,values:{p3_wand_flags:31}}];
  const built=applyProject(pkg,JSON.parse(JSON.stringify({...draft,sourceHash:hash,template,operations})),codec);
  const saved=parseEntities(writeEntities(built));
  const settings=saved.records.find(r=>r.type==='Settings')!;
  for(const [key,expected] of Object.entries(values)){
    const name=levelSettingsFields[key as keyof typeof values].native;
    assert.ok(Math.abs(Number(codec.get(settings,name))-expected)<1e-6,key);
  }
  assert.equal(codec.get(settings,'do_spotlight'),true);
  assert.equal(codec.get(saved.records.find(r=>r.id===wand.id)!,'p3_wand_flags'),31);
  assert.equal(levelView(pkg,template,built,codec).entities.find(e=>e.id===wand.id)?.prismPreset,43);
  const world=upgradeSpatialWorld(newWorld(hash,'test'));
  world.map.objects=operations.slice(0,1);
  const hub=new WorldCompiler(pkg,codec).previewMap(world);
  assert.ok(Math.abs(levelView(pkg,'overworld',hub,codec).levelSettings!.roverInterval!-.92)<1e-6);
});

test('地形刷色只写可见表面，复制时旋转侧面，移除后恢复默认',{skip:!native},()=>{
  const {pkg,codec,hash}=source();
  const blank={...createBlank(hash,'test',4,4),version:3 as const};
  const before=levelView(pkg,blank.template,applyProject(pkg,blank,codec),codec);
  const base=[0,0,-1] as Vec3;
  const brush={cell:base,face:1,color:'#e98150'};
  const operations:EditOp[]=[{kind:'terrainPaint',id:0,defaults:{floor:'#229988',wall:'#283752'},faces:[brush]}];
  const project={...blank,operations};
  const file=applyProject(pkg,project,codec);
  const preview=levelView(pkg,blank.template,file,codec);
  const tile=preview.terrain!.find(c=>c.x===0&&c.y===0&&c.z===0)!;
  assert.equal(tile.colors?.[1],brush.color);
  assert.equal(tile.colors?.[4],'#229988');
  const collision=(f:typeof file)=>f.records.filter(r=>r.type==='Wall_Set').map(r=>[r.id,r.diff.toString('hex')]);
  assert.deepEqual(collision(file),collision(applyProject(pkg,blank,codec)));
  const saved=parseEntities(writeEntities(file));
  const wall=saved.records.find(r=>r.type==='Inanimate'&&Math.abs(Number(codec.get(r,'position.x'))+.51)<1e-6&&codec.get(r,'position.y')===0)!;
  assert.ok(Math.abs(Number(codec.get(wall,'tint_color_a.x'))-terrainTint(brush.color)[0])<1e-6);
  const delta=diffPreview(before,preview,{scene:'blank',revision:2,baseRevision:1});
  assert.ok(delta.chunks?.some(([_,cells])=>cells.some(c=>c.colors?.[1]===brush.color)));
  const bounds={min:[0,0,0] as Vec3,max:[0,0,0] as Vec3};
  const bundle=captureRegion(codec,file,project,{ids:[],bounds,volume:true},['mirror_1']);
  validateBundle(bundle);
  const stamped={kind:'stamp' as const,id:900*0x100000+1,position:[9,9,2] as Vec3,yaw:90,bundle};
  assert.deepEqual(stampPaint(stamped).find(p=>p.color===brush.color),{cell:[9,9,1],face:3,color:brush.color});
  const after=applyProject(pkg,{...blank,operations:[...operations,stamped,{kind:'terrainPaint',id:0,faces:[{...brush,color:null}]}]},codec);
  const view=levelView(pkg,blank.template,after,codec);
  assert.equal(view.terrain!.find(c=>c.x===0&&c.y===0)?.colors?.[1],'#283752');
  assert.equal(view.terrain!.find(c=>c.x===9&&c.y===9&&c.z===2)?.colors?.[3],brush.color);
});
