import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GamePackage, sha256 } from '../src/core/package';
import { parseEntities, writeEntities, patchTransform, position, baseFields, yawOf } from '../src/core/entities';

const source=process.env.SINKING_STAR_PACKAGE??(process.env.SINKING_STAR_GAME?process.env.SINKING_STAR_GAME+'/data/levels.package':'');
const available=fs.existsSync(source);
const pkg=available?new GamePackage(fs.readFileSync(source)):null;
test('损坏的包头与越界目录被拒绝',()=>{
  assert.throws(()=>new GamePackage(Buffer.alloc(128)));
  if(pkg){const b=Buffer.from(pkg.buffer);b.writeBigUInt64LE(BigInt(b.length),16);assert.throws(()=>new GamePackage(b));}
});
test('正式版全部实体文件无损往返',{skip:!available},()=>{
  for(const e of pkg!.entries.filter(e=>e.name.endsWith('.entities')))assert.deepEqual(writeEntities(parseEntities(e.data)),e.data,e.name);
  assert.deepEqual(pkg!.rebuild(),pkg!.buffer);
});
test('移动镜子同步两份坐标，未知字段不变，源数据不变',{skip:!available},()=>{
  const file=parseEntities(pkg!.get('data-common/mirror_1.entities'));
  const r=file.records.find(r=>r.type==='Mirror')!, before=Buffer.from(r.diff);
  const after=patchTransform(r,[10,13,0]);
  assert.deepEqual(position(after),[10,13,0]);assert.deepEqual(r.diff,before);
  const oldFields=baseFields(before).fields,newFields=baseFields(after.diff).fields;
  for(const f of oldFields) if(![0,1,2,0x21,0x22,0x23].includes(f.id)){
    const n=newFields.find(n=>n.id===f.id)!;assert.deepEqual(before.subarray(f.start,f.end),after.diff.subarray(n.start,n.end));
  }
  for(const id of [0x21,0x22]) {const f=newFields.find(f=>f.id===id)!;assert.equal(after.diff.readFloatLE(f.value),id===0x21?10:13);}
  assert.throws(()=>patchTransform(r,[NaN,0,0]));
  assert.deepEqual(position(patchTransform(r,[0,0,1])),[0,0,1]);
  assert.equal(yawOf(patchTransform(r,undefined,90)),90);
});
test('修改关卡重建包后其他所有条目不变',{skip:!available},()=>{
  const name='data-common/mirror_1.entities',f=parseEntities(pkg!.get(name));
  f.records=f.records.map(r=>r.type==='Mirror'?patchTransform(r,[10,13,0]):r);
  const rebuilt=new GamePackage(pkg!.rebuild(new Map([[name,writeEntities(f)]])));
  assert.equal(rebuilt.entries.length,pkg!.entries.length);
  for(const e of pkg!.entries)if(e.name!==name)assert.equal(sha256(rebuilt.get(e.name)),sha256(e.data),e.name);
});
test('实体重复 ID 与未知类型拒绝写回',{skip:!available},()=>{
  const f=parseEntities(pkg!.get('data-common/mirror_1.entities'));
  f.records.push(f.records[0]);assert.throws(()=>writeEntities(f));
});
