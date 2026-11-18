import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {copyGameFiles} from '../src/main/copy-progress';
import type {PreparationProgress} from '../src/shared';

test('首次复制按真实字节统计，包含空目录、跳过日志且不改原文件',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-copy-progress-')),source=path.join(root,'source'),dest=path.join(root,'copy');
 try{
  await fs.mkdir(path.join(source,'empty'),{recursive:true});await fs.mkdir(path.join(source,'logs'));
  const data=Buffer.alloc(9*1024*1024+17,71);await fs.writeFile(path.join(source,'large.bin'),data);await fs.writeFile(path.join(source,'small.bin'),'test');await fs.writeFile(path.join(source,'logs','ignored.txt'),'log');
  const events:PreparationProgress[]=[],r=await copyGameFiles(source,dest,p=>events.push(p)),copies=events.filter(p=>p.phase==='copy');
  assert.equal(r.totalBytes,data.length+4);assert.equal(r.copiedBytes,r.totalBytes);assert.equal(r.totalFiles,2);assert.equal(copies[0].copiedBytes,0);assert.equal(copies.at(-1)!.copiedBytes,r.totalBytes);assert.equal(copies.at(-1)!.filesCopied,2);
  assert.ok(events.some(p=>p.phase==='scan'));assert.ok(copies.every((p,i)=>p.copiedBytes>=0&&p.copiedBytes<=p.totalBytes&&(!i||p.copiedBytes>=copies[i-1].copiedBytes)));
  assert.deepEqual(await fs.readFile(path.join(dest,'large.bin')),data);assert.deepEqual(await fs.readFile(path.join(source,'large.bin')),data);assert.deepEqual(await fs.readdir(path.join(dest,'empty')),[]);await assert.rejects(()=>fs.access(path.join(dest,'logs')));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('复制目标已存在时不覆盖；源链接不被复制到受管游戏',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-copy-guard-')),source=path.join(root,'source'),dest=path.join(root,'copy');
 try{
  await fs.mkdir(source);await fs.mkdir(dest);await fs.writeFile(path.join(source,'a'),'source');await fs.writeFile(path.join(dest,'keep'),'keep');
  await assert.rejects(()=>copyGameFiles(source,dest),/EEXIST/);assert.equal(await fs.readFile(path.join(dest,'keep'),'utf8'),'keep');
  await fs.symlink(dest,path.join(source,'outside'),'junction');await assert.rejects(()=>copyGameFiles(source,path.join(root,'new')),/链接/);await assert.rejects(()=>fs.access(path.join(root,'new')));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('统计后源文件变化会停止复制，不将变化后的文件当成已完成',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-copy-change-')),source=path.join(root,'source'),dest=path.join(root,'copy');
 try{
  await fs.mkdir(source);const file=path.join(source,'a');await fs.writeFile(file,'before');const events:PreparationProgress[]=[];
  await assert.rejects(()=>copyGameFiles(source,dest,p=>{events.push(p);if(p.phase==='copy')writeFileSync(file,'updated and larger');}),/复制期间发生变化/);
  assert.equal(events.filter(p=>p.phase==='copy').at(-1)!.filesCopied,0);assert.equal(await fs.readFile(file,'utf8'),'updated and larger');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
