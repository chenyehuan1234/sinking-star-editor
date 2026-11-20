import fs from 'node:fs/promises';
import path from 'node:path';
import {matchDirectory} from '../src/level-catalog';
import type {SharedWork} from '../src/share-types';

export function nativeSample(folder:string){
  let cached:{stamp:number;work:SharedWork}|undefined;
  async function read(){
    try{
      const filename=path.join(folder,'catalog.json'),info=await fs.stat(filename);
      if(cached?.stamp!==info.mtimeMs){
        const {work}=JSON.parse(await fs.readFile(filename,'utf8'));
        cached={stamp:info.mtimeMs,work};
      }
      const names=new Set(await fs.readdir(path.join(folder,'images')).catch(()=>[]));
      return {...cached.work,cover:names.has('world.webp'),previews:cached.work.manifest.levels.filter(level=>names.has(level.id+'.webp')).map(level=>level.id)};
    }catch{return undefined;}
  }
  return async (request:Request,next:()=>Promise<Response>)=>{
    if(request.method!=='GET')return next();
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/works'))return next();
    const work=await read();if(!work)return next();
    const base='/api/works/'+work.id;
    if(url.pathname===base)return Response.json(work,{headers:{'cache-control':'no-store'}});
    if(url.pathname===base+'/cover'||url.pathname.startsWith(base+'/previews/')){
      const level=url.pathname===base+'/cover'?'world':url.pathname.slice((base+'/previews/').length);
      if(level!=='world'&&!work.previews.includes(level))return Response.json({error:'暂无本机预览图'},{status:404});
      const bytes=await fs.readFile(path.join(folder,'images',level+'.webp')).catch(()=>null);
      return bytes?new Response(new Uint8Array(bytes),{headers:{'content-type':'image/webp','cache-control':'no-store','x-content-type-options':'nosniff'}}):Response.json({error:'暂无本机预览图'},{status:404});
    }
    if(url.pathname!=='/api/works'||Number(url.searchParams.get('page')??0)!==0||['level','library'].includes(url.searchParams.get('type')??''))return next();
    const query=url.searchParams.get('q')??'',match=matchDirectory(work.manifest.levels,work.manifest.groups,query,[work.title,work.author,work.description]);
    if(!match.rootMatch&&!match.count)return next();
    const response=await next();
    if(!response.ok)return response;
    const result=await response.json() as {works:SharedWork[];more:boolean};
    return Response.json({...result,works:[work,...result.works]},{headers:{'cache-control':'no-store'}});
  };
}
