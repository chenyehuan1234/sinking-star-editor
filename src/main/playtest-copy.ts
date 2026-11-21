import fs from'node:fs/promises';import path from'node:path';import{sha256}from'../core/package';
import {SOURCE_EXE} from './save-isolation';
import {randomUUID} from 'node:crypto';
import {treeInfo} from './storage';
import type {PlaytestBuild} from './playtest-reuse';
export interface TestState {version:1;sourceHash:string;sourceBuild?:string;exeHash?:string;deployedHash:string;pendingHash?:string;playtestBuild?:PlaytestBuild;aux:string[];template?:string;name?:string;world?:{id:string;revision:number;quickEntry?:string}}
export interface CopySource {workspace:string;gamePath:string;testRoot:string;sourceHash:string;sourceBuild:string;exeHash:string}
const markerName='_editor-test-copy.json',hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function validTestState(value:unknown):value is TestState {const s=value as TestState;return !!s&&s.version===1&&hash(s.sourceHash)&&hash(s.deployedHash)&&(s.pendingHash===undefined||hash(s.pendingHash))&&(s.exeHash===undefined||hash(s.exeHash))&&(s.sourceBuild===undefined||typeof s.sourceBuild==='string')&&Array.isArray(s.aux)&&s.aux.every(s=>typeof s==='string'&&/^data-(common|pc)\/[a-zA-Z0-9_.-]+$/.test(s));}
export const freshTestState=(s:CopySource):TestState=>({version:1,sourceHash:s.sourceHash,sourceBuild:s.sourceBuild,exeHash:s.exeHash,deployedHash:s.sourceHash,aux:[]});
export const testStatePath=(s:CopySource)=>path.join(s.workspace,'playtest-state.json');
const missing=(e:unknown)=>(e as NodeJS.ErrnoException).code==='ENOENT';
/** Both source and destination are resolved before any directory rename. No links
 * are adopted, and all managed paths must remain inside the real workspace. */
