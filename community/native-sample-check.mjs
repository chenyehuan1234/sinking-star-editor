import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

const game=process.env.SINKING_STAR_GAME;
if(!game)throw Error('请设置 SINKING_STAR_GAME');
const sampleDir=path.resolve(process.env.SSTAR_NATIVE_SAMPLE_DIR??'.community-local/native-sample');
const {work}=JSON.parse(await fs.readFile(path.join(sampleDir,'catalog.json'),'utf8'));
const workspace=path.resolve(process.env.SINKING_STAR_WORKSPACE??'workspace');
const original=path.join(workspace,'projects','original-world-'+work.manifest.sourceHash.slice(0,12)+'.sstar-native-world.json');
const output=await fs.mkdtemp(path.join(workspace,'native-sample-check-')),projectDir=path.join(output,'workspace','projects');
const profile=path.join(output,'profile'),dist=path.join(output,'dist');
await fs.mkdir(profile,{recursive:true});
await fs.mkdir(projectDir,{recursive:true});
await fs.writeFile(path.join(profile,'game-path.json'),JSON.stringify({gamePath:game}));
await fs.copyFile(original,path.join(projectDir,path.basename(original)));
await fs.cp('dist/main',path.join(dist,'main'),{recursive:true});
await fs.cp('dist/renderer',path.join(dist,'renderer'),{recursive:true});
const entry=path.join(dist,'main','native-sample-check.cjs');
await build({entryPoints:['community/native-sample-check.ts'],outfile:entry,bundle:true,platform:'node',format:'cjs',external:['electron']});
const child=spawn(createRequire(import.meta.url)('electron'),[entry],{stdio:'inherit',windowsHide:true,env:{...process.env,
  SSTAR_NATIVE_SAMPLE_DIR:sampleDir,SSTAR_SAMPLE_QA:output,SINKING_STAR_USER_DATA:profile,SINKING_STAR_WORKSPACE:path.dirname(projectDir),
  SINKING_STAR_COMMUNITY_URL:process.env.SINKING_STAR_COMMUNITY_URL??'http://127.0.0.1:4176',
  SINKING_STAR_OPEN_PROJECT:'',SINKING_STAR_WINDOW_SIZE:process.env.SINKING_STAR_WINDOW_SIZE??'1440x900'}});
process.exitCode=await new Promise((resolve,reject)=>{child.on('exit',code=>resolve(code??1));child.on('error',reject);});
console.log(output);
