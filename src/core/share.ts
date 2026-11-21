import {createHash, randomUUID} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import {validateProject, validName} from './project';
import {newWorld, validateWorld} from './world';
import {validateNativeWorld} from './native-world';
import {validateRegionTransfer} from './regions';
import {exportWorld} from './export-scope';
import {nativeScene} from '../native-project';
import type {EditorProject, WorldLevel, WorldProject} from '../shared';
import type {NativeWorldProject} from '../v08-types';
import {shareExpandedLimit, shareLimit, type ShareManifest, type SharedLevel} from '../share-types';

export type ShareDesign = EditorProject | WorldProject | NativeWorldProject;
export const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

const allowedFields: Record<string,ReadonlySet<string>> = Object.fromEntries(Object.entries({
  'sinking-star-project':'format version sourceHash sourceBuild template base name title operations editor camera topology sourceEvidence',
  'sinking-star-world':'format version id name sourceHash sourceBuild map levels levelGroups sourceEvidence',
  'sinking-star-native-world':'format version id name sourceHash sourceBuild base edits levelEdits assignments scenes operations directory editor camera topology deletedScenes sourceEvidence',
  'sstar-region':'format version sourceHash sourceBuild name sources records terrain warnings associations origin copyPolicy transfer terrainPaint',
  'sstar-share':'format version scope title sourceBuild sourceHash editorVersion sha256 levels groups primaryId'
}).map(([format,fields])=>[format,new Set(fields.split(' '))]));

function checkFields(value:object,format:string){
  const allowed=allowedFields[format];
  if(allowed instanceof Set)for(const key of Object.keys(value))if(!allowed.has(key))throw Error('分享包包含不支持的字段 '+key);
}

export function designLevels(design: ShareDesign): SharedLevel[] {
  if (design.format === 'sinking-star-project') return [{id:design.name, title:design.title??design.name}];
  const levels = design.format==='sinking-star-world'?design.levels:design.scenes;
  return levels?levels.map(({id,title,folderId})=>({id,title,...folderId?{groupId:folderId}:{}})):Object.keys(design.format==='sinking-star-native-world'?design.levelEdits:{}).map(id=>({id,title:id}));
}

export function designGroups(design:ShareDesign){
  return design.format==='sinking-star-world'?design.levelGroups??[]:design.format==='sinking-star-native-world'?design.directory??[]:[];
}

export function groupedManifest(manifest:ShareManifest,design:ShareDesign):ShareManifest{
  const groupIds=new Map(designLevels(design).map(level=>[level.id,level.groupId]));
  return {...manifest,groups:designGroups(design),levels:manifest.levels.map(level=>({...level,groupId:groupIds.get(level.id)}))};
}

export function dependencyClosure(id: string, edges: ReadonlyMap<string, readonly string[]>): string[] {
  const visited = new Set([id]), ordered = [id];
  for (const current of ordered) for (const next of edges.get(current) ?? []) if (!visited.has(next)) {
    visited.add(next);
    ordered.push(next);
  }
  return ordered;
}

function validateShareDesign(value: unknown): asserts value is ShareDesign {
  const design = value as ShareDesign;
  if (!design || typeof design !== 'object') throw Error('分享包缺少工程设计');
  if (design.format === 'sinking-star-project') validateProject(design);
  else if (design.format === 'sinking-star-world' && !design.native) validateWorld(design);
  else if (design.format === 'sinking-star-native-world') validateNativeWorld(design);
  else throw Error('分享包工程格式无效');
  const visited: {value: object; depth: number}[] = [{value:design,depth:0}];
  while (visited.length) {
    const {value,depth} = visited.pop()!;
    if (depth > 80) throw Error('分享包结构过深');
    if ('format' in value && typeof value.format==='string'){
      checkFields(value,value.format);
      if(value.format==='sstar-region'){
        const bundle=value as unknown as import('../shared').RegionBundle;
        validateRegionTransfer(bundle);
        for(const record of bundle.records){
          const bytes=Buffer.from(record.diff,'base64');
          if(bytes.length<1||bytes.at(-1)!==0xfd||bytes.length>1&&(bytes.length<3||bytes.readUInt16LE(0)>0x11ff))throw Error('区域对象包含不支持的原生记录');
        }
      }
    }
    for (const [key,child] of Object.entries(value)) {
      if (/^(?:__proto__|constructor|prototypePollution|assets|attachments|gamePath|workspacePath|saveData|executable|resourceFiles)$/i.test(key)) throw Error('分享包包含不支持的字段 '+key);
      if (typeof child === 'string' && (/^(?:[a-z]:[\\/]|\\\\|file:\/\/|data:|\/(?:home|users|mnt|tmp|var)\/)/i.test(child) || child.length > 2_000_000)) throw Error('分享包包含本机路径或不支持的数据');
      if (child && typeof child === 'object') visited.push({value:child,depth:depth+1});
    }
  }
}

