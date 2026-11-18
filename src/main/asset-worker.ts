import{parentPort}from'node:worker_threads';import fs from'node:fs/promises';import{decodeMesh,decodeTexture}from'../core/assets';import{GamePackage}from'../core/package';import{bakeIdle}from'../core/pose';
let animations:Promise<GamePackage>|undefined;
parentPort!.on('message',async task=>{
  try{
    const started=task.profile?performance.now():0;
    const bytes=await fs.readFile(task.file);
    let read=task.profile?performance.now()-started:0;
    let value;
    if(task.kind==='pose'){
      const mesh=decodeMesh(bytes,task.name,task.lod);
      value=mesh;
      if(mesh.skinned){
        const animationStart=task.profile?performance.now():0;
        const data=await (animations??=fs.readFile(task.animationFile).then(buffer=>new GamePackage(buffer)));
        if(task.profile)read+=performance.now()-animationStart;
        const prefix=({soko1_dragon:'sokodragon',soko1_goblin:'goblin'} as Record<string,string>)[task.name]??task.name;
        const entry=data.entries.find(item=>item.name===`data/animations/${prefix}.animation_names`);
        if(!entry)throw Error('该模型尚无可解析的原生待机配置：'+task.name);
        const names=entry.data.toString('utf8');
        const idle=names.match(/^inactive\s+([a-zA-Z0-9_]+)/m)?.[1]??names.match(/^active\s+([a-zA-Z0-9_]+)/m)?.[1];
        if(!idle)throw Error('原生待机名称无法解析：'+task.name);
        value=bakeIdle(mesh,data.get(`data-common/${idle}.anim`),idle);
      }
    }else value=task.kind==='mesh'?decodeMesh(bytes,task.name,task.lod):decodeTexture(bytes,task.name,task.maxSize);
    const total=task.profile?performance.now()-started:0;
    parentPort!.postMessage({id:task.id,value,timing:task.profile?{read,decode:Math.max(0,total-read),total}:undefined});
  }catch(error){parentPort!.postMessage({id:task.id,error:String(error)});}
});
