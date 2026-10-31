import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {GameInstallation,GameDiscovery} from '../shared';

type ValveNode = {[key:string]:string|ValveNode};
export function directoriesOverlap(first:string,second:string):boolean{
  const inside=(a:string,b:string)=>{const relative=path.relative(path.resolve(a).toLowerCase(),path.resolve(b).toLowerCase());return relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
  return inside(first,second)||inside(second,first);
}
/** Small KeyValues reader: quoted strings, braces and line comments; never evaluates input. */
export function parseValve(text:string):ValveNode {
  const tokens=text.match(/"(?:\\.|[^"\\])*"|[{}]|\/\/[^\r\n]*|[^\s{}"]+/g)?.filter(t=>!t.startsWith('//'))??[];
  let i=0;
  const token=()=>{const t=tokens[i++];if(t===undefined)throw Error('Steam 配置不完整');return t.startsWith('"')?t.slice(1,-1).replace(/\\([\\"])/g,'$1'):t;};
  const object=(nested=false):ValveNode=>{const out:ValveNode={};while(i<tokens.length){if(tokens[i]==='}'){if(!nested)throw Error('Steam 配置括号不匹配');i++;return out;}const key=token();if(key==='{'||key==='}'||i>=tokens.length)throw Error('Steam 配置无效');if(tokens[i]==='{'){i++;out[key]=object(true);}else out[key]=token();}if(nested)throw Error('Steam 配置缺少结束括号');return out;};
  return object();
}
const child=(v:ValveNode,key:string)=>typeof v[key]==='object'?v[key] as ValveNode:{};
export function steamLibraries(text:string,root:string):string[]{const v=child(parseValve(text),'libraryfolders');return [...new Set([root,...Object.entries(v).filter(([k])=>/^\d+$/.test(k)).flatMap(([,n])=>typeof n==='string'?[n]:typeof n.path==='string'?[n.path]:[])])];}
export function manifestDirectory(text:string):{directory:string;build:string}{const v=child(parseValve(text),'AppState');if(v.appid!=='499170'||typeof v.installdir!=='string'||!v.installdir||/[\\/]|^\.{1,2}$/.test(v.installdir))throw Error('不是沉星之序的 Steam 安装记录');return{directory:v.installdir,build:typeof v.buildid==='string'?v.buildid:'unknown'};}
export async function inspectInstallation(location:string):Promise<GameInstallation>{
  const result:GameInstallation={path:path.resolve(location),build:'unknown',directoryValid:false,compatibility:'unchecked'};
  try{
    result.path=await fs.realpath(location);
    for(const [name,folder] of [['sinking_star.exe',false],['data/levels.package',false],['data/materials.package',false],['data-pc',true]] as const){let s;try{s=await fs.stat(path.join(result.path,name));}catch{throw Error(`所选目录缺少 ${name}。请选择包含 sinking_star.exe 的原游戏文件夹。`);}if(folder?!s.isDirectory():!s.isFile()||s.size===0)throw Error(`游戏文件不完整：${name}`);}
    try{result.build=manifestDirectory(await fs.readFile(path.resolve(result.path,'../../appmanifest_499170.acf'),'utf8')).build;}catch{}
    result.directoryValid=true;
  }catch(e){result.reason=String(e).replace(/^Error: /,'');}
  return result;
}
export async function registeredSteamRoots():Promise<string[]>{
  const roots:string[]=[];
  if(process.platform==='win32')for(const [key,field]of [['HKCU\\Software\\Valve\\Steam','SteamPath'],['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam','InstallPath']])try{const {stdout}=await promisify(execFile)('reg',['query',key,'/v',field],{windowsHide:true,timeout:3000});const value=stdout.match(/REG_SZ\s+(.+)/)?.[1]?.trim();if(value)roots.push(value);}catch{}
  for(const base of [process.env['ProgramFiles(x86)'],process.env.ProgramFiles])if(base)roots.push(path.join(base,'Steam'));
  return [...new Set(roots.map(r=>path.resolve(r)))];
}
export async function discoverInstallations(savedPath:string|undefined,workspace:string,workspaceLocked:boolean,roots?:string[]):Promise<GameDiscovery>{
  const rows:GameInstallation[]=[];const seen=new Set<string>();
  const add=async(p:string,saved=false)=>{const row=await inspectInstallation(p),key=row.path.toLowerCase();if(!seen.has(key)){seen.add(key);rows.push({...row,saved});}};
  if(savedPath)await add(savedPath,true);
  for(const root of roots??await registeredSteamRoots()){
    let libraries=[root];try{libraries=steamLibraries(await fs.readFile(path.join(root,'steamapps/libraryfolders.vdf'),'utf8'),root);}catch{}
    for(const library of libraries)try{const m=manifestDirectory(await fs.readFile(path.join(library,'steamapps/appmanifest_499170.acf'),'utf8'));await add(path.join(library,'steamapps/common',m.directory));}catch{}
  }
  return{installations:rows,workspace,workspaceLocked};
}
