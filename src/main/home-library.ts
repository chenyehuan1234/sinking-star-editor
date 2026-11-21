import path from 'node:path';
import fs from 'node:fs/promises';
import type {HomeDirectory,HomeProject,SceneThumbnail} from '../home-types';
import type {ShareDesign} from '../core/share';
import {designGroups,designLevels,digest} from '../core/share';
import {atomicWrite} from './service';
import {coverLimit,shareExpandedLimit} from '../share-types';

const supported = /^(?!.*\.last-deployed\.)[^.].*\.json$/i;
type Metadata = {roots:string[]; recent:string[]};
export function homeTitle(title:string){
  if(typeof title!=='string'||!title.trim()||title.trim().length>100||/[\x00-\x1f]/.test(title))throw Error('名称须为 1–100 个可见字符');
  return title.trim();
}
export class HomeLibrary {
  private metadata?:Promise<Metadata>;
  private files = new Map<string,string>();
  private index = new Map<string,{signature:string; row:HomeProject; document:ShareDesign}>();
  private summaries = new Map<string,{signature:string;row:HomeProject;directory:HomeDirectory}>();
  private writes = Promise.resolve();
  constructor(private readonly folder:string,private readonly workspace:()=>string){}
  settings():Promise<Metadata>{
    return this.metadata??=fs.readFile(path.join(this.folder,'library.json'),'utf8').then(text=>{
      const value=JSON.parse(text) as Metadata;
      return {roots:(value.roots??[]).filter(n=>typeof n==='string'),recent:(value.recent??[]).filter(n=>typeof n==='string')};
    }).catch(():Metadata=>({roots:[],recent:[]}));
  }
  private save(value:Metadata){
    const snapshot=JSON.stringify(value);
    const next=this.writes.then(()=>atomicWrite(path.join(this.folder,'library.json'),snapshot));
    this.writes=next.catch(()=>{});
    return next;
  }
  async addRoot(root:string){const settings=await this.settings();const location=await fs.realpath(root);if(!settings.roots.includes(location)){settings.roots.push(location);await this.save(settings);}}
  async remember(file:string){
    const settings=await this.settings();
    const resolved=await fs.realpath(file).catch(()=>path.resolve(file));
    if(settings.recent[0]!==resolved){settings.recent=[resolved,...settings.recent.filter(f=>f!==resolved)].slice(0,150);await this.save(settings);}
    const key=this.register(resolved);
    return key;
  }
  private register(file:string){const key=digest(process.platform==='win32'?file.toLowerCase():file);this.files.set(key,file);return key;}
  file(key:string){const file=this.files.get(key);if(!file)throw Error('工程不在当前资料库');return file;}
  async rename(key:string,title:string){
    const name=homeTitle(title),file=this.file(key);
    const document=await this.readFile(file);
    if(document.format==='sinking-star-project')document.title=name;
    else document.name=name;
    await atomicWrite(file,JSON.stringify(document,null,2));
    this.index.delete(key);
    this.summaries.delete(key);
  }
  async forget(key:string){
    const file=this.file(key),settings=await this.settings();
    settings.recent=settings.recent.filter(value=>value!==file);
    await this.save(settings);
    this.files.delete(key);this.index.delete(key);this.summaries.delete(key);
  }
  async readFile(file:string){
    const stat=await fs.stat(file);
    if(!stat.isFile()||stat.size>shareExpandedLimit)throw Error('工程大小无效');
    const document=JSON.parse(await fs.readFile(file,'utf8')) as ShareDesign;
    if(!document||!['sinking-star-project','sinking-star-world','sinking-star-native-world'].includes(document.format))throw Error('无法识别工程格式');
    return document;
  }
  async inspect(key:string){
    const file=this.file(key),stat=await fs.stat(file),signature=`${stat.mtimeMs}:${stat.size}`;
    const cached=this.index.get(key);
    if(cached?.signature===signature)return cached;
    const document=await this.readFile(file),levels=designLevels(document);
    const row={key,path:file,name:(document.format==='sinking-star-project'?document.title:undefined)||document.name||path.basename(file),count:levels.length,modified:stat.mtimeMs,
      cover:document.format==='sinking-star-project'?levels[0].id:'world',singleLevel:document.format==='sinking-star-project',directoryPending:document.format==='sinking-star-native-world'&&document.version===4&&!document.scenes};
    // Keep full documents only for the most recently accessed rows.
    const entry={signature,row,document};
    this.summaries.set(key,{signature,row,directory:{levels,groups:designGroups(document)}});
    if(stat.size<=3_000_000){
      if(this.index.size>=6)this.index.delete(this.index.keys().next().value!);
      this.index.set(key,entry);
    }
    return entry;
  }
  async list(last?:string){
    const settings=await this.settings(),rows=new Map<string,HomeProject>();
    const recent=[...settings.recent,...(last?[last]:[])],discovered=new Set(recent);
    for(const root of [path.join(this.workspace(),'projects'),...settings.roots]){
      for(const entry of await fs.readdir(root,{withFileTypes:true}).catch(()=>[]))if(entry.isFile()&&supported.test(entry.name))discovered.add(path.join(root,entry.name));
    }
    for(const file of discovered){
      const real=await fs.realpath(file).catch(()=>path.resolve(file)),key=this.register(real);
      try{
        const stat=await fs.stat(real),cached=this.summaries.get(key);
        rows.set(key,cached?.signature===`${stat.mtimeMs}:${stat.size}`?cached.row:(await this.inspect(key)).row);
      }
      catch(e){if(recent.includes(file)&&(e as NodeJS.ErrnoException).code==='ENOENT')rows.set(key,{key,path:file,name:path.basename(file),count:0,modified:0,cover:'world',missing:true});}
    }
    return [...rows.values()].sort((a,b)=>b.modified-a.modified);
  }
  async levels(key:string){return designLevels((await this.inspect(key)).document);}
  async directories(last?:string){
    const projects=await this.list(last);
    return {projects,directories:Object.fromEntries(projects.filter(row=>!row.missing).map(row=>[row.key,this.summaries.get(row.key)!.directory]))};
  }
  private imagePath(key:string,level:string,custom=false){this.file(key);return path.join(this.folder,'covers',digest(key+'\0'+level)+(custom?'.cover':'.json'));}
  async thumbnail(key:string,level:string){
    const custom=await fs.readFile(this.imagePath(key,level,true),'utf8').catch(()=>null);
    if(custom)return {image:custom};
    const cached=await fs.readFile(this.imagePath(key,level),'utf8').then(text=>JSON.parse(text)).catch(()=>null);
    if(!cached)return null;
    const stat=await fs.stat(this.file(key));
    return cached.signature===`${stat.mtimeMs}:${stat.size}`&&typeof cached.image==='string'?{image:cached.image,fallback:cached.fallback===true}:null;
  }
  async thumbnailSave(key:string,level:string,thumb:SceneThumbnail,signature?:string){
    imageBytes(thumb.image);
    const stat=await fs.stat(this.file(key));
    if(signature&&signature!==`${stat.mtimeMs}:${stat.size}`)throw Error('工程已更新，请重新生成预览');
    await atomicWrite(this.imagePath(key,level,!signature),signature?JSON.stringify({signature,...thumb}):thumb.image);
  }
}

export function imageBytes(image:string){
  if(typeof image!=='string'||!/^data:image\/webp;base64,[a-zA-Z0-9+/]+=*$/.test(image)||image.length>Math.ceil(coverLimit/3)*4+32)throw Error('预览图片无效或过大');
  return Buffer.from(image.slice(image.indexOf(',')+1),'base64');
}
