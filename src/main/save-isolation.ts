import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sha256} from '../core/package';
import {TestProfiles} from './test-profiles';
import {CampaignManager} from './campaigns';
import {directoriesOverlap} from './game-installation';
import {locateNativeSavePath} from './native-save-path';
import type {TestContext} from '../v08-types';

const formalFolder='Order of the Sinking Star';
const originalName=Buffer.from(formalFolder);
const legacyProgram='978b302fd0952e4ea8d869553aec875d9c635278a7d0f8cdb752f5a797a370aa';
export const SOURCE_EXE='_editor-source.exe.disabled';
export const RUNTIME_EXE='SinkingStarPlaytest.exe';
export function isolationSupported(source:Buffer){return Boolean(locateNativeSavePath(source))||sha256(source)===legacyProgram;}
export const isolationUnavailable='无法识别当前游戏的存档路径结构，已停止试玩以保护正式存档';
export function isolatedFolder(id:string){if(!/^[a-f0-9]{12}$/.test(id))throw Error('测试存档标识无效');return 'SStar_Editor_'+id;}

export function patchSaveDirectory(source:Buffer,id:string){
 const sourceHash=sha256(source),layout=locateNativeSavePath(source);
 if(!layout&&sourceHash!==legacyProgram)throw Error(isolationUnavailable);
 const folder=isolatedFolder(id),replacement=Buffer.from(folder),buffer=Buffer.from(source);
 if(layout){
  buffer.writeInt32LE(layout.relative,layout.displacement);
  buffer.writeUInt32LE(layout.virtualSize,layout.virtualSizeOffset);
 }
 const offset=layout?.stringOffset??source.indexOf(originalName);
 if(offset<0||source[offset+replacement.length]!==0)throw Error(isolationUnavailable);
 replacement.copy(buffer,offset);
 const changes=[{offset,length:replacement.length}];
 if(layout)changes.push({offset:layout.displacement,length:4},{offset:layout.virtualSizeOffset,length:4});
 return {buffer,folder,offset,changes,sourceHash,hash:sha256(buffer)};
}

export function reportedSavePath(output:string){
 const paths=[...output.matchAll(/^[ \t]*save_path:[ \t]*(.+)$/gm)];
 if(paths.length!==1||!output.includes('Here is the list of valid arguments'))return;
 return paths[0][1].trim();
}

export async function verifyRuntimeSavePath(file:string,testRoot:string,alias:string,saves:string){
 let output:string;
 try{
  const result=await promisify(execFile)(file,['-help'],{cwd:testRoot,windowsHide:true,timeout:10000,maxBuffer:512*1024});
  output=result.stdout;
 }catch(error){
  // The release executable exits with 1 after successfully printing help.
  const exit=error as {code?:string|number;killed?:boolean;signal?:string|null;stdout?:string};
  if(exit.code!==1||exit.killed||exit.signal||typeof exit.stdout!=='string'||!reportedSavePath(exit.stdout)){
   throw Error('试玩副本未能返回存档路径，请检查游戏副本后重试',{cause:error});
  }
  output=exit.stdout;
 }
 const reported=reportedSavePath(output);
 const normalized=(value:string)=>path.normalize(value).toLowerCase();
 if(!reported||!path.isAbsolute(reported)||normalized(reported)!==normalized(alias)||
    normalized(await fs.realpath(alias))!==normalized(await fs.realpath(saves)))throw Error('试玩副本报告的存档路径与独立目录不一致，已停止启动');
}
let knownFolder:Promise<string>|undefined;
export function savedGamesDirectory(){
 if(process.platform!=='win32')throw Error('独立试玩目前仅支持 Windows');
 return knownFolder??=promisify(execFile)('powershell.exe',['-NoProfile','-Command',`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class SStarFolders { [DllImport("shell32.dll")] public static extern int SHGetKnownFolderPath(ref Guid id, uint flags, IntPtr token, out IntPtr path); }'; $id=[Guid]'4C5C32FF-BB9D-43B0-B5B4-2D72E54EAAA4'; $ptr=[IntPtr]::Zero; $hr=[SStarFolders]::SHGetKnownFolderPath([ref]$id,0,[IntPtr]::Zero,[ref]$ptr); if($hr -ne 0){throw 'Cannot resolve SavedGames'}; try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringUni($ptr))}finally{[Runtime.InteropServices.Marshal]::FreeCoTaskMem($ptr)}`],{windowsHide:true}).then(r=>{const p=r.stdout.trim();if(!path.isAbsolute(p))throw Error('Windows 存档根路径无效');return p;}).catch(e=>{knownFolder=undefined;throw e;});
}
export async function bindIsolatedSaves(workspace:string,id:string,folderRoot?:string,temporary=false){
 const root=await fs.realpath(workspace),profiles=path.join(root,temporary?'temp-playtests':'test-profiles'),profile=path.join(profiles,id);isolatedFolder(id);
 const stat=await fs.lstat(profile);if(stat.isSymbolicLink()||!stat.isDirectory()||(await fs.realpath(profile))!==profile)throw Error('测试存档目录归属无效');
 await validateSaveTree(profile);
 const metadata=JSON.parse(await fs.readFile(path.join(profile,'profile.json'),'utf8'));if(metadata.format!=='sstar-isolated-test-profile'||metadata.profile.id!==id)throw Error('不接管未登记测试存档');
 const saves=path.join(profile,'saves');await fs.mkdir(saves,{recursive:true});if((await fs.lstat(saves)).isSymbolicLink())throw Error('测试存档目标不能是链接');
 const alias=path.join(folderRoot??await savedGamesDirectory(),isolatedFolder(id));
 try{const s=await fs.lstat(alias);if(!s.isSymbolicLink()||path.normalize(await fs.realpath(alias)).toLowerCase()!==path.normalize(await fs.realpath(saves)).toLowerCase())throw Error('独立存档名称已被其他目录使用，未覆盖');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await fs.symlink(saves,alias,'junction');}
 await fs.writeFile(path.join(saves,'_editor-isolation.json'),JSON.stringify({format:'sstar-save-isolation',version:1,id,workspace:root,alias},null,2));
 return{saves,alias,profile};
}

