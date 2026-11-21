import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

export interface PlaytestAsset {
  target: string;
  source?: string;
  hash: string | null;
}

export interface PlaytestBuild {
  key: string;
  assets: PlaytestAsset[];
}

export async function fileHash(file:string):Promise<string|null>{
  const hash=createHash('sha256');
  try{
    for await(const data of createReadStream(file))hash.update(data);
    return hash.digest('hex');
  }catch(error){
    if((error as NodeJS.ErrnoException).code==='ENOENT')return null;
    throw error;
  }
}

const assetPath=(value:unknown):value is string=>typeof value==='string'&&/^data-(common|pc)\/[a-zA-Z0-9_.-]+$/.test(value);

export async function canReusePlaytestBuild(build:PlaytestBuild|undefined,key:string,aux:string[],source:string,copy:string){
  if(build?.key!==key||!Array.isArray(build.assets)||build.assets.length!==aux.length)return false;
  const targets=new Set(aux);
  for(const asset of build.assets){
    if(!asset||!assetPath(asset.target)||!targets.delete(asset.target)||asset.source!==undefined&&!assetPath(asset.source)||asset.hash!==null&&!/^[a-f0-9]{64}$/.test(asset.hash))return false;
    if(await fileHash(path.join(copy,asset.target))!==asset.hash)return false;
    if(asset.source&&await fileHash(path.join(source,asset.source))!==asset.hash)return false;
  }
  return targets.size===0;
}
