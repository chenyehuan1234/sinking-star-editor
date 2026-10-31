import fs from 'node:fs';
import { GamePackage, sha256 } from '../src/core/package';
import { parseEntities, writeEntities, canEdit, position } from '../src/core/entities';
const path=process.argv[2]??(process.env.SINKING_STAR_GAME?process.env.SINKING_STAR_GAME+'/data/levels.package':'');
if(!path)throw Error('请传入 levels.package 路径，或设置 SINKING_STAR_GAME');
const pkg=new GamePackage(fs.readFileSync(path));
const levels=pkg.entries.filter(e=>e.name.endsWith('.entities'));
let records=0,editable=0;
const errors:string[]=[];
for(const e of levels)try{const f=parseEntities(e.data);if(!e.data.equals(writeEntities(f)))throw Error('往返字节不一致');records+=f.records.length;editable+=f.records.filter(canEdit).length;}catch(error){errors.push(`${e.name}: ${error}`);}
console.log(JSON.stringify({path,hash:sha256(pkg.buffer),entries:pkg.entries.length,levels:levels.length,records,editable,errors},null,2));
const f=parseEntities(pkg.get('data-common/mirror_1.entities'));
console.log(f.records.filter(r=>['Mirror','Guy','Door'].includes(r.type)).map(r=>({id:r.id,type:r.type,editable:canEdit(r),pos:position(r)})));
if(errors.length)process.exitCode=1;