async function validateSaveTree(file:string){
 const stat=await fs.lstat(file);
 if(stat.isDirectory()&&!stat.isSymbolicLink()){
  for(const child of await fs.readdir(file))await validateSaveTree(path.join(file,child));
 }else if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('测试存档目录中存在链接或异常文件，试玩已停止');
}

type BoundPlaytest = Awaited<ReturnType<typeof bindIsolatedSaves>> & {id:string};
export async function preparePlaytestSaves(workspace:string,sourceHash:string,current:string,options:{fresh?:boolean;library?:boolean;verify?:(save:BoundPlaytest)=>Promise<void>},folderRoot?:string){
 const root=await fs.realpath(workspace),savedGames=folderRoot??await savedGamesDirectory();
 const original=path.join(savedGames,formalFolder),formal=await fs.realpath(original).catch(error=>{if(error.code==='ENOENT')return original;throw error;});
 if(directoriesOverlap(root,formal))throw Error('工作区与正式存档目录重叠，试玩已停止');
 const profiles=new TestProfiles(root);
 await fs.mkdir(profiles.root,{recursive:true});
 if(await fs.realpath(profiles.root)!==profiles.root)throw Error('测试存档根目录不能是链接');
 const context:TestContext={projectId:sha256(root.toLowerCase()).slice(0,12),sourceHash,revision:'workspace-playtest',scope:{mode:'world',levelIds:[]}};
 const selection=await profiles.select(context),profile=selection.compatible[0]??await profiles.create(context,'编辑器试玩');
 const bound=await bindIsolatedSaves(root,profile.id,savedGames);
 await options.verify?.({id:profile.id,...bound});
 await profiles.prepareSettings(profile.id,original);
 const campaigns=new CampaignManager(root,bound.saves);
 await campaigns.startSharedPlaytest(current,options.fresh,options.library);
 await profiles.used(profile.id);
 return {id:profile.id,...bound,profiles};
}

/** Caller must first verify that no game process is running. Never follow a save alias for deletion. */
export async function cleanupTemporarySaves(workspace:string,folderRoot?:string){
 const manager=new TestProfiles(workspace,true),rows=await manager.list();if(!rows.length)return 0;
 const root=path.join(await fs.realpath(workspace),'temp-playtests');if((await fs.lstat(root)).isSymbolicLink())throw Error('临时目录不能是链接');
 await manager.captureIndependentSettings();let count=0;
 for(const p of rows){
  const dir=path.join(root,p.id),real=await fs.realpath(dir);if(real!==dir||(await fs.lstat(dir)).isSymbolicLink())throw Error('临时试玩目录归属无效');
  const alias=path.join(folderRoot??await savedGamesDirectory(),isolatedFolder(p.id));
  try{const stat=await fs.lstat(alias);if(!stat.isSymbolicLink())throw Error('临时存档入口被其他目录占用');const target=await fs.realpath(alias);if(path.normalize(target).toLowerCase()!==path.normalize(path.join(dir,'saves')).toLowerCase())throw Error('临时存档链接目标已变化');await fs.unlink(alias);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  // Reject nested links before removing the owned session directory.
  const check=async(d:string):Promise<void>=>{for(const e of await fs.readdir(d,{withFileTypes:true})){const child=path.join(d,e.name),st=await fs.lstat(child);if(st.isSymbolicLink())throw Error('临时存档内存在链接，已保留');if(st.isDirectory())await check(child);}};await check(dir);await fs.rm(dir,{recursive:true});count++;
 }
 return count;
}
