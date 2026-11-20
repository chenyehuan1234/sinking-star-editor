import type {EditorProject} from '../shared';
import type {EntityFile} from './entities';

type Part='operation'|'camera'|'topology'|'levelSettings'|'terrainPaint'|'cameraLink';

export class ReplayError extends Error {
 constructor(readonly part:Part,error:unknown,readonly index?:number){
  super(error instanceof Error?error.message:String(error),{cause:error});
 }
}

/** Try the complete edit history first. Recovery affects the preview only. */
export function compatiblePreview(project:EditorProject,apply:(candidate:EditorProject)=>EntityFile):EntityFile {
 if(!project.sourceEvidence?.history?.length)return apply(project);
 const issues:string[]=[],ops=project.operations.map((op,index)=>({op,index}));
 let candidate=project;
 for(let attempt=0;attempt<=24;attempt++){
  try{
   const file=apply(candidate);
   if(issues.length)file.replayIssues=[...(file.replayIssues??[]),...issues];
   return file;
  }catch(error){
   if(!(error instanceof ReplayError)){
    const message=error instanceof Error?error.message:String(error);
    return {prefix:Buffer.alloc(0),types:[],records:[],replayIssues:[...issues,'当前安装无法读取场景「'+project.template+'」：'+message]};
   }
   if(attempt===24)break;
   candidate={...candidate};
   if(error.part==='operation'||error.part==='cameraLink'){
    const index=error.index!,item=ops[index];
    if(!item)break;
    issues.push('修改 '+(item.index+1)+'（'+item.op.kind+' #'+item.op.id+'）未应用：'+error.message);
    ops.splice(index,1);
    candidate.operations=ops.map(item=>item.op);
   }else if(error.part==='camera'||error.part==='topology'){
    delete candidate[error.part];
    issues.push((error.part==='camera'?'镜头设置':'循环与边界')+'未应用：'+error.message);
   }else{
    const affected=ops.filter(item=>item.op.kind===error.part);
    if(!affected.length)break;
    for(const item of affected)issues.push('修改 '+(item.index+1)+'（'+item.op.kind+'）未应用：'+error.message);
    for(let i=ops.length-1;i>=0;i--)if(ops[i].op.kind===error.part)ops.splice(i,1);
    candidate.operations=ops.map(item=>item.op);
   }
  }
 }
 try {
  const file=apply({...project,operations:[],camera:undefined,topology:undefined});
  file.replayIssues=[...issues,'冲突较多，暂时显示原生基础场景。全部改动仍保留在工程里。'];
  return file;
 }catch(error){
  return {prefix:Buffer.alloc(0),types:[],records:[],replayIssues:[...issues,'场景无法预览：'+String(error)]};
 }
}

export function copyReplayBase(file:EntityFile):EntityFile {
 return {...file,records:[...file.records],missingEntryTargets:file.missingEntryTargets&&new Map(file.missingEntryTargets),
  prismPresets:file.prismPresets&&new Map(file.prismPresets),analysisWarnings:file.analysisWarnings&&[...file.analysisWarnings]};
}
