import {getStore} from '@edgeone/pages-blob';
import {community} from './app';
import {postgres} from './database';

let app:ReturnType<typeof community>|undefined;

export function onRequest(context:{request:Request;env?:Record<string,string|undefined>}){
  if(!app){
    const url=context.env?.DATABASE_URL??process.env.DATABASE_URL;
    if(!url)return Response.json({error:'预览尚未连接社区数据库'}, {status:503});
    const store=getStore('sstar-community');
    app=community(postgres(url),{
      get:async key=>{const value=await store.get(key,{type:'arrayBuffer',consistency:'strong'});return value?Buffer.from(value):null;},
      put:(key,bytes)=>store.set(key,new Uint8Array(bytes).buffer),
      remove:key=>store.delete(key),
    });
  }
  return app(context.request,context.request.headers.get('x-real-ip')??context.request.headers.get('eo-connecting-ip')??'edge');
}
