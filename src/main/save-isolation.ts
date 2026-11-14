import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sha256} from '../core/package';
import {TestProfiles} from './test-profiles';

const originalName=Buffer.from('Order of the Sinking Star');
// This executable's SavedGames GUID -> directory-name call site was inspected.
// Never guess a patch for a newly updated executable.
const inspectedPrograms=new Set(['978b302fd0952e4ea8d869553aec875d9c635278a7d0f8cdb752f5a797a370aa']);
export const SOURCE_EXE='_editor-source.exe.disabled';
export const RUNTIME_EXE='SinkingStarPlaytest.exe';
export function isolationSupported(hash:string){return inspectedPrograms.has(hash);}
export function isolatedFolder(id:string){if(!/^[a-f0-9]{12}$/.test(id))throw Error('测试存档标识无效');return 'SStar_Editor_'+id;}
export function patchSaveDirectory(source:Buffer,id:string){
 const sourceHash=sha256(source);if(!isolationSupported(sourceHash))throw Error('当前游戏程序的独立存档路径尚未验证，不能启动试玩；编辑与导出可继续使用');
 const folder=isolatedFolder(id),replacement=Buffer.from(folder),offset=source.indexOf(originalName);
 if(replacement.length!==originalName.length||offset<0||source.indexOf(originalName,offset+1)!==-1||source[offset+originalName.length]!==0)throw Error('存档目录结构不符合已检查的程序，未修改副本');
 const pe=source.readUInt32LE(0x3c),sections=source.readUInt16LE(pe+6),optional=source.readUInt16LE(pe+20);let readOnly=false;
 for(let i=0;i<sections;i++){const s=pe+24+optional+i*40,rawSize=source.readUInt32LE(s+16),raw=source.readUInt32LE(s+20),flags=source.readUInt32LE(s+36);if(offset>=raw&&offset+replacement.length<raw+rawSize)readOnly=Boolean(flags&0x40000000)&&!(flags&0xa0000000);}
 if(!readOnly)throw Error('存档目录不在已验证的只读数据段');
 const buffer=Buffer.from(source);replacement.copy(buffer,offset);
 return{buffer,folder,offset,sourceHash,hash:sha256(buffer)};
}
let knownFolder:Promise<string>|undefined;
export function savedGamesDirectory(){
 if(process.platform!=='win32')throw Error('独立试玩目前仅支持 Windows');
 return knownFolder??=promisify(execFile)('powershell.exe',['-NoProfile','-Command',`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class SStarFolders { [DllImport("shell32.dll")] public static extern int SHGetKnownFolderPath(ref Guid id, uint flags, IntPtr token, out IntPtr path); }'; $id=[Guid]'4C5C32FF-BB9D-43B0-B5B4-2D72E54EAAA4'; $ptr=[IntPtr]::Zero; $hr=[SStarFolders]::SHGetKnownFolderPath([ref]$id,0,[IntPtr]::Zero,[ref]$ptr); if($hr -ne 0){throw 'Cannot resolve SavedGames'}; try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringUni($ptr))}finally{[Runtime.InteropServices.Marshal]::FreeCoTaskMem($ptr)}`],{windowsHide:true}).then(r=>{const p=r.stdout.trim();if(!path.isAbsolute(p))throw Error('Windows 存档根路径无效');return p;}).catch(e=>{knownFolder=undefined;throw e;});
}
export async function bindIsolatedSaves(workspace:string,id:string,folderRoot?:string,temporary=false){
 const root=await fs.realpath(workspace),profiles=path.join(root,temporary?'temp-playtests':'test-profiles'),profile=path.join(profiles,id);isolatedFolder(id);
 const stat=await fs.lstat(profile);if(stat.isSymbolicLink()||!stat.isDirectory()||(await fs.realpath(profile))!==profile)throw Error('测试存档目录归属无效');
 const metadata=JSON.parse(await fs.readFile(path.join(profile,'profile.json'),'utf8'));if(metadata.format!=='sstar-isolated-test-profile'||metadata.profile.id!==id)throw Error('不接管未登记测试存档');
 const saves=path.join(profile,'saves');await fs.mkdir(saves,{recursive:true});if((await fs.lstat(saves)).isSymbolicLink())throw Error('测试存档目标不能是链接');
 const alias=path.join(folderRoot??await savedGamesDirectory(),isolatedFolder(id));
 try{const s=await fs.lstat(alias);if(!s.isSymbolicLink()||path.normalize(await fs.realpath(alias)).toLowerCase()!==path.normalize(await fs.realpath(saves)).toLowerCase())throw Error('独立存档名称已被其他目录使用，未覆盖');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await fs.symlink(saves,alias,'junction');}
 await fs.writeFile(path.join(saves,'_editor-isolation.json'),JSON.stringify({format:'sstar-save-isolation',version:1,id,workspace:root,alias},null,2));
 return{saves,alias,profile};
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
