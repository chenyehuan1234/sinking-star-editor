import fs from'node:fs/promises';import path from'node:path';import{sha256}from'../core/package';
import {SOURCE_EXE} from './save-isolation';
export interface TestState {version:1;sourceHash:string;sourceBuild?:string;exeHash?:string;deployedHash:string;pendingHash?:string;aux:string[];template?:string;name?:string;world?:{id:string;revision:number;quickEntry?:string}}
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
/** Keep the old game and registration together. Failed promotion rolls back the
 * old directory; interruption after promotion can recover from the inner marker. */
export async function promoteTestCopy(s:CopySource,building:string,previous:CopyInspection){
 await managedPath(s.workspace,building);await managedPath(s.workspace,s.testRoot);let archive:string|undefined;
 if(previous.exists){if(!previous.requiresRefresh||!previous.state)throw Error('试玩副本状态已变化，请重试');const root=path.join(s.workspace,'backups');await managedPath(s.workspace,root);await fs.mkdir(root,{recursive:true});archive=path.join(root,`test-copy-${previous.state.sourceHash.slice(0,8)}-${Date.now()}-${process.pid}`);await managedPath(s.workspace,archive);await fs.mkdir(archive);await fs.writeFile(path.join(archive,'playtest-state.json'),JSON.stringify(previous.state,null,2),{flag:'wx'});await fs.rename(s.testRoot,path.join(archive,'game'));}
 try{await fs.rename(building,s.testRoot);}catch(e){if(archive){try{await fs.access(s.testRoot);}catch(check){if(missing(check))await fs.rename(path.join(archive,'game'),s.testRoot);else throw check;}}throw e;}
 return archive;
}
