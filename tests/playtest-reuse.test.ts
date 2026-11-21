import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {canReusePlaytestBuild,fileHash} from '../src/main/playtest-reuse';

test('复用需要匹配构建标识和实际资源，缺文件或路径异常必须重新检查',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-build-cache-'));
 try{
  const source=path.join(root,'source'),copy=path.join(root,'copy'),asset='data-pc/generated.texture',base='data-pc/base.texture';
  await fs.mkdir(path.join(source,'data-pc'),{recursive:true});
  await fs.mkdir(path.join(copy,'data-pc'),{recursive:true});
  await fs.writeFile(path.join(source,base),'asset');
  await fs.copyFile(path.join(source,base),path.join(copy,asset));
  const build={key:'unchanged',assets:[{target:asset,source:base,hash:await fileHash(path.join(source,base))}]};
  assert.equal(await canReusePlaytestBuild(build,'unchanged',[asset],source,copy),true);
  assert.equal(await canReusePlaytestBuild(build,'edited',[asset],source,copy),false);
  assert.equal(await canReusePlaytestBuild({...build,assets:[{...build.assets[0],source:'../formal'}]},'unchanged',[asset],source,copy),false);
  await fs.unlink(path.join(copy,asset));
  assert.equal(await canReusePlaytestBuild(build,'unchanged',[asset],source,copy),false);
  await fs.copyFile(path.join(source,base),path.join(copy,asset));
  await fs.writeFile(path.join(source,base),'new asset');
  assert.equal(await canReusePlaytestBuild(build,'unchanged',[asset],source,copy),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
