import type{NativeLevelRegion}from'../shared';
import type{GamePackage}from'./package';
import type{PropertyCodec}from'./properties';
import{parseEntities}from'./entities';

export function localizationEntries(text:string){const result=new Map<string,string>();for(const block of text.replace(/\r/g,'').split(/^`/m).slice(1)){const lines=block.split('\n'),key=lines.shift()!.trim(),value=lines.filter(l=>l.trim()&&!l.startsWith('#')).join('\n').trim();if(key&&value)result.set(key,value);}return result;}

// Use the original overworld's screen coordinates and layer barriers, never filename prefixes or nearest-pin guesses.
export function nativeRegions(pkg:GamePackage,codec:PropertyCodec,localization=''):NativeLevelRegion[]{
 const names=new Set(pkg.entries.filter(e=>e.name.endsWith('.entities')).map(e=>e.name.split('/').at(-1)!.slice(0,-9))),text=localizationEntries(localization),file=parseEntities(pkg.get('data-common/overworld.entities')),settings=file.records.find(r=>r.type==='Settings');
 const setting=(key:string,fallback:number)=>settings?Number(codec.get(settings,key,fallback)):fallback,wx=setting('squares_per_screen_x',19),wy=setting('squares_per_screen_y',13),ox=setting('per_screen_camera_corner.x',0),oy=setting('per_screen_camera_corner.y',0),lower=setting('underground_barrier',-4),upper=setting('skyground_barrier',10);
 if(!Number.isFinite(wx)||!Number.isFinite(wy)||wx<=0||wy<=0)throw Error('原版地图分区尺寸无效');
 const location=(r:typeof file.records[number])=>{const x=Number(codec.get(r,'position.x',0)),y=Number(codec.get(r,'position.y',0)),z=Number(codec.get(r,'position.z',0)),layer=z<lower?'underground' as const:z>upper?'sky' as const:'ground' as const,cell:[number,number]=[Math.floor((x-ox+.5)/wx),Math.floor((y-oy+.5)/wy)];return{layer,cell,id:layer+':'+cell.join(':')};};
 const pins=new Map<string,Set<string>>();for(const r of file.records.filter(r=>r.type==='Area_Pin')){const key=String(codec.get(r,'local_area_name',''));if(!key)continue;const id=location(r).id;const labels=pins.get(id)??new Set<string>();labels.add(text.get(key)??key);pins.set(id,labels);}
 const groups=new Map<string,NativeLevelRegion>(),seen=new Set<string>();for(const r of file.records.filter(r=>r.type==='Level_Entry')){const name=String(codec.get(r,'level_name',''));if(!names.has(name))continue;const loc=location(r),labels=pins.get(loc.id),title=labels?.size===1?[...labels][0]:`未命名分区（${loc.cell.join('，')}）`;let group=groups.get(loc.id);if(!group){group={...loc,title,levels:[]};groups.set(loc.id,group);}if(!group.levels.includes(name))group.levels.push(name);seen.add(name);}
 const remaining=[...names].filter(n=>!seen.has(n)),extra=remaining.filter(n=>!['intro','overworld'].includes(n)&&!n.startsWith('menu_')),aux=remaining.filter(n=>!extra.includes(n));
 const order={ground:0,underground:1,sky:2,other:3};const result=[...groups.values()].sort((a,b)=>order[a.layer]-order[b.layer]||Number(a.title.startsWith('未命名'))-Number(b.title.startsWith('未命名'))||a.cell![1]-b.cell![1]||a.cell![0]-b.cell![0]);for(const group of result)group.levels.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 if(extra.length)result.push({id:'unplaced',title:'未在大地图放置入口',layer:'other',levels:extra.sort()});if(aux.length)result.push({id:'auxiliary',title:'菜单、序章与大地图',layer:'other',levels:aux.sort()});return result;
}
