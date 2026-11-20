import{sha256,GamePackage}from'./package';import{projectSources}from'./project';import type{EditorProject,WorldProject}from'../shared';import type{PropertyCodec}from'./properties';
import {mapProject} from '../scene-project';
import type {NativeWorldProject} from '../v08-types';
export interface SourceEvidence{schema:string;files:Record<string,string>;history?:{hash:string;build:string}[]}
export function schemaFingerprint(codec:PropertyCodec){return sha256(JSON.stringify([...codec.reflection.types.keys()].sort().map(name=>[name,codec.reflection.flatten(name).map(f=>[f.name,f.type.kind,f.type.size,f.type.name])])));}
export function dependencyEvidence(pkg:GamePackage,project:EditorProject|WorldProject,schema:string):SourceEvidence{const projects=project.format==='sinking-star-world'?[...project.levels.map(l=>l.project),mapProject(project)]:[project];const names=new Set(projects.flatMap(projectSources));if(project.format==='sinking-star-world'){names.add('overworld');for(const e of project.map.entries)if(e.prototype)names.add(e.prototype.template);}const files:Record<string,string>={};for(const name of names){for(const entry of pkg.entries.filter(e=>e.name.startsWith('data-common/'+name+'.')))files[entry.name]=sha256(entry.data);}return{schema,files};}
export function rebindSource<T extends EditorProject|WorldProject|NativeWorldProject>(input:T,hash:string,build:string,evidence=input.sourceEvidence):T {
 const result=structuredClone(input),pending:unknown[]=[result];
 const previous={hash:input.sourceHash,build:input.sourceBuild};
 while(pending.length){
  const value=pending.pop();
  if(!value||typeof value!=='object')continue;
  const node=value as Record<string,unknown>;
  if(node.sourceHash===previous.hash&&node.sourceBuild===previous.build){
   node.sourceHash=hash;node.sourceBuild=build;
   if(node.format==='sinking-star-project'&&node!==result){
    const prior=node.sourceEvidence as SourceEvidence|undefined;
    node.sourceEvidence={schema:prior?.schema??'',files:prior?.files??{},history:[...(prior?.history??[]),previous]};
   }
  }
  for(const [key,child] of Object.entries(node))if(key!=='sourceEvidence'&&child&&typeof child==='object')pending.push(child);
 }
 result.sourceEvidence={schema:evidence?.schema??'',files:evidence?.files??{},history:[...(evidence?.history??[]),previous]};
 return result;
}
