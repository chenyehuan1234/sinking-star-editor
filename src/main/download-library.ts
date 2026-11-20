import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicWrite} from './service';
import {digest,parseShare} from '../core/share';
import {shareLimit,type SharedWork} from '../share-types';
import type {DownloadedLevel,SceneThumbnail} from '../home-types';
import {homeTitle} from './home-library';

export class DownloadLibrary {
  constructor(private readonly folder:string){}
  private filename(key:string,ext:string){
    if(!/^[a-f0-9]{64}$/.test(key))throw Error('下载记录无效');
    return path.join(this.folder,key+'.'+ext);
  }
  async list(){
    const names=await fs.readdir(this.folder).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    const rows=await Promise.all(names.filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(async name=>{
      try {
        const entry=JSON.parse(await fs.readFile(path.join(this.folder,name),'utf8')) as DownloadedLevel;
        if(entry.key+'.json'===name)await fs.access(this.filename(entry.key,'gz'));else return null;
        return entry;
      }catch{return null;}
    }));
    return rows.filter((row):row is DownloadedLevel=>row!==null).sort((a,b)=>b.at.localeCompare(a.at));
  }
  async save(bytes:Buffer,work:Pick<SharedWork,'id'|'title'|'version'|'author'|'manifest'>,source:string,level?:string,origin:'local'|'community'='community'){
    const {manifest}=parseShare(bytes);
    if(manifest.scope==='project')throw Error('请选择单关或关卡组');
    const key=digest(JSON.stringify([source,work.id,work.version,level??'']));
    const cached=(await this.list()).find(row=>row.key===key);
    if(cached&&await this.bytes(key).catch(()=>null))return cached;
    const item:DownloadedLevel={key,name:level?work.manifest.levels.find(row=>row.id===level)?.title??work.title:work.title,
      author:work.author,version:work.version,at:new Date().toISOString(),manifest,work:work.id,source,level,size:bytes.length,origin};
    await atomicWrite(this.filename(key,'gz'),bytes);
    await atomicWrite(this.filename(key,'json'),JSON.stringify(item));
    return item;
  }
  async saveLocal(bytes:Buffer,title?:string){
    const {manifest}=parseShare(bytes);
    const name=title??manifest.levels.find(level=>level.id===manifest.primaryId)?.title??(manifest.scope==='level'?manifest.levels[0].title:manifest.title);
    return this.save(bytes,{id:digest(bytes),title:name,version:manifest.sourceBuild,author:'本机关卡',manifest},'local',undefined,'local');
  }
  async bytes(key:string){
    const file=this.filename(key,'gz');
    if((await fs.stat(file)).size>shareLimit)throw Error('下载文件超过大小上限');
    const bytes=await fs.readFile(file);parseShare(bytes);return bytes;
  }
  async item(key:string){
    const value=JSON.parse(await fs.readFile(this.filename(key,'json'),'utf8')) as DownloadedLevel;
    if(value?.key!==key)throw Error('关卡库记录无效');
    return value;
  }
  async rename(key:string,title:string){
    const item=await this.item(key);
    item.name=homeTitle(title);
    await atomicWrite(this.filename(key,'json'),JSON.stringify(item));
  }
  async remove(key:string,trash:(file:string)=>Promise<void>){
    await this.item(key);
    await trash(this.filename(key,'gz'));
    await trash(this.filename(key,'json'));
    await fs.rm(this.filename(key,'preview.json'),{force:true});
  }
  async signature(key:string){
    const stat=await fs.stat(this.filename(key,'gz'));
    return `${stat.mtimeMs}:${stat.size}`;
  }
  async thumbnail(key:string):Promise<SceneThumbnail|null>{
    const cached=await fs.readFile(this.filename(key,'preview.json'),'utf8').then(text=>JSON.parse(text)).catch(()=>null);
    if(!cached||cached.signature!==await this.signature(key)||typeof cached.image!=='string')return null;
    return {image:cached.image,fallback:cached.fallback===true};
  }
  async thumbnailSave(key:string,thumb:SceneThumbnail,signature:string){
    if(signature!==await this.signature(key))throw Error('关卡文件已更新，请重新生成预览');
    await atomicWrite(this.filename(key,'preview.json'),JSON.stringify({...thumb,signature}));
  }
}
