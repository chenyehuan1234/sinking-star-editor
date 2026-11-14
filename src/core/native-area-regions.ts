import type {NativeLevelRegion,Vec3} from '../shared';
import type {GamePackage} from './package';import type {PropertyCodec} from './properties';import {parseEntities,type EntityFile,type EntityRecord} from './entities';
export function localizationEntries(text:string){const result=new Map<string,string>();for(const block of text.replace(/\r/g,'').split(/^`/m).slice(1)){const lines=block.split('\n'),key=lines.shift()!.trim(),value=lines.filter(l=>l.trim()&&!l.startsWith('#')).join('\n').trim();if(key&&value)result.set(key,value);}return result;}
type Layer='ground'|'underground'|'sky';
interface Area {id:string;key:string;title:string;pinId:number;layer:Layer}
interface Volume {area:Area;center:Vec3;extents:Vec3;rotation:[number,number,number,number];scale:Vec3}
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function inVolume(p:Vec3,v:Volume,dx=0,dy=0){
 const d:Vec3=[p[0]+dx-v.center[0],p[1]+dy-v.center[1],p[2]-v.center[2]],q:Vec3=[-v.rotation[0],-v.rotation[1],-v.rotation[2]],t=cross(q,d).map(n=>n*2)as Vec3,u=cross(q,t);
 return d.every((n,i)=>Math.abs((n+v.rotation[3]*t[i]+u[i])/v.scale[i])<=v.extents[i]+.001);
}
/** Read the game's explicit local_area -> Area_Pin links, never nearest pins. */
export function nativeRegionsFromFile(file:EntityFile,codec:Pick<PropertyCodec,'get'>,names:Set<string>,localization=''):NativeLevelRegion[]{
 const text=localizationEntries(localization),settings=file.records.find(r=>r.type==='Settings');
 const num=(r:EntityRecord,key:string,fallback=0)=>Number(codec.get(r,key,fallback)),setting=(key:string,fallback:number)=>settings?num(settings,key,fallback):fallback;
 const wx=setting('squares_per_screen_x',19),wy=setting('squares_per_screen_y',13),ox=setting('per_screen_camera_corner.x',0),oy=setting('per_screen_camera_corner.y',0),lower=setting('underground_barrier',-4),upper=setting('skyground_barrier',10);
 if(![wx,wy,ox,oy,lower,upper].every(Number.isFinite)||wx<=0||wy<=0)throw Error('原版地图分区尺寸无效');
 const pos=(r:EntityRecord):Vec3=>['x','y','z'].map(k=>num(r,'position.'+k))as Vec3,layer=(z:number):Layer=>z<lower?'underground':z>upper?'sky':'ground';
 const cell=(p:Vec3):[number,number]=>[Math.floor((p[0]-ox+.5)/wx),Math.floor((p[1]-oy+.5)/wy)];
 const pins=new Map<number,Area>();for(const r of file.records)if(r.type==='Area_Pin'){const key=String(codec.get(r,'local_area_name',''));if(key)pins.set(r.id,{id:'area:'+r.id,key,title:text.get(key)??key,pinId:r.id,layer:layer(pos(r)[2])});}
 const volumes:Volume[]=[];for(const r of file.records)if(r.type==='Marker'&&codec.get(r,'script_name','')==='local_area'&&!codec.get(r,'is_point_marker',false)){
  const area=pins.get(num(r,'script_target_entity_id'));if(!area)continue;
  const extents=['x','y','z'].map(k=>num(r,'props.box_extents.'+k))as Vec3,scale=['x','y','z'].map(k=>num(r,'scale.'+k,1))as Vec3,rotation=['x','y','z','w'].map(k=>num(r,'orientation.'+k,k==='w'?1:0))as[number,number,number,number];
  const length=Math.hypot(...rotation);if(!extents.every(n=>Number.isFinite(n)&&n>0)||!scale.every(n=>Number.isFinite(n)&&Math.abs(n)>.0001)||!Number.isFinite(length)||length<.0001)continue;
  volumes.push({area,center:pos(r),extents,scale,rotation:rotation.map(n=>n/length)as[number,number,number,number]});
 }
 const wrapping=Boolean(settings&&codec.get(settings,'grid.wrapping',false)),gx=setting('grid.squares_x',0),gy=setting('grid.squares_y',0),offsetX=wrapping&&gx>0?[-gx,0,gx]:[0],offsetY=wrapping&&gy>0?[-gy,0,gy]:[0];
 const groups=new Map<string,NativeLevelRegion>(),seen=new Set<string>();
 for(const r of file.records)if(r.type==='Level_Entry'){
  const name=String(codec.get(r,'level_name',''));if(!names.has(name))continue;const p=pos(r),c=cell(p),l=layer(p[2]);
  const matching=new Map<number,Area>();for(const v of volumes)if(offsetX.some(dx=>offsetY.some(dy=>inVolume(p,v,dx,dy))))matching.set(v.area.pinId,v.area);
  const candidates=[...matching.values()];let id:string,title:string,groupLayer:Layer;
  if(candidates.length===1){id=candidates[0].id;title=candidates[0].title;groupLayer=candidates[0].layer;}
  else if(candidates.length>1){id='overlap:'+l+':'+candidates.map(a=>a.pinId).sort((a,b)=>a-b).join(':');title=candidates.map(a=>a.title).sort().join(' ／ ')+'（区域交界）';groupLayer=l;}
  else{id='unmarked:'+l;title='区域归属待确认';groupLayer=l;}
  let g=groups.get(id);if(!g){g={id,title,layer:groupLayer,levels:[],cells:[],subregions:[],nameSource:candidates.length===1?'native-volume':candidates.length?'overlap':'unmarked',areaKey:candidates.length===1?candidates[0].key:undefined};groups.set(id,g);}
  if(!g.levels.includes(name))g.levels.push(name);if(!g.cells!.some(v=>v[0]===c[0]&&v[1]===c[1]))g.cells!.push(c);
  let sub=g.subregions!.find(v=>v.cell[0]===c[0]&&v.cell[1]===c[1]);if(!sub){sub={cell:c,levels:[]};g.subregions!.push(sub);}if(!sub.levels.includes(name))sub.levels.push(name);seen.add(name);
 }
 const order={ground:0,underground:1,sky:2,other:3};const result=[...groups.values()].sort((a,b)=>order[a.layer]-order[b.layer]||Number(a.nameSource!=='native-volume')-Number(b.nameSource!=='native-volume')||a.title.localeCompare(b.title,'zh-CN'));
 for(const group of result){group.levels.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));group.cells!.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);group.subregions!.sort((a,b)=>a.cell[1]-b.cell[1]||a.cell[0]-b.cell[0]);for(const sub of group.subregions!)sub.levels.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));}
 const remaining=[...names].filter(n=>!seen.has(n)),extra=remaining.filter(n=>!['intro','overworld'].includes(n)&&!n.startsWith('menu_')),aux=remaining.filter(n=>!extra.includes(n));
 if(extra.length)result.push({id:'unplaced',title:'未在大地图放置入口',layer:'other',levels:extra.sort()});if(aux.length)result.push({id:'auxiliary',title:'菜单、序章与大地图',layer:'other',levels:aux.sort()});return result;
}
export function nativeRegions(pkg:GamePackage,codec:PropertyCodec,localization=''):NativeLevelRegion[]{return nativeRegionsFromFile(parseEntities(pkg.get('data-common/overworld.entities')),codec,new Set(pkg.entries.filter(e=>e.name.endsWith('.entities')).map(e=>e.name.split('/').at(-1)!.slice(0,-9))),localization);}
