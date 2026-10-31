// Read-only native regression. Never connects a session, deploys, launches or touches saves.
import fs from'node:fs';import path from'node:path';
import{GamePackage,sha256}from'../src/core/package';
import{ExeReflection}from'../src/core/reflection';import{PropertyCodec}from'../src/core/properties';
import{materializeExample}from'../src/core/examples';import{createBlank}from'../src/core/blank';
import{applyProject,levelView}from'../src/core/project';import{parseEntities,writeEntities}from'../src/core/entities';
import{WorldCompiler,newWorld}from'../src/core/world';
import{sourceCamera,newCameraClone,cameraEditConfig}from'../src/core/camera-objects';
import{decodeMesh}from'../src/core/assets';
import{inspectInstallation}from'../src/main/game-installation';

const root=process.env.SINKING_STAR_GAME;if(!root)throw Error('请设置 SINKING_STAR_GAME');
const inspected=await inspectInstallation(root);if(!inspected.directoryValid)throw Error(inspected.reason);
const bytes=fs.readFileSync(path.join(root,'data/levels.package')),exe=fs.readFileSync(path.join(root,'sinking_star.exe'));
const pkg=new GamePackage(bytes),c=new PropertyCodec(new ExeReflection(exe)),hash=sha256(bytes),compiler=new WorldCompiler(pkg,c);
const examples=[];for(const name of fs.readdirSync('examples')){const w=materializeExample(JSON.parse(fs.readFileSync('examples/'+name,'utf8')),pkg,c,hash,inspected.build),reopened=JSON.parse(JSON.stringify(w)),built=compiler.build(reopened);examples.push({name,levels:w.levels.length,outputs:built.changes.size});}
const cameras=[];for(const name of['green_metamirror','skipping_near_beams_v2','annoying_orange_v3']){const original=pkg.get(`data-common/${name}.entities`),p={format:'sinking-star-project',version:3,template:name,name,sourceHash:hash,sourceBuild:inspected.build,operations:[]}as const;const file=applyProject(pkg,{...p,operations:[]},c);if(!writeEntities(file).equals(original))throw Error(name+' 原生数据不一致');const view=levelView(pkg,name,file,c);cameras.push({name,controls:view.camera?.controls.length,regions:view.camera?.regions.length,unchanged:true});}
const p=createBlank(hash,inspected.build),door=parseEntities(pkg.get('data-common/mirror_1.entities')).records.find(r=>r.type==='Door')!;
p.operations.push({kind:'prefab',id:900*0x100000+1,template:'mirror_1',sourceId:door.id,position:[13,7,0]});
for(const kind of['play','overview','height-lock','limiter','overview-region']as const){const source=sourceCamera(c,pkg,kind),edit=newCameraClone(c,applyProject(pkg,p,c),source.file,source.root.id,[0,0,0],source.template);p.camera=cameraEditConfig(p.camera,edit);}
const w=newWorld(hash,inspected.build);w.levels=[{id:'blank',title:'空白与五类镜头',project:p}];w.map.entries=[{id:'entry',levelId:'blank',title:'空白',x:8,y:8}];const blank=compiler.build(w);
const assets=[];for(const name of['warrior','soko1_goblin','soko1_dragon','Shape_Plane_Square_1']){const m=decodeMesh(fs.readFileSync(path.join(root,'data-pc',name+'.compressed_mesh')),name);if(!m.positions.every(Number.isFinite)||!m.indices.length)throw Error(name+' 模型无效');assets.push({name,vertices:m.positions.length/3});}
const nativeLevels=pkg.entries.filter(e=>e.name.endsWith('.entities')).length;
if(sha256(fs.readFileSync(path.join(root,'data/levels.package')))!==hash||sha256(fs.readFileSync(path.join(root,'sinking_star.exe')))!==sha256(exe))throw Error('检查期间原游戏文件发生变化');
console.log(JSON.stringify({build:inspected.build,sourceHash:hash,exeHash:sha256(exe),nativeLevelFiles:nativeLevels,examples,cameras,blankOutputs:blank.changes.size,assets,sourceUnchanged:true,runtimeTested:false,uiTested:false},null,2));
