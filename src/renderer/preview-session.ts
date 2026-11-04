import type {EditorApi,EditorProject,LevelView,WorldProject} from '../shared';
import {mergePreview,type PreviewRequest} from '../preview-delta';
/** Serialize acknowledgement, never apply a response against a different scene revision. */
export class PreviewSession {
 private failure:unknown;private revision=0;private tail:Promise<unknown>=Promise.resolve();private scene='';private view:LevelView|null=null;private acknowledged:number|undefined;
 constructor(readonly api:Pick<EditorApi,'previewUpdate'>){}
 async flush(){await this.tail;if(this.failure)throw this.failure;}
 request(scene:string,value:{project:EditorProject}|{world:WorldProject}):Promise<LevelView>{
  const job=this.tail.then(async()=>{if(this.scene!==scene){this.scene=scene;this.view=null;this.acknowledged=undefined;}const request:PreviewRequest={scene,revision:++this.revision,baseRevision:this.acknowledged,...value};const delta=await this.api.previewUpdate(request);if(delta.scene!==scene||delta.revision!==request.revision)throw Error('预览返回了错误的场景修订');this.view=mergePreview(this.view,delta,this.acknowledged);this.acknowledged=delta.revision;this.failure=undefined;return this.view;});this.tail=job.catch(error=>{this.failure=error;});return job;
 }
}
