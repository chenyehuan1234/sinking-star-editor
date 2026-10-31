import fs from'node:fs/promises';import path from'node:path';import os from'node:os';
import{newCampaign,readCampaign,writeCampaign,apolloNow}from'../core/campaign';
interface Owner {format:'sinking-star-test-campaign';worldId:string;sourceHash:string}
interface Session {worldId:string;sourceHash:string;active:boolean}
export class CampaignManager {
  constructor(readonly workspace:string,readonly saves=path.join(os.homedir(),'Saved Games','Order of the Sinking Star')){}
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
