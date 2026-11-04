import type {LevelView,EditorProject,WorldProject} from './shared';
export interface PreviewRequest {scene:string;revision:number;baseRevision?:number;project?:EditorProject;world?:WorldProject}
export type TerrainCell=NonNullable<LevelView['terrain']>[number];
export const terrainChunk=(p:TerrainCell)=>[p.x,p.y,p.z].map(n=>Math.floor(n/16)).join(',');
export function chunkTerrain(cells:TerrainCell[]){const chunks=new Map<string,TerrainCell[]>();for(const cell of cells){const key=terrainChunk(cell),list=chunks.get(key)??[];list.push(cell);chunks.set(key,list);}return chunks;}
export interface PreviewDelta {scene:string;revision:number;baseRevision?:number;full?:LevelView;entities?:LevelView['entities'];removed?:number[];chunks?:[string,TerrainCell[]][];fields?:Partial<Omit<LevelView,'entities'|'terrain'>>;milliseconds:number}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function diffPreview(previous:LevelView|null,next:LevelView,request:PreviewRequest,milliseconds=0):PreviewDelta{
 const out:PreviewDelta={scene:request.scene,revision:request.revision,baseRevision:request.baseRevision,milliseconds};
 if(!previous||previous.name!==next.name)return{...out,full:next};
 const byId=new Map(previous.entities.map(e=>[e.id,e]));out.entities=next.entities.filter(e=>!equal(byId.get(e.id),e));const ids=new Set(next.entities.map(e=>e.id));out.removed=previous.entities.filter(e=>!ids.has(e.id)).map(e=>e.id);
 const before=chunkTerrain(previous.terrain??[]),after=chunkTerrain(next.terrain??[]);out.chunks=[...new Set([...before.keys(),...after.keys()])].filter(k=>!equal(before.get(k)??[],after.get(k)??[])).map(k=>[k,after.get(k)??[]]);out.fields={};
 for(const key of ['name','typeCount','manifest','waters','camera','topology']as const)if(!equal(previous[key],next[key]))(out.fields as any)[key]=next[key];return out;
}
export function mergePreview(previous:LevelView|null,delta:PreviewDelta,baseRevision?:number):LevelView{
 if(delta.full)return delta.full;
 if(!previous||delta.baseRevision!==baseRevision)throw Error('预览修订不一致，请重新读取');
 const changes=new Map(delta.entities?.map(e=>[e.id,e])),removed=new Set(delta.removed);const entities=previous.entities.filter(e=>!removed.has(e.id)).map(e=>{const v=changes.get(e.id);changes.delete(e.id);return v??e;});entities.push(...changes.values());
 let terrain=previous.terrain;if(delta.chunks?.length){const chunks=chunkTerrain(terrain??[]);for(const[k,cells]of delta.chunks)cells.length?chunks.set(k,cells):chunks.delete(k);terrain=[...chunks.values()].flat();}
 return{...previous,...delta.fields,entities,terrain};
}
