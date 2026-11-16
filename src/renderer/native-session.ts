import type {EditorApi,WorldProject,Vec3,LevelView} from '../shared';
import {nativeDocument,nativeWorkbench} from '../native-project';
import {diffPreview,type PreviewRequest} from '../preview-delta';


export function createWorkbenchApi(base:EditorApi) {
 let range:{min:Vec3;max:Vec3;overview:boolean;includeBackground?:boolean}={min:[-10,-10,-100],max:[200,170,100],overview:false};
 let previous:LevelView|null=null,previousScene='',previousRevision:number|undefined;
 const ordinary=(w:WorldProject,r:import('../shared').RunRequest)=>{const {native,levelGroups,...rest}=w;return native&&r.mode!=='world'?{...rest,levels:rest.levels.filter(l=>r.levelIds.includes(l.id)),map:{width:10,height:10,tiles:Array(100).fill(1),spawn:[2,2]as[number,number],entries:[]}}:rest;};
 const overrides:Partial<EditorApi>={
  worldSave:(w,a)=>w.native?base.nativeSave(nativeDocument(w),a):base.worldSave(w,a),
  exportDesign:r=>base.exportDesign({...r,project:r.project.format==='sinking-star-world'&&r.project.native?nativeDocument(r.project):r.project}),
  previewUpdate:async(r:PreviewRequest)=>{
   if(!r.world?.native)return base.previewUpdate(r);
   const result=await base.nativeRegion({project:nativeDocument(r.world),session:r.world.id,revision:r.revision,cellId:'world',bounds:{min:range.min,max:range.max},overview:false,includeBackground:range.includeBackground??false});
   const delta=diffPreview(previousScene===r.scene&&previousRevision===r.baseRevision?previous:null,result.view,r,result.elapsedMs);previous=result.view;previousScene=r.scene;previousRevision=r.revision;return delta;
  },
  worldValidate:w=>w.native?base.nativeValidate(nativeDocument(w)):base.worldValidate(w),
  runValidate:(w,r)=>w.native&&r.mode==='world'?base.nativeValidate(nativeDocument(w)):base.runValidate(ordinary(w,r),r),
  runPlan:(w,r)=>w.native&&r.mode==='world'?base.nativeRunPlan(nativeDocument(w),r):base.runPlan(ordinary(w,r),r),
  runLaunch:(w,r,c)=>w.native&&r.mode==='world'?base.nativeRunLaunch(nativeDocument(w),r,c):base.runLaunch(ordinary(w,r),r,c),
  worldDeploy:(w,e)=>w.native?base.nativeDeploy(nativeDocument(w)):base.worldDeploy(w,e),
  worldBuild:w=>w.native?base.nativeBuild(nativeDocument(w)):base.worldBuild(w),
 };
 return {api:Object.assign({},base,overrides) as EditorApi,setRange:(next:typeof range)=>{range=next;},importNative:async(regions:import('../shared').NativeLevelRegion[]=[])=>{const p=await base.nativeCreate();const index=await base.nativeIndex(p),t=index.topology;if(t)range={min:[t.corner[0]-2,t.corner[1]-2,-5000],max:[t.corner[0]+t.size[0]+2,t.corner[1]+t.size[1]+2,5000],overview:false};return nativeWorkbench(p,index,regions);}};
}
