import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {community} from './app';
import {postgres} from './database';
import {nativeSample} from './native-sample-api';

const data=path.resolve(process.env.SSTAR_COMMUNITY_DATA??'.community-local');
const staticDir=path.resolve('dist/community'), port=Number(process.env.SSTAR_COMMUNITY_PORT??4176);
await fs.mkdir(data,{recursive:true});
const db=process.env.DATABASE_URL?postgres(process.env.DATABASE_URL):new PGlite(path.join(data,'postgres'));
const disk=(key:string)=>{
  const file=path.resolve(data,'blob',key);
  if(!file.startsWith(path.join(data,'blob')+path.sep))throw Error('Invalid asset key');
  return file;
};
const app=community(db,{
  get:key=>fs.readFile(disk(key)).catch(e=>{if(e.code==='ENOENT')return null;throw e;}),
  async put(key,bytes){const file=disk(key);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes,{flag:'wx'});},
  remove:key=>fs.rm(disk(key),{force:true}),
});
const files:Record<string,string>={'/':'text/html; charset=utf-8','/index.html':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/app.css':'text/css; charset=utf-8'};
const sample=nativeSample(path.resolve(process.env.SSTAR_NATIVE_SAMPLE_DIR??'.community-local/native-sample'));

createServer(async (incoming,outgoing)=>{
  try{
    const host=incoming.headers.host;
    if(host&&!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(host)){outgoing.writeHead(400).end();return;}
    const url=new URL(incoming.url??'/','http://'+(host||'127.0.0.1:'+port)),type=files[url.pathname];
    if(type){
      const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
      outgoing.writeHead(200,{'content-type':type,'x-content-type-options':'nosniff'});
      outgoing.end(await fs.readFile(path.join(staticDir,filename)));
      return;
    }
    const headers=new Headers();for(const [key,value] of Object.entries(incoming.headers))if(typeof value==='string')headers.set(key,value);
    const method=incoming.method??'GET';
    const init:RequestInit&{duplex?:'half'}={method,headers};
    if(method!=='GET'&&method!=='HEAD'){init.body=Readable.toWeb(incoming) as ReadableStream<Uint8Array>;init.duplex='half';}
    const request=new Request(url,init);
    const result=await sample(request,()=>app(request,incoming.socket.remoteAddress));
    outgoing.writeHead(result.status,Object.fromEntries(result.headers));
    if(result.body)Readable.fromWeb(result.body as never).pipe(outgoing);else outgoing.end();
  }catch(e){if(!outgoing.headersSent)outgoing.writeHead(500);outgoing.end();console.error(e);}
}).listen(port,'127.0.0.1',()=>console.log(`社区本地预览 http://127.0.0.1:${port}/`));
