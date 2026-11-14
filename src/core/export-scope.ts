import type {WorldProject,RunRequest,EditorProject} from '../shared';
import type {NativeWorldProject} from '../v08-types';
import {scopedWorld} from './runs';import {newWorld} from './world';
export function exportWorld(project:WorldProject|NativeWorldProject,scope:RunRequest):WorldProject|NativeWorldProject {
 if(project.format==='sinking-star-world')return scopedWorld(project,scope);
 if(scope.mode==='world')return structuredClone(project);
 if(!['single','subset'].includes(scope.mode)||!scope.levelIds.length||scope.mode==='single'&&scope.levelIds.length!==1||new Set(scope.levelIds).size!==scope.levelIds.length||scope.levelIds.some(n=>n==='overworld'||!/^[a-zA-Z0-9_-]+$/.test(n)))throw Error('导出范围无效');
 const w=newWorld(project.sourceHash,project.sourceBuild);w.id=project.id;w.name=project.name;
 w.levels=scope.levelIds.map((name,i)=>({id:'native_'+i,title:name,project:{format:'sinking-star-project',version:3,sourceHash:project.sourceHash,sourceBuild:project.sourceBuild,template:name,name,operations:structuredClone(project.levelEdits[name]??[])}}));
 return scopedWorld(w,{mode:scope.mode,levelIds:w.levels.map(l=>l.id)});
}
export function exportDocument(project:WorldProject|NativeWorldProject,scope:RunRequest):WorldProject|NativeWorldProject|EditorProject {
 const output=exportWorld(project,scope);return scope.mode==='single'&&output.format==='sinking-star-world'?output.levels[0].project:output;
}
