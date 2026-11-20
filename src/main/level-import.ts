import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {EditorService} from './service';
import type {EditorProject,EditOp,WorldLevel,WorldProject} from '../shared';
import type {SharedLevel} from '../share-types';
import {shareExpandedLimit,shareLimit,shareExtension} from '../share-types';
import {applyProject,validateProject} from '../core/project';
import {validateWorld} from '../core/world';
import {encodeShare,parseShare} from '../core/share';
import {validateReferences} from '../core/mechanisms';
import {upgradeProject} from '../core/migrate';

export type ImportDesign={title:string;levels:WorldLevel[];directory:SharedLevel[];primary:string;sourceWorldId?:string};

export function shareImport(bytes:Buffer,selected?:string):ImportDesign{
  const {manifest,design}=parseShare(bytes);
  if(manifest.scope==='project')throw Error('此文件是完整工程，请使用首页导入');
  if(design.format==='sinking-star-project'){
    const row=manifest.levels[0];
    return {title:row.title,levels:[{id:row.id,title:row.title,project:design}],directory:[row],primary:row.id};
  }
  if(design.format!=='sinking-star-world')throw Error('分享包内没有可导入的小关');
  const primary=selected&&design.levels.some(row=>row.id===selected)?selected:manifest.primaryId??design.levels.find(row=>row.title===manifest.title)?.id??design.levels[0]?.id;
  if(!primary)throw Error('分享包内没有可导入的小关');
  return {title:manifest.title,levels:design.levels,directory:manifest.levels,primary,sourceWorldId:design.id};
}

export async function fileImport(file:string):Promise<ImportDesign>{
  const size=(await fs.stat(file)).size;
  if(file.toLowerCase().endsWith(shareExtension)||file.toLowerCase().endsWith('.gz')){
    if(size>shareLimit)throw Error('分享包超过 5 MiB');
    return shareImport(await fs.readFile(file));
  }
  if(size>shareExpandedLimit)throw Error('工程文件超过 64 MiB');
  const design=JSON.parse(await fs.readFile(file,'utf8')) as EditorProject|WorldProject;
  if(design.format==='sinking-star-project'){
    validateProject(design);
    const {name,title=name}=design;
    return {title,directory:[{id:name,title}],primary:name,levels:[{id:name,title,project:design}]};
  }
  if(design.format!=='sinking-star-world'||design.native||design.levels?.length!==1)throw Error('请选择单关分享包或只包含一关的工程');
  validateWorld(design);
  const [level]=design.levels;
  return {title:design.name,directory:[level].map(({id,title})=>({id,title})),primary:level.id,levels:[level],sourceWorldId:design.id};
}

export async function fileForLibrary(file:string,editorVersion:string){
  const size=(await fs.stat(file)).size;
  if(file.toLowerCase().endsWith('.gz')){
    if(size>shareLimit)throw Error('分享包超过 5 MiB');
    const bytes=await fs.readFile(file);shareImport(bytes);return bytes;
  }
  if(size>shareExpandedLimit)throw Error('工程文件超过 64 MiB');
  const design=JSON.parse(await fs.readFile(file,'utf8')) as EditorProject|WorldProject;
  if(design.format==='sinking-star-project')return encodeShare(design,'level',editorVersion).bytes;
  if(design.format!=='sinking-star-world'||design.native||design.levels?.length!==1)throw Error('请选择单关文件、关卡组分享包或只包含一关的工程');
  return encodeShare(design,'group',editorVersion,undefined,design.levels[0].id).bytes;
}

export async function appendImportedLevels(engine:EditorService,target:WorldProject,input:ImportDesign,folderId?:string){
  validateWorld(target);
  await engine.unchanged();
  if(!engine.codec)throw Error('请先连接 Steam 原游戏');
  if(folderId&&!target.levelGroups?.some(group=>group.id===folderId))throw Error('目标分组已经移动或删除');
  if(target.sourceHash!==engine.sourceHash||target.sourceBuild!==engine.build)throw Error('目标工程来源已变化，请重新打开工程');
  const aliases=new Map<string,string>(),ambiguous=new Set<string>();
  const assigned=new Map(input.levels.map(level=>[level.id,(target.native?'ed_'+target.id+'_':'')+'level_'+randomUUID().replaceAll('-','').slice(0,14)]));
  for(const level of input.levels){
    const id=assigned.get(level.id)!;
    for(const key of [level.id,level.project.name,...input.sourceWorldId?['ed_'+input.sourceWorldId+'_'+level.id]:[]]){
      if(aliases.has(key)&&aliases.get(key)!==id)ambiguous.add(key);
      else aliases.set(key,id);
    }
  }
  const official=new Set(engine.pkg.entries.filter(row=>row.name.startsWith('data-common/')&&row.name.endsWith('.entities')).map(row=>row.name.slice(12,-9)));
  const next=structuredClone(target),added:WorldLevel[]=[];
  for(const source of input.levels){
    const id=assigned.get(source.id)!,level=upgradeProject(await engine.adaptProject(source.project));
    try{
      const file=applyProject(engine.pkg,level,engine.codec);
      const patches:EditOp[]=[];
      for(const record of file.records){
        const fields=record.type==='Door'?['target_level','switch_to_level_set']:record.type==='Level_Entry'?['level_name']:[];
        const values:Record<string,string>={};
        for(const name of fields){
          const previous=String(engine.codec.get(record,name,''));
          if(!previous)continue;
          if(ambiguous.has(previous))throw Error(`物件 #${record.id} 的 ${name} 指向多个关卡「${previous}」`);
          const replacement=aliases.get(previous);
          if(replacement)values[name]=target.native?replacement:'ed_'+target.id+'_'+replacement;
          else if(!official.has(previous))throw Error(`物件 #${record.id} 的 ${name} 需要关卡「${previous}」`);
        }
        if(Object.keys(values).length)patches.push({kind:'properties',id:record.id,values});
      }
      level.name=id;
      level.operations.push(...patches);
      const validated=applyProject(engine.pkg,level,engine.codec);
      const errors=validateReferences(engine.codec,validated);
      if(errors.length)throw Error(errors[0]);
    }catch(error){throw Error(`「${source.title}」导入失败：${(error as Error).message}`);}
    added.push({id,title:source.title,folderId:folderId||undefined,project:level});
  }
  next.levels.push(...added);
  validateWorld(next);
  return {project:next,primary:assigned.get(input.primary)!,count:added.length};
}
