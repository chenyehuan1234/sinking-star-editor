import fs from 'node:fs/promises';
import path from 'node:path';
import type {PreparationEstimate} from '../shared';

export function preparationRequirement(sourceBytes:number,packageBytes:number){return sourceBytes+packageBytes+256*1024*1024;}
export async function directoryBytes(root:string):Promise<number>{let total=0;for(const e of await fs.readdir(root,{withFileTypes:true})){if(e.name==='logs')continue;const p=path.join(root,e.name);if(e.isDirectory())total+=await directoryBytes(p);else if(e.isFile())total+=(await fs.stat(p)).size;}return total;}
export async function estimatePreparation(source:string,workspace:string,prepared=false):Promise<PreparationEstimate>{
  let ancestor=workspace;while(true){try{await fs.access(ancestor);break;}catch{const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('找不到工作区所在磁盘');ancestor=parent;}}
  const stat=await fs.statfs(ancestor,{bigint:true}),availableBytes=Number(stat.bavail*stat.bsize);
  const sourceBytes=prepared?0:await directoryBytes(source),packageBytes=prepared?0:(await fs.stat(path.join(source,'data/levels.package'))).size;
  const requiredBytes=prepared?0:preparationRequirement(sourceBytes,packageBytes);
  return{workspace,prepared,sourceBytes,requiredBytes,availableBytes,canPrepare:availableBytes>=requiredBytes};
}
