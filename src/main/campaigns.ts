import fs from'node:fs/promises';import path from'node:path';import os from'node:os';
import{newCampaign,readCampaign,writeCampaign,apolloNow,campaignTimestamp}from'../core/campaign';
interface Owner {format:'sinking-star-test-campaign';worldId:string;sourceHash:string}
interface Session {worldId:string;sourceHash:string;active:boolean}
export class CampaignManager {
  constructor(readonly workspace:string,readonly saves=path.join(os.homedir(),'Saved Games','Order of the Sinking Star')){}
  private async sharedPlaytestDirectory(create=false,fresh=false,library=false){
    if(create)await fs.mkdir(this.saves,{recursive:true});
    const name=library?'Editor_Playtest_Library':fresh?'Editor_Playtest_Fresh':'Editor_Playtest';
    const root=await fs.realpath(this.saves),dir=path.join(root,name);
    const owner=path.join(dir,'_editor-shared-playtest.json');
    if(create){
      try{
        await fs.mkdir(dir);
        await fs.writeFile(owner,JSON.stringify({format:'sstar-shared-playtest',version:1}),{flag:'wx'});
      }catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    }
    const folder=await fs.lstat(dir);
    if(!folder.isDirectory()||folder.isSymbolicLink()||await fs.realpath(dir)!==dir)throw Error('目录 '+name+' 已被其他存档占用');
    const marker=await fs.lstat(owner).catch(()=>null);
    if(!marker?.isFile()||marker.isSymbolicLink())throw Error('目录 '+name+' 已被其他存档占用');
    const metadata=JSON.parse(await fs.readFile(owner,'utf8'));
    if(metadata.format!=='sstar-shared-playtest'||metadata.version!==1)throw Error('目录 '+name+' 已被其他存档占用');
    return dir;
  }
  private async startupPriority(directory:string){
    const root=path.dirname(directory);
    let time=apolloNow(),modified=Date.now();
    for(const entry of await fs.readdir(root,{withFileTypes:true})){
      if(!entry.isDirectory()||entry.isSymbolicLink()||path.join(root,entry.name)===directory)continue;
      const file=path.join(root,entry.name,'Status.sokoban_status'),stat=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      if(!stat?.isFile()||stat.isSymbolicLink())continue;
      const status=await fs.open(file,'r');
      try{
        const header=Buffer.alloc(24),{bytesRead}=await status.read(header,0,header.length,0);
        if(bytesRead!==24||header.readUInt32LE()!==33||header.readUInt32LE(4)!==0)continue;
        const candidate=campaignTimestamp(header);
        if(candidate>time)time=candidate;
        modified=Math.max(modified,stat.mtimeMs);
      }finally{await status.close();}
    }
    if(time>=(1n<<127n)-1n)throw Error('无法为试玩设置启动顺序，正式战役保持原样');
    return {time:time+1n,mtime:new Date(modified+2000)};
  }
  async startSharedPlaytest(current:string,fresh=false,library=false){
    if(!/^[a-zA-Z0-9_.-]{1,116}$/.test(current)||current==='.'||current.includes('..'))throw Error('试玩起始关卡无效');
    const directory=await this.sharedPlaytestDirectory(true,fresh,library);
    const file=path.join(directory,'Status.sokoban_status');
    const data=await this.readSharedStatus(file),priority=await this.startupPriority(directory);
    if(fresh||library){
      const histories=(await fs.readdir(directory,{withFileTypes:true})).filter(entry=>/\.history(?:\.[\w.-]+)?$|^Status\.sokoban_status\.[\w.-]+$/i.test(entry.name));
      if(histories.some(entry=>!entry.isFile()||entry.isSymbolicLink()))throw Error('从头试玩的旧进度包含异常文件');
      for(const entry of histories)await fs.unlink(path.join(directory,entry.name));
    }
    // The rivers backdrop crashes when it is first drawn on the affected build.
    await this.write(file,writeCampaign(!fresh&&!library&&data?data:newCampaign(),{current,menu:'menu_heroes_a',time:priority.time}));
    await fs.utimes(file,priority.mtime,priority.mtime);
  }
  async finishSharedPlaytest(fresh=false,library=false){
    const directory=await this.sharedPlaytestDirectory(false,fresh,library);
    const file=path.join(directory,'Status.sokoban_status'),data=await this.readSharedStatus(file);
    if(!data)return;
    // Let Steam resume its most recently played regular campaign on next launch.
    await this.write(file,writeCampaign(data,{time:0n}));
    await fs.utimes(file,new Date(0),new Date(0));
  }
  private async readSharedStatus(file:string){
    const stat=await fs.lstat(file).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return null;});
    if(!stat)return null;
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('试玩战役状态文件无效');
    return fs.readFile(file);
  }
  directory(id:string){if(!/^[a-f0-9]{12}$/.test(id))throw new Error('测试战役标识无效');return path.join(this.saves,`Editor_${id}`);}
  private sessionPath(){return path.join(this.workspace,'campaign-session.json');}
  private async write(file:string,data:Buffer|string){const temp=file+`.${process.pid}.tmp`;await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(temp,data);await fs.rename(temp,file);}
  async owned(id:string,hash:string){
    const dir=this.directory(id);const stat=await fs.lstat(dir);if(stat.isSymbolicLink())throw new Error('测试战役目录不能是符号链接');
    const owner=JSON.parse(await fs.readFile(path.join(dir,'_editor-owner.json'),'utf8'))as Owner;
    if(owner.format!=='sinking-star-test-campaign'||owner.worldId!==id||owner.sourceHash!==hash)throw new Error('测试战役不属于当前工程，停止修改');return dir;
  }
  async ensure(id:string,hash:string){
    const dir=this.directory(id);
    try{return await this.owned(id,hash);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    try{await fs.access(dir);throw new Error('同名战役已存在但未登记归属，停止覆盖');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    await fs.mkdir(dir,{recursive:true});await this.write(path.join(dir,'_editor-owner.json'),JSON.stringify({format:'sinking-star-test-campaign',worldId:id,sourceHash:hash} satisfies Owner));
    const file=path.join(dir,'Status.sokoban_status');await this.write(file,writeCampaign(newCampaign(),{time:0n}));await fs.utimes(file,new Date(0),new Date(0));return dir;
  }
  async activate(id:string,hash:string,current="overworld"){
    const dir=await this.ensure(id,hash),file=path.join(dir,'Status.sokoban_status');
    const archive=path.join(this.workspace,'backups',`test-history-${Date.now()}`);await fs.mkdir(archive,{recursive:true});
    for(const name of['overworld.history','intro.history'])try{await fs.copyFile(path.join(dir,name),path.join(archive,name));await fs.unlink(path.join(dir,name));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    await this.write(this.sessionPath(),JSON.stringify({worldId:id,sourceHash:hash,active:true} satisfies Session));
    const b=await fs.readFile(file);await this.write(file,writeCampaign(b,{current,time:apolloNow()}));await fs.utimes(file,new Date(),new Date());return dir;
  }
  async deactivate(){
    let s:Session;try{s=JSON.parse(await fs.readFile(this.sessionPath(),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
    if(!s.active)return;const dir=await this.owned(s.worldId,s.sourceHash),file=path.join(dir,'Status.sokoban_status');
    let earliest:bigint|undefined;
    for(const d of await fs.readdir(this.saves,{withFileTypes:true})){if(!d.isDirectory()||d.name.startsWith('Editor_'))continue;try{const c=readCampaign(await fs.readFile(path.join(this.saves,d.name,'Status.sokoban_status')));if(earliest===undefined||c.time<earliest)earliest=c.time;}catch{}}
    const old=(earliest??apolloNow())-1000000000000000n;
    await this.write(file,writeCampaign(await fs.readFile(file),{time:old}));await fs.utimes(file,new Date(0),new Date(0));
    s.active=false;await this.write(this.sessionPath(),JSON.stringify(s));
  }
  async reset(id:string,hash:string){
    const dir=await this.ensure(id,hash);const archive=path.join(this.workspace,'backups',`reset-${id}-${Date.now()}`);await fs.cp(dir,archive,{recursive:true});
    for(const name of await fs.readdir(dir))if(name.endsWith('.history'))await fs.unlink(path.join(dir,name));
    const file=path.join(dir,'Status.sokoban_status');
    await this.write(file,writeCampaign(newCampaign(),{time:0n}));await fs.utimes(file,new Date(0),new Date(0));
    await this.write(this.sessionPath(),JSON.stringify({worldId:id,sourceHash:hash,active:false} satisfies Session));return archive;
  }
}
