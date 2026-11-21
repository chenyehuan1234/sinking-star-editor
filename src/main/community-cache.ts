import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

type Entry={bytes:Buffer;at:number};
type FileEntry={size:number;at:number};
export type CommunityCacheResult={bytes:Buffer|null;stale:boolean;checked?:true};
type Policy={freshMs:number;keepMs:number;diskBytes:number;entries:number};
type CacheRequest={result:Promise<CommunityCacheResult>;refresh:boolean};

export class CommunityCache {
  private memory=new Map<string,Entry>();
  private pending=new Map<string,CacheRequest>();
  private files?:Map<string,FileEntry>;
  private writes=Promise.resolve();
  private revision=0;
  private memoryBytes=0;

  constructor(private folder:string,private policy:Policy){}

  private filename(key:string){return createHash('sha256').update(key).digest('hex')+'.cache';}

  private remember(key:string,entry:Entry){
    this.drop(key);
    this.memory.set(key,entry);
    this.memoryBytes+=entry.bytes.length;
    while(this.memoryBytes>8*1024*1024||this.memory.size>this.policy.entries){
      const oldest=this.memory.keys().next().value;
      if(oldest===undefined)break;
      this.drop(oldest);
    }
  }

  private drop(key:string){
    const entry=this.memory.get(key);
    if(entry)this.memoryBytes-=entry.bytes.length;
    this.memory.delete(key);
  }

  private serialize(fn:()=>Promise<void>){
    const operation=this.writes.then(fn);
    this.writes=operation.catch(()=>{});
    return this.writes;
  }

  private async index(){
    if(this.files)return this.files;
    const names=await fs.readdir(this.folder).catch(()=>[]);
    const entries=await Promise.all(names.filter(name=>/^[a-f0-9]{64}\.cache$/.test(name)).map(async name=>{
      const stat=await fs.lstat(path.join(this.folder,name)).catch(()=>null);
      return stat?.isFile()?[name,{size:stat.size,at:stat.mtimeMs}] as const:null;
    }));
    return this.files=new Map(entries.filter(entry=>entry!==null));
  }

  private async save(key:string,entry:Entry,revision:number){
    await this.serialize(async()=>{
      if(revision!==this.revision)return;
      const files=await this.index(),name=this.filename(key);
      await fs.mkdir(this.folder,{recursive:true});
      const destination=path.join(this.folder,name),temporary=destination+'.'+process.pid+'.tmp';
      try{await fs.writeFile(temporary,entry.bytes);await fs.rename(temporary,destination);}
      finally{await fs.unlink(temporary).catch(()=>{});}
      files.set(name,{size:entry.bytes.length,at:entry.at});
      let size=[...files.values()].reduce((total,file)=>total+file.size,0);
      for(const [file,record] of [...files].sort((a,b)=>a[1].at-b[1].at)){
        if(files.size<=this.policy.entries&&size<=this.policy.diskBytes&&Date.now()-record.at<=this.policy.keepMs)break;
        await fs.unlink(path.join(this.folder,file)).catch(()=>{});
        files.delete(file);
        size-=record.size;
      }
    });
  }

  private async read(key:string,persist:boolean){
    const entry=this.memory.get(key);
    if(entry){this.remember(key,entry);return entry;}
    if(!persist)return;
    await this.writes;
    try{
      const file=path.join(this.folder,this.filename(key));
      const stat=await fs.lstat(file);
      if(stat.isFile()&&stat.size>0&&stat.size<=this.policy.diskBytes&&Date.now()-stat.mtimeMs<=this.policy.keepMs){
        return {bytes:await fs.readFile(file),at:stat.mtimeMs};
      }
    }catch{/* A cache miss can be recovered from the community server. */}
  }

  async peek(key:string,persist=true){
    const revision=this.revision,entry=await this.read(key,persist);
    if(!entry||revision!==this.revision||Date.now()-entry.at>this.policy.keepMs)return null;
    this.remember(key,entry);
    return entry.bytes;
  }

  store(key:string,bytes:Buffer){
    const entry={bytes,at:Date.now()};
    this.remember(key,entry);
    return this.save(key,entry,this.revision);
  }

  get(key:string,load:()=>Promise<Buffer|null>,options:{refresh?:boolean;persist?:boolean;canUseStale:(error:unknown)=>boolean}){
    const active=this.pending.get(key);
    if(active&&(!options.refresh||active.refresh))return active.result;
    const revision=this.revision,persist=options.persist!==false;
    const current=()=>revision===this.revision&&this.pending.get(key)?.result===pending;
    const fetch=async():Promise<CommunityCacheResult>=>{
      const previous=await this.read(key,persist);
      const usable=previous&&Date.now()-previous.at<=this.policy.keepMs;
      if(usable&&!options.refresh&&Date.now()-previous.at<this.policy.freshMs){
        if(current())this.remember(key,previous);
        return {bytes:previous.bytes,stale:false};
      }
      let bytes:Buffer|null;
      try{bytes=await load();}
      catch(error){
        if(usable&&options.canUseStale(error))return {bytes:previous.bytes,stale:true};
        if(previous&&!options.canUseStale(error)&&current())await this.invalidate(key);
        throw error;
      }
      if(bytes&&current()){
        const entry={bytes,at:Date.now()};
        this.remember(key,entry);
        if(persist)await this.save(key,entry,revision);
      }
      return {bytes,stale:false,checked:true};
    };
    const pending=fetch().finally(()=>{if(this.pending.get(key)?.result===pending)this.pending.delete(key);});
    this.pending.set(key,{result:pending,refresh:options.refresh===true});
    return pending;
  }

  invalidate(key?:string){
    this.revision++;
    if(key!==undefined){this.drop(key);this.pending.delete(key);}
    else{this.memory.clear();this.memoryBytes=0;this.pending.clear();}
    return this.serialize(async()=>{
      const files=await this.index();
      const names=key===undefined?[...files.keys()]:[this.filename(key)];
      await Promise.all(names.map(async name=>{
        await fs.unlink(path.join(this.folder,name)).catch(()=>{});
        files.delete(name);
      }));
    });
  }
}
