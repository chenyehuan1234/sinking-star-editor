import fs from 'node:fs/promises';
import {createReadStream,createWriteStream,constants} from 'node:fs';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import type {PreparationProgress} from '../shared';

/** Copy only regular game files. Never follow installation links into other data. */
export async function copyGameFiles(source:string,destination:string,onProgress?:(p:PreparationProgress)=>void,onCreated?:()=>Promise<void>){
 const files:{name:string;size:number;mtime:number;mode:number}[]=[],directories:string[]=[];
 let totalBytes=0,copiedBytes=0,filesCopied=0,lastNotification=0;
 const notify=(phase:PreparationProgress['phase'],currentFile?:string,force=false)=>{
  const now=Date.now();if(!force&&now-lastNotification<120)return;lastNotification=now;
  onProgress?.({phase,totalBytes,copiedBytes,totalFiles:files.length,filesCopied,currentFile});
 };
 notify('scan',undefined,true);
 async function scan(relative:string){
  for(const entry of await fs.readdir(path.join(source,relative),{withFileTypes:true})){
   if(entry.name==='logs')continue;
   const name=path.join(relative,entry.name),stat=await fs.lstat(path.join(source,name));
   if(stat.isSymbolicLink())throw Error('游戏目录包含链接，无法安全复制：'+name);
   if(stat.isDirectory()){directories.push(name);await scan(name);}
   else if(stat.isFile()){files.push({name,size:stat.size,mtime:stat.mtimeMs,mode:stat.mode});totalBytes+=stat.size;}
   else throw Error('不支持的游戏资源类型：'+name);
   notify('scan',name);
  }
 }
 await scan('');
 await fs.mkdir(destination,{recursive:false});
 await onCreated?.();
 for(const directory of directories)await fs.mkdir(path.join(destination,directory));
 notify('copy',undefined,true);
 for(const file of files){
  const from=path.join(source,file.name),to=path.join(destination,file.name),before=await fs.lstat(from);
  if(!before.isFile()||before.isSymbolicLink()||before.size!==file.size||before.mtimeMs!==file.mtime)throw Error('游戏资源在复制期间发生变化，请重新连接：'+file.name);
  if(file.size<8*1024*1024){await fs.copyFile(from,to,constants.COPYFILE_EXCL);copiedBytes+=file.size;}
  else await pipeline(createReadStream(from,{highWaterMark:1024*1024}),new Transform({transform(chunk:Buffer,_encoding,callback){copiedBytes+=chunk.length;notify('copy',file.name);callback(null,chunk);}}),createWriteStream(to,{flags:'wx',mode:file.mode}));
  const after=await fs.lstat(from);
  if(!after.isFile()||after.size!==file.size||after.mtimeMs!==file.mtime)throw Error('游戏资源在复制期间发生变化，请重新连接：'+file.name);
  filesCopied++;notify('copy',file.name);
 }
 notify('copy',undefined,true);
 return{totalBytes,copiedBytes,totalFiles:files.length,filesCopied};
}
