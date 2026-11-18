import {performanceCapture as perf} from './performance-capture';
import type {EditorApi,EditorProject,LevelView,WorldProject} from '../shared';
import {mergePreview,type PreviewRequest} from '../preview-delta';
/** Serialize acknowledgement, never apply a response against a different scene revision. */
export class PreviewSession {
 private failure:unknown;private revision=0;private tail:Promise<unknown>=Promise.resolve();private scene='';private view:LevelView|null=null;private acknowledged:number|undefined;
 constructor(readonly api:Pick<EditorApi,'previewUpdate'>){}
 async flush(){await this.tail;if(this.failure)throw this.failure;}
 request(scene:string,value:{project:EditorProject}|{world:WorldProject}):Promise<LevelView>{
  const waiting=perf.begin();
  const job=this.tail.then(async()=>{
   const category='world' in value?'world':'normal';
   perf.end(waiting,'preview.wait',{category});
   if(this.scene!==scene){this.scene=scene;this.view=null;this.acknowledged=undefined;}const request:PreviewRequest={scene,revision:++this.revision,baseRevision:this.acknowledged,...value};const roundtrip=perf.begin();const delta=await this.api.previewUpdate(request);
   perf.end(roundtrip,'preview.roundtrip',{category});
   perf.end(roundtrip,'preview.backend',{category},delta.milliseconds);
   if(roundtrip)perf.count(delta.full?'preview.full':'preview.delta',1,category);
   if(delta.scene!==scene||delta.revision!==request.revision)throw Error('预览返回了错误的场景修订');const applying=perf.begin();this.view=mergePreview(this.view,delta,this.acknowledged);perf.end(applying,'preview.apply',{category,parent:roundtrip?.id});this.acknowledged=delta.revision;this.failure=undefined;return this.view;});this.tail=job.catch(error=>{this.failure=error;});return job;
 }
}
