import {safeStorage} from 'electron';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs/promises';
import {atomicWrite} from './service';
import type {CommunitySignIn} from '../home-types';

export class CommunityHttpError extends Error {
  constructor(readonly status:number,message:string){super(message);}
}

type Author={username:string;password:string;recovery?:string;pending?:boolean};
type Authors={active?:string;records:Author[]};
type Reply={username:string;token:string;recovery?:string};
const key=(name:string)=>name.normalize('NFKC').toLowerCase();

export class CommunityAuthor {
  private session?:{username:string;token:string;refreshAt:number};
  private queue=Promise.resolve<unknown>(undefined);

  constructor(private file:string,private call:(action:string,fields?:unknown,token?:string)=>Promise<Reply>){}

  private async read():Promise<Authors>{
    const data=await fs.readFile(this.file).catch((error:NodeJS.ErrnoException)=>{
      if(error.code==='ENOENT')return null;
      throw error;
    });
    if(!data)return {records:[]};
    try{return JSON.parse((await safeStorage.decryptStringAsync(data)).result);}
    catch{throw Error('无法读取此设备保存的作者凭据。可使用恢复码重新登录。');}
  }

  private async save(data:Authors){
    const encrypted=await safeStorage.encryptStringAsync(JSON.stringify(data));
    await atomicWrite(this.file,encrypted);
  }

  private serialize<T>(fn:()=>Promise<T>){
    const operation=this.queue.then(fn);
    this.queue=operation.catch(()=>{});
    return operation;
  }

  private update(reply:Reply){
    if(!reply.token)throw Error('社区未返回桌面登录凭据，请重试。');
    return this.session={username:reply.username,token:reply.token,refreshAt:Date.now()+6*86400000};
  }

  current(){return this.session;}

  forget(token?:string){if(this.session?.token===token)this.session=undefined;}

  restore(){
    return this.serialize(async()=>{
      if(this.session&&this.session.refreshAt>Date.now())return this.session;
      const data=await this.read();
      const author=data.records.find(record=>key(record.username)===data.active);
      if(!author)return undefined;
      const reply=await this.call('login',{username:author.username,password:author.password}).catch(error=>{
        if(error instanceof CommunityHttpError&&error.status===401)return undefined;
        throw error;
      });
      if(reply)return this.update(reply);
      this.session=undefined;
      return undefined;
    });
  }

  signIn(input:CommunitySignIn){
    return this.serialize(async()=>{
      const username=input.username.trim(),id=key(username);
      if(!/^[\p{L}\p{N}_-]{2,32}$/u.test(username))throw Error('用户名须为 2 至 32 个字母、数字、汉字、下划线或连字符。');
      const data=await this.read();
      const prior=data.records.find(record=>key(record.username)===id);
      const password=input.mode==='legacy'?input.password:input.mode==='device'&&prior?prior.password:randomBytes(32).toString('base64url');
      const fields={username,password};
      let reply:Reply;
      if(input.mode==='recover')reply=await this.call('recover',{...fields,recovery:input.recovery.trim()});
      else if(input.mode==='legacy'||prior&&!prior.pending)reply=await this.call('login',fields);
      else {
        // Save the generated secret before registering so a lost response can be retried.
        if(!prior){data.records.push({...fields,pending:true});await this.save(data);}
        const existing=prior?await this.call('login',fields).catch(error=>{
          if(error instanceof CommunityHttpError&&error.status===401)return undefined;
          throw error;
        }):undefined;
        reply=existing??await this.call('signup',fields).catch(error=>{
          if(error instanceof CommunityHttpError&&error.status===409)throw Error('此用户名已被使用。请选择另一个名字，或恢复已有账号。');
          throw error;
        });
      }
      if(!reply.token)throw Error('社区未返回桌面登录凭据，请重试。');
      data.active=id;
      data.records=data.records.filter(record=>key(record.username)!==id);
      data.records.push({username:reply.username,password,recovery:reply.recovery??prior?.recovery});
      await this.save(data);
      return {username:this.update(reply).username};
    });
  }

  recovery(){
    return this.serialize(async()=>{
      const data=await this.read();
      return data.records.find(record=>key(record.username)===data.active)?.recovery??null;
    });
  }

  logout(){
    return this.serialize(async()=>{
      const data=await this.read();
      delete data.active;
      await this.save(data);
      const token=this.session?.token;
      this.session=undefined;
      if(token)await this.call('logout',undefined,token).catch(()=>{});
    });
  }
}
