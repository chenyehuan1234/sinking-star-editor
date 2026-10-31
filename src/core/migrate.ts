import type {EditorProject,WorldProject} from '../shared';
export function upgradeProject(p:EditorProject):EditorProject{return{...structuredClone(p),version:3,base:p.base??{kind:'template',template:p.template}};}
export function upgradeWorld(w:WorldProject):WorldProject{return{...structuredClone(w),version:3,levels:w.levels.map(l=>({...l,project:upgradeProject(l.project)}))};}
