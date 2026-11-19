import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

const game=process.env.SINKING_STAR_GAME;
if(!game)throw Error('请设置 SINKING_STAR_GAME');
const qaRoot=path.resolve('workspace/project-tabs-check');
await fs.mkdir(qaRoot,{recursive:true});
const output=await fs.mkdtemp(path.join(qaRoot,'run-')),profile=path.join(output,'profile');
await fs.mkdir(profile,{recursive:true});
await fs.writeFile(path.join(profile,'game-path.json'),JSON.stringify({gamePath:game}));
const dist=path.join(output,'dist');
await fs.cp(path.resolve('dist'),dist,{recursive:true});
const entry=path.join(dist,'main','project-tabs-check.cjs');
await build({entryPoints:['scripts/project-tabs-check.ts'],outfile:entry,bundle:true,platform:'node',format:'cjs',external:['electron']});
const child=spawn(createRequire(import.meta.url)('electron'),[entry],{
  stdio:'inherit',windowsHide:true,
  env:{...process.env,SINKING_STAR_TABS_QA:output,SINKING_STAR_USER_DATA:profile,
    SINKING_STAR_WORKSPACE:output,SINKING_STAR_OPEN_PROJECT:'',SINKING_STAR_WINDOW_SIZE:'1240x820'}
});
process.exitCode=await new Promise((resolve,reject)=>{
  child.once('error',reject);
  child.once('exit',code=>resolve(code??1));
});
console.log('测试结果 '+path.join(output,'results.json'));
