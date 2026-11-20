import fs from 'node:fs/promises';
import {build} from 'esbuild';

const target = 'dist/community';
await fs.mkdir(target,{recursive:true});
await Promise.all([
  build({entryPoints:['community/web.tsx'],bundle:true,outfile:target+'/app.js',platform:'browser',target:'es2022',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}}),
  build({entryPoints:['community/edge.ts'],bundle:true,outfile:target+'/cloud-functions/api/[[default]].js',platform:'node',target:'node20',format:'esm',external:['pg-native'],banner:{js:"import {createRequire as communityRequire} from 'node:module'; const require=communityRequire(import.meta.url);"}}),
  fs.copyFile('community/index.html',target+'/index.html'),
  fs.writeFile(target+'/package.json',JSON.stringify({name:'sinking-star-community-preview',type:'module',private:true})),
]);
