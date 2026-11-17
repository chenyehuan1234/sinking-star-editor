import type {EntityView} from './shared';

export type RenderPurpose='terrain-art'|'scenery'|'effect'|'helper';
const shaders=new Map<string,string>();
const sources=new WeakMap<object,(name:string)=>string>();
export function registerMaterialResolver(source:object,resolve:(name:string)=>string){sources.set(source,resolve);}
export function resolveEntityAppearance(source:object,e:EntityView):EntityView{const resolve=sources.get(source);return resolve?{...e,renderPurpose:appearancePurpose(e,name=>{try{return resolve(name);}catch{return '';}})}:e;}
const entities=new WeakMap<EntityView,RenderPurpose>();
export function rememberEntityPurpose(e:EntityView,purpose:RenderPurpose){entities.set(e,purpose);}
export function rememberMaterialShader(name:string,shader:string){shaders.set(name,shader);}
export function materialPurpose(shader:string):RenderPurpose|undefined{return /cloud|additive|nebula|particle|volumetric/i.test(shader)?'effect':shader==='ground_general'?'terrain-art':undefined;}
/** Native flags are 64-bit; bitwise JS number operators discard their high bits. */
export function appearancePurpose(e:EntityView,resolve?:(name:string)=>string):RenderPurpose{
 if(e.type==='View_Giver')return 'scenery';
 if(entities.has(e))return entities.get(e)!;
 if(e.renderPurpose)return e.renderPurpose;
 if(['Ocean_Map','Wall_Set'].includes(e.type))return 'scenery';
 if(['Sun','Sky','Wind','Fog','Fog_Volume','Point_Light','Light_Probe','Global_Effects_Settings','Audio_Marker','Per_Screen_Audio','Shadow_Decal','Translucent_Shadow','Particle_Source','Particle_Force'].includes(e.type)||/^(editorUI(?:_|$)|LIGHTKIT_|ARCH_Order_Intro_Cloud|GAME_EX_CamControl(?:_|$))/i.test(e.mesh))return 'helper';
 const art=['Inanimate','Decal','Animating','Procedurally_Animating','Outline_Override'].includes(e.type);
 if(!art)return 'scenery';
 let flags=0n;try{flags=BigInt(e.nativeFlags??'0');}catch{}
 if(flags&3n)return 'helper';
 if(/^Nebula_|^Star_FX_/i.test(e.mesh)||e.materials?.some(m=>/^(clouds?\d*|smoke|Nebula_FX|Star_FX)(?:_|~|$)/i.test(m)||materialPurpose(resolve?resolve(m):shaders.get(m)??'')==='effect'))return 'effect';
 if(/^ISLE_|^TER_TILE_|^TER_MTN_|^TER_Canyon_/i.test(e.mesh)||e.materials?.some(m=>/^GameFloor_|^Terrain_|^Ground_/i.test(m)||materialPurpose(resolve?resolve(m):shaders.get(m)??'')==='terrain-art'))return 'terrain-art';
 return 'scenery';
}