export async function managedPath(workspace:string,candidate:string){const base=await fs.realpath(workspace);let p=path.resolve(candidate),suffix:string[]=[];while(true){try{p=await fs.realpath(p);break;}catch(e){if(!missing(e))throw e;const parent=path.dirname(p);if(parent===p)throw Error('试玩副本路径无效');suffix.unshift(path.basename(p));p=parent;}}const resolved=path.join(p,...suffix),relative=path.relative(base,resolved);if(!relative||relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw Error('试玩副本路径超出工作区，停止操作');return resolved;}
export interface CopyInspection {exists:boolean;state?:TestState;prepared:boolean;requiresRefresh:boolean;recoverState:boolean;sourceExeMissing?:boolean}
export async function inspectTestCopy(s:CopySource):Promise<CopyInspection>{
 let stat;try{stat=await fs.lstat(s.testRoot);}catch(e){if(!missing(e))throw e;return{exists:false,prepared:false,requiresRefresh:false,recoverState:false};}
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('试玩副本目录不是普通目录，请保留后更换工作区');await managedPath(s.workspace,s.testRoot);
 let state:TestState|undefined;try{const value=JSON.parse(await fs.readFile(testStatePath(s),'utf8'));if(!validTestState(value))throw Error('测试副本登记文件无效，原副本保留');state=value;}catch(e){if(!missing(e))throw e;}
 let marker:any;try{marker=JSON.parse(await fs.readFile(path.join(s.testRoot,markerName),'utf8'));}catch(e){if(!missing(e)&&!(e instanceof SyntaxError))throw e;}if(!state&&(marker?.format!=='sstar-playtest-copy'||!validTestState(marker.state)))throw Error('发现未登记的测试目录，请先将其移到其他位置');
 const actual=sha256(await fs.readFile(path.join(s.testRoot,'data/levels.package')));let exe='';try{exe=sha256(await fs.readFile(path.join(s.testRoot,'sinking_star.exe')));}catch(e){if(!missing(e))throw e;try{exe=sha256(await fs.readFile(path.join(s.testRoot,SOURCE_EXE)));}catch(e){if(!missing(e))throw e;}}
 // A verified marker is written inside a new copy before promotion. Recover only
 // a fresh copy after a missing/old state write; never bypass same-version tampering.
 if((!state||marker?.previousRegistrationHash===sha256(JSON.stringify(state)))&&marker?.format==='sstar-playtest-copy'&&validTestState(marker.state)&&marker.state.sourceHash===s.sourceHash&&marker.state.sourceBuild===s.sourceBuild&&marker.state.exeHash===s.exeHash&&actual===s.sourceHash&&exe===s.exeHash)return{exists:true,state:marker.state,prepared:true,requiresRefresh:false,recoverState:true};
 if(!state)throw Error('发现未登记的测试目录，请先将其移到其他位置');
 if(actual!==state.deployedHash&&actual!==state.pendingHash)throw Error('测试包已被外部改动，停止覆盖；请保留副本后重新准备');
 if(!exe&&state.sourceHash===s.sourceHash&&state.exeHash===s.exeHash&&state.sourceBuild===s.sourceBuild)return{exists:true,state,prepared:false,requiresRefresh:false,recoverState:false,sourceExeMissing:true};
 const stale=state.sourceHash!==s.sourceHash||exe!==s.exeHash||state.exeHash!==undefined&&state.exeHash!==s.exeHash||state.sourceBuild!==undefined&&state.sourceBuild!==s.sourceBuild;
 return{exists:true,state,prepared:!stale,requiresRefresh:stale,recoverState:false};
}
export async function writeCopyMarker(building:string,state:TestState,previous?:TestState){await fs.writeFile(path.join(building,markerName),JSON.stringify({format:'sstar-playtest-copy',state,...previous?{previousRegistrationHash:sha256(JSON.stringify(previous))}:{} },null,2),{flag:'wx'});}
type Replacement={format:'sstar-copy-replacement';version:1;building:string;archive:string;previous:TestState;next:TestState;cleanupStarted?:boolean};
const replacementPath=(s:CopySource)=>path.join(s.workspace,'playtest-replacement.json');
async function jsonWrite(file:string,value:unknown){const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(value),{flag:'wx'});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}}
async function exists(file:string){try{await fs.lstat(file);return true;}catch(e){if(missing(e))return false;throw e;}}
const sameSource=(a:TestState,b:TestState)=>a.sourceHash===b.sourceHash&&a.sourceBuild===b.sourceBuild&&a.exeHash===b.exeHash;
async function readReplacement(s:CopySource):Promise<Replacement|null>{
 let j:Replacement;try{j=JSON.parse(await fs.readFile(replacementPath(s),'utf8'));}catch(e){if(missing(e))return null;throw e;}
 if(j.format!=='sstar-copy-replacement'||j.version!==1||!validTestState(j.previous)||!validTestState(j.next)||!/^preparing-[a-zA-Z0-9-]+$/.test(j.building)||!/^backups[\\/]test-copy-[a-f0-9]{8}-[a-f0-9-]+$/.test(j.archive))throw Error('试玩副本更新记录无效，停止自动清理');
 for(const file of[s.testRoot,path.join(s.workspace,j.building),path.join(s.workspace,j.archive)])await managedPath(s.workspace,file);
 return j;
}
/** Only delete transaction-owned temporary directories, with links/designs/saves excluded. */
export async function discardPreparingCopy(s:CopySource,building:string){
 await managedPath(s.workspace,building);if(!/^preparing-[a-zA-Z0-9-]+$/.test(path.basename(building))||path.dirname(path.resolve(building))!==path.resolve(s.workspace))throw Error('临时复制路径不符合管理规则');
 if(!await exists(building))return;const info=await treeInfo(building);if(info.containsDesign||info.containsNativeSave)throw Error('临时副本内包含工程或进度，停止清理');await fs.rm(building,{recursive:true});
}
const preparingMarker='_editor-preparing.json';
export async function markPreparingCopy(s:CopySource,building:string){
 await managedPath(s.workspace,building);await fs.writeFile(path.join(building,preparingMarker),JSON.stringify({format:'sstar-preparing-copy',version:1,pid:process.pid,state:freshTestState(s)}),{flag:'wx'});
}
/** Interrupted copies are removable only with their own marker and a dead owner PID. */
export async function cleanupAbandonedPreparingCopies(s:CopySource,onCleanup?:()=>void){
 for(const entry of await fs.readdir(s.workspace,{withFileTypes:true})){
  const match=entry.name.match(/^preparing-\d+-(\d+)$/);if(!match||!entry.isDirectory()||entry.isSymbolicLink())continue;
  const building=path.join(s.workspace,entry.name);let marker:any;try{marker=JSON.parse(await fs.readFile(path.join(building,preparingMarker),'utf8'));}catch(e){if(missing(e)||e instanceof SyntaxError)continue;throw e;}
  if(marker.format!=='sstar-preparing-copy'||marker.version!==1||!validTestState(marker.state)||!Number.isSafeInteger(marker.pid)||marker.pid<=0||marker.pid!==Number(match[1]))continue;
  let alive=true;try{process.kill(marker.pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;else if((e as NodeJS.ErrnoException).code!=='EPERM')throw e;}
  if(alive)continue;onCleanup?.();await discardPreparingCopy(s,building);
 }
}
async function copyMatches(root:string,state:TestState){
 if(!await exists(root))return false;if((await fs.lstat(root)).isSymbolicLink())throw Error('试玩恢复目录包含链接');
 const actual=sha256(await fs.readFile(path.join(root,'data/levels.package')));if(actual!==state.deployedHash&&actual!==state.pendingHash)return false;
 let exe:Buffer;try{exe=await fs.readFile(path.join(root,SOURCE_EXE));}catch(e){if(!missing(e))throw e;exe=await fs.readFile(path.join(root,'sinking_star.exe'));}
 return !state.exeHash||sha256(exe)===state.exeHash;
}
/** Recover a short-lived replacement, then remove its rollback copy after durable registration.
 * Historical archives without this journal are never adopted or deleted here. */
export async function recoverCopyReplacement(s:CopySource){
 const j=await readReplacement(s);if(!j)return;
 const archive=path.join(s.workspace,j.archive),oldGame=path.join(archive,'game'),building=path.join(s.workspace,j.building);
 const archived=await fs.readFile(path.join(archive,'playtest-state.json'),'utf8').then(JSON.parse).catch(e=>{if(missing(e)&&j.cleanupStarted)return null;throw e;});
 if(archived&&JSON.stringify(archived)!==JSON.stringify(j.previous))throw Error('旧副本更新登记不一致，停止清理');
 let registered:TestState|undefined;try{registered=JSON.parse(await fs.readFile(testStatePath(s),'utf8'));if(!validTestState(registered))throw Error('试玩登记无效');}catch(e){if(!missing(e))throw e;}
 const registeredNew=registered&&sameSource(registered,j.next),candidate=registeredNew?registered!:j.next;
 const marker=await fs.readFile(path.join(s.testRoot,markerName),'utf8').then(JSON.parse).catch(e=>{if(missing(e))return null;throw e;});
 if(marker?.format==='sstar-playtest-copy'&&JSON.stringify(marker.state)===JSON.stringify(j.next)&&await copyMatches(s.testRoot,candidate)){
  if(!registeredNew){if(registered&&JSON.stringify(registered)!==JSON.stringify(j.previous))throw Error('试玩登记已被其他操作修改');await jsonWrite(testStatePath(s),j.next);}
 }else if(!await exists(s.testRoot)){
  if(registered&&JSON.stringify(registered)!==JSON.stringify(j.previous)||!await copyMatches(oldGame,j.previous))throw Error('更新中断且旧副本不完整，停止自动恢复');
  await fs.rename(oldGame,s.testRoot);if(!registered)await jsonWrite(testStatePath(s),j.previous);
 }else if(!await exists(oldGame)&&await copyMatches(s.testRoot,j.previous)){
  if(registered&&JSON.stringify(registered)!==JSON.stringify(j.previous))throw Error('回退登记不一致，停止清理');
 }else throw Error('试玩副本与更新记录不匹配，保留临时文件以供恢复');
 if(await exists(archive)){
  const info=await treeInfo(archive);if(info.containsDesign||info.containsNativeSave)throw Error('旧临时副本包含工程或存档，停止清理');
  j.cleanupStarted=true;await jsonWrite(replacementPath(s),j);await fs.rm(archive,{recursive:true});
 }
 await discardPreparingCopy(s,building);await fs.rm(replacementPath(s));
}
/** The old game is a temporary rollback, not a permanent full-game archive. */
export async function promoteTestCopy(s:CopySource,building:string,previous:CopyInspection){
 await managedPath(s.workspace,building);await managedPath(s.workspace,s.testRoot);let archive:string|undefined;
 if(previous.exists){
  if(!previous.requiresRefresh||!previous.state)throw Error('试玩副本状态已变化，请重试');
  const marker=JSON.parse(await fs.readFile(path.join(building,markerName),'utf8'));if(marker.format!=='sstar-playtest-copy'||!validTestState(marker.state)||!await copyMatches(building,marker.state))throw Error('新试玩副本校验失败');
  if(await exists(replacementPath(s)))throw Error('上次试玩副本替换尚未恢复');
  const root=path.join(s.workspace,'backups');await managedPath(s.workspace,root);await fs.mkdir(root,{recursive:true});archive=path.join(root,`test-copy-${previous.state.sourceHash.slice(0,8)}-${randomUUID()}`);await managedPath(s.workspace,archive);await fs.mkdir(archive);await fs.writeFile(path.join(archive,'playtest-state.json'),JSON.stringify(previous.state),{flag:'wx'});
  await jsonWrite(replacementPath(s),{format:'sstar-copy-replacement',version:1,building:path.relative(s.workspace,building),archive:path.relative(s.workspace,archive),previous:previous.state,next:marker.state} satisfies Replacement);
 }
 try{if(archive)await fs.rename(s.testRoot,path.join(archive,'game'));await fs.rename(building,s.testRoot);}catch(e){if(archive)try{await recoverCopyReplacement(s);}catch(recovery){throw Error('替换失败，旧副本已保留，恢复时遇到问题：'+String(recovery),{cause:e});}throw e;}
 return archive;
}
