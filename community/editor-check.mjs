import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

const game=process.env.SINKING_STAR_GAME,sample=process.env.SSTAR_HOME_SAMPLE;
if(!game||!sample)throw Error('需要设置 SINKING_STAR_GAME 和 SSTAR_HOME_SAMPLE，后者指向一个可打开的多关工程');
const output=await fs.mkdtemp(path.resolve('workspace/community-check-'));
const profile=path.join(output,'profile'),workspace=path.join(output,'workspace'),dist=path.join(output,'dist');
await fs.mkdir(profile,{recursive:true});
await fs.mkdir(path.join(workspace,'projects'),{recursive:true});
await fs.writeFile(path.join(profile,'game-path.json'),JSON.stringify({gamePath:game}));
const fixture=JSON.parse(await fs.readFile(sample,'utf8'));
fixture.name='首页与分享验收';
fixture.levels=fixture.levels.slice(0,2);
fixture.map.entries=fixture.map.entries.filter(entry=>fixture.levels.some(level=>level.id===entry.levelId)).map(entry=>({...entry,unlocks:undefined}));
await fs.writeFile(path.join(workspace,'projects','fixture.sstar-world.json'),JSON.stringify(fixture));
await fs.cp('dist/main',path.join(dist,'main'),{recursive:true});
await fs.cp('dist/renderer',path.join(dist,'renderer'),{recursive:true});
const entry=path.join(dist,'main','editor-check.cjs');
await build({entryPoints:['community/editor-check.ts'],bundle:true,outfile:entry,platform:'node',format:'cjs',external:['electron']});
const electron=createRequire(import.meta.url)('electron');
const child=spawn(electron,[entry],{stdio:'inherit',windowsHide:true,env:{...process.env,SSTAR_COMMUNITY_QA:output,
  SINKING_STAR_USER_DATA:profile,SINKING_STAR_WORKSPACE:workspace,SINKING_STAR_COMMUNITY_URL:process.env.SINKING_STAR_COMMUNITY_URL??'http://127.0.0.1:4176',
  SINKING_STAR_OPEN_PROJECT:'',SINKING_STAR_WINDOW_SIZE:process.env.SINKING_STAR_WINDOW_SIZE??'1366x768'}});
process.exitCode=await new Promise((resolve,reject)=>{child.on('exit',code=>resolve(code??1));child.on('error',reject);});
console.log(output);