export function encodeShare(design: ShareDesign, scope: ShareManifest['scope'], editorVersion: string, levels = designLevels(design), primaryId?:string) {
  validateShareDesign(design);
  const json = JSON.stringify(design);
  const manifest=groupedManifest({format:'sstar-share',version:1,scope,title:design.name,sourceBuild:design.sourceBuild,
    sourceHash:design.sourceHash,editorVersion,sha256:digest(json),levels,primaryId},design);
  const plain = Buffer.from(JSON.stringify({manifest,design}));
  if (plain.length > shareExpandedLimit) throw Error('工程解压大小超过 64 MiB');
  const bytes = gzipSync(plain);
  if (bytes.length > shareLimit) throw Error('压缩后的工程超过 5 MiB');
  parseShare(bytes);
  return {manifest,bytes};
}

function readSharePayload(bytes: Buffer, maxOutputLength=shareExpandedLimit) {
  if (bytes.length < 20 || bytes.length > shareLimit) throw Error('分享文件大小无效，单文件上限为 5 MiB');
  let payload: {manifest: ShareManifest; design: unknown};
  try { payload = JSON.parse(gunzipSync(bytes,{maxOutputLength}).toString('utf8')); }
  catch(error) {
    if(maxOutputLength<shareExpandedLimit&&(error as NodeJS.ErrnoException).code==='ERR_BUFFER_TOO_LARGE')throw error;
    throw Error('分享包无法解压，格式无效或超过 64 MiB');
  }
  return payload;
}

export function parseShare(bytes: Buffer) {
  const payload=readSharePayload(bytes),manifest=payload?.manifest,design=payload?.design;
  if(payload&&Object.keys(payload).some(key=>key!=='manifest'&&key!=='design'))throw Error('分享包包含额外数据');
  validateShareDesign(design);
  if (manifest?.format !== 'sstar-share' || manifest.version !== 1 || !['level','group','project'].includes(manifest.scope) ||
      manifest.sourceBuild !== design.sourceBuild || manifest.sourceHash !== design.sourceHash || manifest.title !== design.name ||
      !/^[\w.-]{1,30}$/.test(manifest.editorVersion) || manifest.sha256 !== digest(JSON.stringify(design))) throw Error('分享包清单或校验值无效');
  checkFields(manifest,'sstar-share');
  if(manifest.groups!==undefined&&JSON.stringify(manifest.groups)!==JSON.stringify(designGroups(design)))throw Error('分享包分组无效');
  const actual = designLevels(design);
  const known = new Set(actual.map(l=>l.id));
  if(manifest.primaryId!==undefined&&(manifest.scope!=='group'||!known.has(manifest.primaryId)))throw Error('分享包主关卡无效');
  if (!Array.isArray(manifest.levels) || manifest.levels.length !== actual.length ||
      manifest.levels.some((l,i) => !l || Object.keys(l).some(key=>!['id','title','requires','groupId'].includes(key)) || !validName(l.id) || typeof l.title !== 'string' || !l.title.trim() || l.title.length > 100 ||
        (l.groupId!==undefined&&l.groupId!==actual[i].groupId) ||
        (design.format !== 'sinking-star-project' && (l.id !== actual[i].id || l.title !== actual[i].title)) ||
        (l.requires !== undefined && (!Array.isArray(l.requires) || l.requires.some(id=>id===l.id||!known.has(id))))) ||
      (manifest.scope === 'level' && (design.format !== 'sinking-star-project' || actual.length !== 1)) ||
      (manifest.scope !== 'level' && design.format === 'sinking-star-project')) throw Error('分享包关卡清单无效');
  return {manifest,design};
}

