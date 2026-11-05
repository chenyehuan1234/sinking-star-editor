/** Local browsing state only; none of these fields belong to a design project. */
export interface ScrollPosition {scrollTop:number;anchor?:string;offset?:number}
export interface AssetTab extends ScrollPosition {query:string;all:boolean}
export interface AssetBrowserMemory {active:string;category:string;tabs:Record<string,AssetTab>}
export interface NativeBrowserMemory {query:string;open:Record<string,boolean>;aux:boolean;scrollTop:number;lastLevel:string}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const text=(v:unknown)=>typeof v==='string'?v.slice(0,512):'';
const position=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,v):0;
export const emptyAssetTab=():AssetTab=>({query:'',all:false,scrollTop:0});
export function readAssetBrowser(value:unknown,categories:string[],filtered=false):AssetBrowserMemory{
  const v=object(value),category=categories.includes(String(v.category))?String(v.category):categories[0],allowed=filtered?['filtered','favorites']:[...categories,'recent','favorites'];
  const tabs:Record<string,AssetTab>={};
  for(const key of allowed){const t=object(object(v.tabs)[key]);tabs[key]={query:text(t.query),all:t.all===true,scrollTop:position(t.scrollTop),anchor:text(t.anchor)||undefined,offset:position(t.offset)};}
  return{active:allowed.includes(String(v.active))?String(v.active):allowed[0],category,tabs};
}
export function readNativeBrowser(value:unknown):NativeBrowserMemory{
  const v=object(value),open=Object.fromEntries(Object.entries(object(v.open)).filter(([,v])=>v===true).map(([key])=>[key,true]));
  return{query:text(v.query),open,aux:v.aux===true,scrollTop:position(v.scrollTop),lastLevel:text(v.lastLevel)};
}
export function rememberScroll(keys:string[],columns:number,rowHeight:number,scrollTop:number):ScrollPosition{
  const row=Math.floor(position(scrollTop)/rowHeight);
  return{scrollTop:position(scrollTop),anchor:keys[row*columns],offset:position(scrollTop)-row*rowHeight};
}
export function restoreScroll(saved:ScrollPosition,keys:string[],columns:number,rowHeight:number,max:number){
  const index=saved.anchor?keys.indexOf(saved.anchor):-1;
  const top=index>=0?Math.floor(index/columns)*rowHeight+(saved.offset??0):saved.scrollTop;
  return Math.max(0,Math.min(Number.isFinite(max)?max:0,position(top)));
}
export function rememberedView(levels:{id:string}[],value:unknown){return typeof value==='string'&&levels.some(l=>l.id===value)?value:'world';}
