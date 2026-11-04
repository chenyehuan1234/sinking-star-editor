import fs from 'node:fs';
import path from 'node:path';
import{createHash}from'node:crypto';
import{inflateRawSync}from'node:zlib';
const root=process.argv[2]??'release-public',version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const sum=b=>createHash('sha256').update(b).digest('hex');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const asar=fs.readFileSync(path.join(root,'win-unpacked/resources/app.asar'));
const headerSize=asar.readUInt32LE(4),jsonSize=asar.readUInt32LE(12);
assert(headerSize>=8&&jsonSize<=headerSize-8,'Invalid ASAR header');
const header=JSON.parse(asar.subarray(16,16+jsonSize).toString()),entries=[];
function walk(files,prefix=''){for(const[name,node]of Object.entries(files)){const file=prefix+'/'+name;if(node.files)walk(node.files,file);else entries.push({file,node});}}walk(header.files);
const read=file=>{const node=entries.find(e=>e.file===file)?.node;assert(node&&!node.unpacked&&!node.link,'Missing packed file '+file);return asar.subarray(8+headerSize+Number(node.offset),8+headerSize+Number(node.offset)+node.size);};
const forbidden=/(?:^|\/)(?:workspace|backups|playtest-game|recovery|\.git)(?:\/|$)|\.(?:package|entities|texture|compressed_mesh|anim|sokoban_status|map)$/i;
assert(entries.every(e=>!forbidden.test(e.file)),'Private/native/generated file in app');
assert(JSON.parse(read('/package.json')).version===version,'Packaged version mismatch');
for(const name of['/dist/main/main.cjs','/dist/main/preload.cjs','/dist/main/asset-worker.cjs','/dist/main/catalog-worker.cjs','/dist/main/preview-worker.cjs','/dist/renderer/app.js','/dist/renderer/app.css'])assert(sum(read(name))===sum(fs.readFileSync(name.slice(1))),'Build mismatch: '+name);
const recipes=entries.filter(e=>e.file.startsWith('/dist/examples/'));assert(recipes.length===6,'Unexpected examples');
for(const{file}of recipes){const text=read(file).toString(),r=JSON.parse(text);assert(file.endsWith('.recipe.json')&&r.format==='sstar-example-recipe'&&!/"(?:diff|sourceHash|sourceBuild)"/.test(text),'Native snapshot in example '+file);}
for(const{file}of entries.filter(e=>/\.(?:js|cjs|json|md|txt)$/.test(e.file)&&!e.file.includes('/node_modules/'))){assert(!/[A-Za-z]:[\\/](?:Users|content)[\\/]/i.test(read(file).toString()),'Personal absolute path in '+file);}
for(const name of['react','react-dom','three'])assert(read('/dist/licenses/'+name+'.txt').length>100,'Missing dependency license');
const installer=`SinkingStarEditor-${version}-Setup.exe`,zip=`SinkingStarEditor-${version}-x64.zip`;
const installerBytes=fs.readFileSync(path.join(root,installer));assert(installerBytes.toString('ascii',0,2)==='MZ','Invalid installer');
// Inspect ZIP central directory and compare the actual distributed ASAR with the audited build.
const z=fs.readFileSync(path.join(root,zip));let end=z.length-22;while(end>=Math.max(0,z.length-65558)&&z.readUInt32LE(end)!==0x06054b50)end--;assert(end>=0,'Invalid ZIP');
const count=z.readUInt16LE(end+10);let pos=z.readUInt32LE(end+16),zAsar;
for(let i=0;i<count;i++){assert(z.readUInt32LE(pos)===0x02014b50,'Invalid ZIP entry');const method=z.readUInt16LE(pos+10),size=z.readUInt32LE(pos+20),length=z.readUInt16LE(pos+28),extra=z.readUInt16LE(pos+30),comment=z.readUInt16LE(pos+32),offset=z.readUInt32LE(pos+42),name=z.subarray(pos+46,pos+46+length).toString();assert(!forbidden.test(name),'Private/native file in ZIP');if(name.endsWith('resources/app.asar')){const start=offset+30+z.readUInt16LE(offset+26)+z.readUInt16LE(offset+28),data=z.subarray(start,start+size);zAsar=method===0?data:method===8?inflateRawSync(data):undefined;}pos+=46+length+extra+comment;}
assert(zAsar&&sum(zAsar)===sum(asar),'ZIP does not contain the audited application');
const hashes=[installer,zip].map(name=>`${sum(fs.readFileSync(path.join(root,name)))}  ${name}`).join('\n')+'\n';fs.writeFileSync(path.join(root,'SHA256SUMS.txt'),hashes);
console.log(JSON.stringify({version,packedFiles:entries.length,recipeCount:recipes.length,asarSha256:sum(asar),zipMatches:true,artifacts:[installer,zip,'SHA256SUMS.txt'],installationTested:false,uiTested:false,runtimeTested:false},null,2));
