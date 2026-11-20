import fs from 'node:fs/promises';
import path from 'node:path';
import {GamePackage,sha256} from '../src/core/package';
import {ExeReflection} from '../src/core/reflection';
import {PropertyCodec} from '../src/core/properties';
import {UnifiedNativeWorldEngine} from '../src/core/native-world-v5';
import {nativeRegions} from '../src/core/native-regions';
import {nativeDocument,nativeWorkbench} from '../src/native-project';
import {designGroups,designLevels} from '../src/core/share';
import {directoriesOverlap,inspectInstallation} from '../src/main/game-installation';
import type {NativeWorldProject} from '../src/v08-types';
import type {SharedWork} from '../src/share-types';

const game=process.env.SINKING_STAR_GAME;
if(!game)throw Error('请设置 SINKING_STAR_GAME 为 Steam 游戏安装目录');
const installation=await inspectInstallation(game);
if(!installation.directoryValid)throw Error(installation.reason);
const [bytes,exe,text]=await Promise.all([
  fs.readFile(path.join(game,'data/levels.package')),
  fs.readFile(path.join(game,'sinking_star.exe')),
  fs.readFile(path.join(game,'data/strings/s-cn.localization'),'utf8')
]);
const pkg=new GamePackage(bytes),codec=new PropertyCodec(new ExeReflection(exe)),sourceHash=sha256(bytes),sourceBuild=installation.build;
const legacy:NativeWorldProject={format:'sinking-star-native-world',version:4,id:sourceHash.slice(0,12),
  name:'原版三层世界 · 本机样本',sourceHash,sourceBuild,base:'overworld',edits:{},levelEdits:{},assignments:[]};
const engine=new UnifiedNativeWorldEngine(pkg,codec,sourceHash,sourceBuild,text),index=engine.index(legacy),regions=nativeRegions(pkg,codec,text);
const design=nativeDocument(nativeWorkbench(legacy,index,regions)),json=JSON.stringify(design);
const workspace=path.resolve(process.env.SINKING_STAR_WORKSPACE??'workspace');
if(directoriesOverlap(await fs.realpath(workspace).catch(()=>workspace),installation.path))throw Error('请选择 Steam 游戏目录以外的工作区');
const folder=path.join(workspace,'projects'),file=path.join(folder,'original-world-'+sourceHash.slice(0,12)+'.sstar-native-world.json');
await fs.mkdir(folder,{recursive:true});
await fs.writeFile(file,json,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
const sampleDir=path.resolve(process.env.SSTAR_NATIVE_SAMPLE_DIR??'.community-local/native-sample');
await fs.mkdir(path.join(sampleDir,'images'),{recursive:true});
const now=new Date((await fs.stat(file)).mtime).toISOString(),levels=designLevels(design),groups=designGroups(design);
const work:SharedWork={id:sha256('original-world-sample:'+sourceHash).slice(0,32),title:'原版三层世界 · 本机预览',
  description:`地表、地下和天空 · ${groups.length} 个分组 · ${index.entryCount} 个大地图入口`,author:'Steam 原版目录',
  version:sourceBuild,owner:false,updated:now,created:now,cover:false,previews:[],size:0,localSample:true,
  manifest:{format:'sstar-share',version:1,scope:'project',title:design.name,sourceBuild,sourceHash,editorVersion:'0.11.0-beta.2',sha256:sha256(Buffer.from(json)),groups,levels}};
const representatives=index.layers.flatMap(layer=>{
  const names=new Set(regions.filter(region=>region.layer===layer.id).flatMap(region=>region.levels));
  return levels.filter(level=>names.has(level.id)&&level.groupId).slice(0,2).map(level=>level.id);
});
await fs.writeFile(path.join(sampleDir,'catalog.json'),JSON.stringify({work,representatives}));
console.log(JSON.stringify({file,sampleDir,levels:levels.length,groups:groups.length,entries:index.entryCount,representatives}));
