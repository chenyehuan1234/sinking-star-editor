import fs from 'node:fs/promises';
import {build} from 'esbuild';

const target = 'dist/community/site';
await fs.mkdir(target,{recursive:true});
await Promise.all([
  build({entryPoints:['community/web.tsx'],bundle:true,outfile:target+'/app.js',platform:'browser',target:'es2022',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}}),
  fs.copyFile('community/index.html',target+'/index.html'),
]);
