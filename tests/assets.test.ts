import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {decodeLz4,decodeMesh,decodeTexture,readNativeAsset} from '../src/core/assets';
const root=process.env.SINKING_STAR_GAME??'';
test('LZ4 重叠匹配、截断、零偏移和输出越界',()=>{
  assert.equal(decodeLz4(Buffer.from([0x14,65,1,0]),9).toString(),'AAAAAAAAA');
  assert.throws(()=>decodeLz4(Buffer.from([0xf0]),12));assert.throws(()=>decodeLz4(Buffer.from([0x10,65,0,0]),5));assert.throws(()=>decodeLz4(Buffer.from([0x14,65,1,0]),8));assert.throws(()=>readNativeAsset(Buffer.alloc(11)));
});
test('BC1 红色端点、透明模式、256 字节行距与 mip 选择',()=>{
  const b=Buffer.alloc(40+512*2);b.writeUInt16LE(8,2);b.writeUInt16LE(40,6);b.writeUInt32LE(b.length,8);b.writeUInt16LE(8,12);b.writeUInt16LE(4,14);b.writeUInt16LE(1,16);b.writeUInt16LE(2,18);b.writeUInt16LE(256,20);b.writeUInt16LE(1,22);b.writeUInt16LE(0xf800,40);b.writeUInt16LE(0xf800,48);b.writeUInt16LE(0x07e0,552);
  const a=decodeTexture(b,'fixture',128);assert.equal(a.width,8);assert.deepEqual([...a.pixels.slice(0,4)],[255,0,0,255]);assert.deepEqual([...a.pixels.slice(4*4,4*5)],[255,0,0,255]);
  const mip=decodeTexture(b,'fixture',4);assert.equal(mip.width,4);assert.deepEqual([...mip.pixels.slice(0,4)],[0,255,0,255]);
  b.writeUInt16LE(0,40);b.writeUInt16LE(0xffff,42);b.writeUInt32LE(0xffffffff,44);assert.equal(decodeTexture(b,'transparent',128).pixels[3],0);
});
test('真实静态、蒙皮、32 位索引模型及原生纹理',{skip:!fs.existsSync(root)},()=>{
  for(const name of ['Shape_Plane_Square_1','GAME_PROM_Boulder_B','warrior','soko1_goblin','soko1_dragon']){const m=decodeMesh(fs.readFileSync(root+'/data-pc/'+name+'.compressed_mesh'),name);assert.equal(m.positions.length%3,0);assert.ok(m.indices.length>0);assert.ok(m.indices.every(i=>i<m.positions.length/3));assert.ok(m.positions.every(Number.isFinite));assert.ok(m.materials.length>0);if(name==='warrior'||name==='soko1_goblin')assert.equal(m.skinned,true);}
  const a=decodeTexture(fs.readFileSync(root+'/data-pc/TER_GRND_Grass_A-DIFFR.texture'),'grass',128);assert.ok(a.width<=128);assert.equal(a.pixels.length,a.width*a.height*4);
});
