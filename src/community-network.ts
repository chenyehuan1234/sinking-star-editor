export class CommunityConnectionError extends Error {}

export const communityTimeout=10_000;

/** Covers connection and body transfer, even if the transport is slow to
 * acknowledge cancellation. Pass the same signal to work started inside it. */
export async function communityDeadline<T>(timeout:number,run:(signal:AbortSignal)=>Promise<T>,parent?:AbortSignal){
  const controller=new AbortController();
  const signal=parent?AbortSignal.any([controller.signal,parent]):controller.signal;
  signal.throwIfAborted();
  const timer=setTimeout(()=>controller.abort(new CommunityConnectionError('连接关卡社区超时，请检查网络后重试。')),timeout);
  let cancel!:()=>void;
  const aborted=new Promise<never>((_,reject)=>{
    cancel=()=>reject(signal.reason);
    signal.addEventListener('abort',cancel,{once:true});
  });
  try{return await Promise.race([aborted,run(signal)]);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
