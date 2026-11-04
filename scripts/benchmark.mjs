import {build} from 'esbuild';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';
const dir=path.resolve('workspace/benchmark-v079');await fs.mkdir(dir,{recursive:true});
await build({entryPoints:['scripts/benchmark-main.ts'],outfile:dir+'/main.cjs',platform:'node',format:'cjs',bundle:true,external:['electron']});
await build({entryPoints:['scripts/benchmark-preload.ts'],outfile:dir+'/preload.cjs',platform:'node',format:'cjs',bundle:true,external:['electron']});
await build({entryPoints:['scripts/benchmark-renderer.tsx'],outfile:dir+'/app.js',platform:'browser',target:'chrome140',bundle:true,jsx:'automatic'});
await fs.writeFile(dir+'/index.html','<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"><style>body{margin:0}.s-three-host{flex:1;min-height:400px}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>');
const require=createRequire(import.meta.url);const child=spawn(require('electron'),[dir+'/main.cjs'],{stdio:'inherit',windowsHide:true});const code=await new Promise(resolve=>child.on('exit',resolve));if(code)process.exitCode=Number(code);else {const result=JSON.parse(await fs.readFile(dir+'/results.json','utf8'));console.log(JSON.stringify(result,null,2));if(result.error)process.exitCode=1;}
