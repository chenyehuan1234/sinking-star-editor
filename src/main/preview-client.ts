import {Worker} from 'node:worker_threads';
export class PreviewWorker {
 private worker?:Worker;private sequence=0;private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 constructor(readonly root:string,readonly filename:string){}
 request<T>(method:string,value:unknown):Promise<T>{
  if(!this.worker){const worker=this.worker=new Worker(this.filename,{workerData:{root:this.root}});worker.unref();worker.on('message',m=>{const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.value);if(!this.pending.size)worker.unref();});worker.on('error',e=>this.fail(e));worker.on('exit',()=>{if(this.worker===worker){this.worker=undefined;this.fail(Error('预览线程已退出，下次操作将重新启动'));}});}
  this.worker.ref();return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject});this.worker!.postMessage({id,method,value});});
 }
 private fail(e:Error){for(const p of this.pending.values())p.reject(e);this.pending.clear();}
 async dispose(){const worker=this.worker;this.worker=undefined;this.fail(Error('已切换游戏目录'));await worker?.terminate();}
}
