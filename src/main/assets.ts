import type {AssetKind,AssetProfileRequest,AssetTimings,ProfiledAsset} from '../asset-diagnostics';
import {queueCacheTrim} from './storage';
import fs from'node:fs/promises';import path from'node:path';import{Worker}from'node:worker_threads';import{serialize,deserialize}from'node:v8';
import type{MeshAsset,TextureAsset,AssetStatus}from'../asset-types';import{GamePackage,sha256}from'../core/package';import{NativeMaterials}from'../core/materials';
export class NativeAssets {
  readonly meshNames:Set<string>;readonly textureNames:Set<string>;readonly status:AssetStatus;
  private materials:NativeMaterials;private worker?:Worker;private serial=0;private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timing?:(read:number,decode:number,total:number)=>void}>();
  private cache=new Map<string,MeshAsset|TextureAsset>();private loading=new Map<string,Promise<any>>();
  constructor(readonly root:string,readonly workspace:string,readonly identity:string,files:string[],materialPackage:GamePackage,readonly workerFile:string){
    this.meshNames=new Set(files.filter(n=>n.endsWith('.compressed_mesh')).map(n=>n.slice(0,-16)));this.textureNames=new Set(files.filter(n=>n.endsWith('.texture')).map(n=>n.slice(0,-8)));this.materials=new NativeMaterials(materialPackage);this.status={meshes:this.meshNames.size,textures:this.textureNames.size,cacheHits:0,decoded:0,failures:[]};
  }
  material(name:string){if(typeof name!=='string'||name.length>4096)throw new Error('材质标识无效');return this.materials.material(name);}
  private getWorker(){if(this.worker)return this.worker;const w=new Worker(this.workerFile);w.unref();w.on('message',m=>{const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);if(p.timing&&m.timing)p.timing(m.timing.read,m.timing.decode,m.timing.total);m.error?p.reject(new Error(m.error)):p.resolve(m.value);});const failed=(e:Error)=>{for(const p of this.pending.values())p.reject(e);this.pending.clear();this.worker=undefined;};w.on('error',failed);w.on('exit',code=>{if(code)failed(new Error('资源解码线程退出：'+code));});this.worker=w;return w;}
  private async asset(kind:'mesh'|'texture',name:string,detail:number,timings?:AssetTimings):Promise<any>{
    const names=kind==='mesh'?this.meshNames:this.textureNames;if(typeof name!=='string'||!names.has(name))throw new Error('原生资源不存在：'+name);
    const key=kind+':'+name+':'+detail;const cached=this.cache.get(key);if(cached){if(timings)timings.source='memory';this.status.cacheHits++;return cached;}if(this.loading.has(key)){if(timings)timings.source='pending';return this.loading.get(key);}
    const job=(async()=>{const file=path.join(this.root,'data-pc',name+(kind==='mesh'?'.compressed_mesh':'.texture')),st=await fs.stat(file);
      const cacheFile=path.join(this.workspace,'cache','assets',sha256(JSON.stringify(['native-assets-v2',this.identity,key,st.size,st.mtimeMs]))+'.bin');let value:MeshAsset|TextureAsset;
      value=await this.readOrDecode(cacheFile,{kind,name,file,lod:detail,maxSize:detail},timings);
      queueCacheTrim(this.workspace);this.cache.set(key,value);if(this.cache.size>80)this.cache.delete(this.cache.keys().next().value!);return value;
    })().catch(e=>{this.status.failures.push({name,error:String(e)});if(this.status.failures.length>100)this.status.failures.shift();throw e;}).finally(()=>this.loading.delete(key));
    this.loading.set(key,job);return job;
  }
  mesh(name:string,lod=1):Promise<MeshAsset>{if(!Number.isInteger(lod)||lod<0||lod>2)throw new Error('LOD 无效');return this.asset('mesh',name,lod);}
  async preview(request:{name:string;lod?:number;accessoryMask?:number;pose:'idle'},timings?:AssetTimings):Promise<MeshAsset>{
    if(!request||request.pose!=='idle'||!this.meshNames.has(request.name)||request.lod!==undefined&&(!Number.isInteger(request.lod)||request.lod<0||request.lod>2)||request.accessoryMask!==undefined&&!Number.isInteger(request.accessoryMask))throw new Error('原生姿态请求无效');
    const visible=(mesh:MeshAsset)=>request.accessoryMask===undefined?mesh:{...mesh,groups:mesh.groups.filter(g=>{const mask=Number(this.materials.material(mesh.materials[g.materialIndex]).mask??0)>>>0;return !mask||Boolean(mask&(request.accessoryMask!>>>0));})};const name=request.name,lod=request.lod??1,key='pose-v05:'+name+':'+lod,cached=this.cache.get(key);if(cached){if(timings)timings.source='memory';return visible(cached as MeshAsset);}if(this.loading.has(key)){if(timings)timings.source='pending';return visible(await this.loading.get(key));}
    const job=(async()=>{const file=path.join(this.root,'data-pc',name+'.compressed_mesh'),stat=await fs.stat(file),cacheFile=path.join(this.workspace,'cache','assets',sha256(JSON.stringify(['idle-v05-1',this.identity,key,stat.size,stat.mtimeMs]))+'.bin');const value=await this.readOrDecode(cacheFile,{kind:'pose',name,file,lod,animationFile:path.join(this.root,'data','animation.package')},timings) as MeshAsset;queueCacheTrim(this.workspace);this.cache.set(key,value);return value;})().finally(()=>this.loading.delete(key));this.loading.set(key,job);return visible(await job);
  }
  private async readOrDecode(cacheFile:string,request:{kind:'mesh'|'texture'|'pose';name:string;file:string;lod:number;maxSize?:number;animationFile?:string},timings?:AssetTimings){
    const diskStart=timings?performance.now():0;
    try{
      const value=deserialize(await fs.readFile(cacheFile));
      await fs.utimes(cacheFile,new Date(),new Date()).catch(()=>{});
      if(timings){timings.source='disk';timings.diskMs=performance.now()-diskStart;}
      if(request.kind!=='pose')this.status.cacheHits++;
      return value;
    }catch{
      if(timings){timings.source='source';timings.diskMs=performance.now()-diskStart;}
    }
    const worker=this.getWorker(),id=++this.serial,workerStart=timings?performance.now():0;
    const value=await new Promise<MeshAsset|TextureAsset>((resolve,reject)=>{
      this.pending.set(id,{resolve,reject,timing:timings?(read,decode,total)=>{
        timings.readMs=read;timings.decodeMs=decode;timings.workerBoundaryMs=Math.max(0,performance.now()-workerStart-total);
      }:undefined});
      worker.postMessage({id,...request,profile:Boolean(timings)});
    });
    if(request.kind!=='pose')this.status.decoded++;
    const cacheStart=timings?performance.now():0;
    await fs.mkdir(path.dirname(cacheFile),{recursive:true});
    const temp=cacheFile+'.'+process.pid+'.tmp';
    await fs.writeFile(temp,serialize(value));await fs.rename(temp,cacheFile);
    if(timings)timings.cacheWriteMs=performance.now()-cacheStart;
    return value;
  }

  async profile(request:AssetProfileRequest):Promise<ProfiledAsset<AssetKind>>{
    const start=performance.now();
    const timings:AssetTimings={source:'package',mainMs:0};
    let value:ProfiledAsset<AssetKind>['value'];
    const {kind,name,detail}=request;
    switch(kind){
      case 'mesh':{
        const lod=detail??1;if(!Number.isInteger(lod)||lod<0||lod>2)throw Error('LOD 无效');
        value=await this.asset(kind,name,lod,timings);break;
      }
      case 'texture':{
        const maxSize=detail??512;if(![128,256,512,1024].includes(maxSize))throw Error('纹理预览尺寸无效');
        value=await this.asset(kind,name,maxSize,timings);break;
      }
      case 'pose':value=await this.preview({name,lod:detail,pose:'idle'},timings);break;
      case 'material':value=this.material(name);break;
      default:throw Error('资源诊断类型无效');
    }
    timings.mainMs=performance.now()-start;
    return {value,timings};
  }

  texture(name:string,maxSize=512):Promise<TextureAsset>{if(![128,256,512,1024].includes(maxSize))throw new Error('纹理预览尺寸无效');return this.asset('texture',name,maxSize);}
  async dispose(){await this.worker?.terminate();this.worker=undefined;this.cache.clear();}
}