export function singleWorld(project: EditorProject, title = project.title??project.name, id = project.name): WorldProject {
  const world = newWorld(project.sourceHash,project.sourceBuild);
  world.name = title;
  const level:WorldLevel = {id,title,project};
  world.levels = [level];
  world.map.entries = [{id:'entry_0',levelId:id,title,x:8,y:5}];
  return world;
}

export function retargetDesignId(design: WorldProject | NativeWorldProject, old: string, next: string) {
  const renamable=new Set<string>();
  if(design.format==='sinking-star-world')for(const level of design.levels)renamable.add('ed_'+old+'_'+level.id);
  design.id = next;
  const pending: object[] = [design];
  while (pending.length) {
    const value = pending.pop()! as Record<string,unknown>;
    for (const [key,child] of Object.entries(value)) {
      if (child && typeof child === 'object') pending.push(child);
      else if (typeof child === 'string') {
        if (['target_level','switch_to_level_set','level_name','target'].includes(key) && renamable.has(child)) value[key] = `ed_${next}_${child.slice(old.length+4)}`;
        if (['origin','context'].includes(key) && child.startsWith(old+':')) value[key] = next+child.slice(old.length);
      }
    }
  }
  return design;
}

export function independentDesign(design: ShareDesign): WorldProject | NativeWorldProject {
  if (design.format === 'sinking-star-project') return singleWorld(design);
  return retargetDesignId(structuredClone(design),design.id,randomUUID().replaceAll('-','').slice(0,12));
}

export function shareLevel(design: ShareDesign, manifest: ShareManifest, id: string) {
  if (design.format === 'sinking-star-project' || !manifest.levels.some(level=>level.id===id)) throw Error('找不到此关卡');
  const ids = dependencyClosure(id,new Map(manifest.levels.map(level=>[level.id,level.requires??[]])));
  const selected = exportWorld(design,{mode:ids.length===1?'single':'subset',levelIds:ids});
  if (selected.format !== 'sinking-star-world') throw Error('无法生成关卡分享包');
  const levels = selected.levels.map(l=>({id:l.id,title:l.title,requires:manifest.levels.find(row=>row.id===l.id)?.requires}));
  selected.name = selected.levels.find(l=>l.id===id)!.title;
  retargetDesignId(selected,design.id,selected.id);
  if (ids.length === 1) {
    const project = selected.levels[0].project;
    // A standalone file has no world namespace. A link back to itself uses its scene name.
    for (const op of project.operations) if (op.kind==='properties'||op.kind==='prefab') {
      for (const key of ['target_level','switch_to_level_set']) if (op.values?.[key]===`ed_${selected.id}_${id}`) op.values[key] = project.name;
    }
    return encodeShare(project,'level',manifest.editorVersion,levels);
  }
  return encodeShare(selected,'group',manifest.editorVersion,levels,id);
}

export function previewScene(design:ShareDesign,manifest:ShareManifest,id:string):EditorProject|undefined{
  if(!manifest.levels.some(level=>level.id===id))return undefined;
  if(design.format==='sinking-star-project')return design;
  if(design.format==='sinking-star-native-world')return nativeScene(design,id);
  return design.levels.find(level=>level.id===id)?.project;
}

/** Immutable publication bytes have already passed parseShare at upload.
 * Only validate and encode the selected scenario on this read path. */
export function publishedSceneBytes(bytes:Buffer,manifest:ShareManifest,id:string,maxOutputLength:number){
  const {design}=readSharePayload(bytes,maxOutputLength);
  const scene=previewScene(design as ShareDesign,manifest,id);
  return scene?encodeShare(scene,'level',manifest.editorVersion).bytes:undefined;
}
