// Read-only data benchmark; no game/session/saves APIs.
import fs from 'node:fs';import path from 'node:path';
import {GamePackage,sha256} from '../src/core/package';
import {ExeReflection} from '../src/core/reflection';import {PropertyCodec} from '../src/core/properties';
import {NativeWorldEngine} from '../src/core/native-world';import type {NativeWorldProject} from '../src/v08-types';
const root=process.env.SINKING_STAR_GAME;if(!root)throw Error('Set SINKING_STAR_GAME');
const start=performance.now(),before=process.memoryUsage(),pkg=new GamePackage(fs.readFileSync(path.join(root,'data/levels.package'))),codec=new PropertyCodec(new ExeReflection(fs.readFileSync(path.join(root,'sinking_star.exe')))),sourceHash=sha256(pkg.buffer),engine=new NativeWorldEngine(pkg,codec,sourceHash,'benchmark',fs.readFileSync(path.join(root,'data/strings/s-cn.localization'),'utf8'));
const world:NativeWorldProject={format:'sinking-star-native-world',version:4,id:'0123456789ab',name:'read-only benchmark',base:'overworld',sourceHash,sourceBuild:'benchmark',edits:{},levelEdits:{},assignments:[]};
const index=engine.index(world),indexMs=performance.now()-start,afterIndex=process.memoryUsage(),regions=[];
for(const layer of index.layers){const cell=index.cells.filter(c=>c.layer===layer.id&&c.entries.length).sort((a,b)=>b.count-a.count)[0],cold=engine.region({session:world.id,revision:0,project:world,cellId:cell.id,neighbors:true}),warm=engine.region({session:world.id,revision:1,project:world,cellId:cell.id,neighbors:true});regions.push({layer:layer.id,cell:cell.id,records:cold.recordCount,entities:cold.view.entities.length,terrain:cold.view.terrain?.length,coldMs:cold.elapsedMs,warmMs:warm.elapsedMs});}
const level=engine.region({session:world.id,revision:0,project:world,cellId:'level:green_metamirror'}),afterRegions=process.memoryUsage();
console.log(JSON.stringify({indexMs,sourceHash,records:index.recordCount,entries:index.entryCount,regions,multiHeight:{name:'green_metamirror',records:level.recordCount,elapsedMs:level.elapsedMs},memory:{before,afterIndex,afterRegions},scope:'Node data process; excludes Electron/render/GPU; OS file cache not cleared',runtimeTested:false},null,2));
