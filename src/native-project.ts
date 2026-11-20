import type {WorldProject,WorldLevel,EditorProject,NativeLevelRegion,EditOp} from './shared';
import type {NativeWorldProject,NativeWorldIndex,NativeRegionAssignment} from './v08-types';

export interface LevelFolder {id:string;title:string}
export interface NativeDocumentMeta {base:'overworld';assignments:NativeRegionAssignment[];sourceVersion:4|5;deletedScenes?:string[];camera?:EditorProject['camera'];topology?:EditorProject['topology']}

/** The workbench projection shares editing tools with ordinary projects. Disk files remain native v5. */
export function nativeWorkbench(p:NativeWorldProject,index:NativeWorldIndex,regions:NativeLevelRegion[]=[]):WorldProject {
 const groups:LevelFolder[]=p.directory?.map(g=>({...g}))??regions.filter(g=>g.id!=='auxiliary'||g.levels.some(n=>n!=='overworld')).map(g=>({id:g.id,title:g.title}));
 const scenes:WorldLevel[]=p.scenes?structuredClone(p.scenes):index.levels.filter(n=>n!=='overworld').map(name=>({id:name,title:name,folderId:regions.find(g=>g.levels.includes(name))?.id,project:{format:'sinking-star-project',version:3,sourceHash:p.sourceHash,sourceBuild:p.sourceBuild,sourceEvidence:p.sourceEvidence,template:name,name,operations:structuredClone(p.levelEdits[name]??[])}}));
 return {format:'sinking-star-world',version:3,id:p.id,name:p.name,sourceHash:p.sourceHash,sourceBuild:p.sourceBuild,sourceEvidence:p.sourceEvidence,
  native:{base:'overworld',assignments:structuredClone(p.assignments),sourceVersion:p.version,deletedScenes:p.deletedScenes,camera:p.camera,topology:p.topology},levelGroups:groups,
  map:{width:32,height:32,tiles:Array(1024).fill(0),spawn:[0,0],entries:[],objects:structuredClone(p.operations??Object.values(p.edits).flat()),editor:p.editor},levels:scenes};
}
export function nativeDocument(w:WorldProject):NativeWorldProject {
 if(!w.native)throw Error('不是原版完整世界工程');
 return structuredClone({format:'sinking-star-native-world',version:5,id:w.id,name:w.name,sourceHash:w.sourceHash,sourceBuild:w.sourceBuild,sourceEvidence:w.sourceEvidence,deletedScenes:w.native.deletedScenes,base:'overworld',edits:{},levelEdits:{},assignments:w.native.assignments,operations:w.map.objects??[],scenes:w.levels,directory:w.levelGroups??[],editor:w.map.editor,camera:w.native.camera,topology:w.native.topology});
}
export const nativeOperations=(p:NativeWorldProject):EditOp[]=>p.version===5?p.operations??[]:Object.values(p.edits).flat();
export function nativeScene(p:NativeWorldProject,name:string):EditorProject|undefined {
 return p.version===5?p.scenes?.find(s=>s.id===name)?.project:{format:'sinking-star-project',version:3,sourceHash:p.sourceHash,sourceBuild:p.sourceBuild,sourceEvidence:p.sourceEvidence,template:name,name,operations:p.levelEdits[name]??[]};
}
export function validateFolders(groups:LevelFolder[]|undefined,levels:WorldLevel[]) {
 if(groups===undefined)return;if(!Array.isArray(groups)||groups.length>2000)throw Error('关卡分组无效');
 const ids=new Set<string>();for(const g of groups){if(!g||typeof g.id!=='string'||!g.id||g.id.length>150||ids.has(g.id)||typeof g.title!=='string'||!g.title.trim()||g.title.length>100)throw Error('关卡分组标识或名称无效');ids.add(g.id);}
 for(const l of levels)if(l.folderId&&!ids.has(l.folderId))throw Error('关卡分组不存在：'+l.title);
}
