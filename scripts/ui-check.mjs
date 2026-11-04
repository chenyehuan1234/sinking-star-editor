import {build} from 'esbuild';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';
const dir=path.resolve('workspace/ui-check-v079');await fs.mkdir(dir,{recursive:true});
for(const part of ['main','preload'])await build({entryPoints:[`scripts/ui-check-${part}.ts`],outfile:`${dir}/${part}.cjs`,platform:'node',format:'cjs',bundle:true,external:['electron']});
await build({entryPoints:['scripts/ui-check-renderer.tsx'],outfile:dir+'/app.js',platform:'browser',bundle:true,jsx:'automatic'});
await fs.writeFile(dir+'/index.html','<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
const child=spawn(createRequire(import.meta.url)('electron'),[dir+'/main.cjs'],{stdio:'inherit',windowsHide:true});const code=await new Promise(r=>child.on('exit',r));if(code)process.exitCode=Number(code);
