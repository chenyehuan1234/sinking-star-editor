import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
await fs.mkdir('dist/renderer',{recursive:true});
await build({entryPoints:['src/renderer/index.tsx'],bundle:true,outfile:'dist/renderer/app.js',platform:'browser',target:'chrome140',jsx:'automatic',sourcemap:true});
await build({entryPoints:['src/main/main.ts'],bundle:true,outfile:'dist/main/main.cjs',platform:'node',format:'cjs',external:['electron'],sourcemap:true});
await build({entryPoints:['src/main/preload.ts'],bundle:true,outfile:'dist/main/preload.cjs',platform:'node',format:'cjs',external:['electron']});
await build({entryPoints:['src/main/asset-worker.ts'],bundle:true,outfile:'dist/main/asset-worker.cjs',platform:'node',format:'cjs'});
await build({entryPoints:['src/main/catalog-worker.ts'],bundle:true,outfile:'dist/main/catalog-worker.cjs',platform:'node',format:'cjs'});
await fs.copyFile('src/renderer/index.html','dist/renderer/index.html');
const generatedExamples=path.resolve('dist/examples');
if(!generatedExamples.startsWith(path.resolve('dist')+path.sep))throw Error('Invalid generated examples path');
await fs.rm(generatedExamples,{recursive:true,force:true});
await fs.cp('examples','dist/examples',{recursive:true});
await fs.copyFile('LICENSE','dist/LICENSE');
await fs.copyFile('THIRD_PARTY_NOTICES.md','dist/THIRD_PARTY_NOTICES.md');
await fs.mkdir('dist/licenses',{recursive:true});
for(const name of ['react','react-dom','three']){const dir='node_modules/'+name;const names=await fs.readdir(dir);const license=names.find(n=>/^license(\.|$)/i.test(n));if(!license)throw Error('Missing license: '+name);await fs.copyFile(dir+'/'+license,'dist/licenses/'+name+'.txt');}
