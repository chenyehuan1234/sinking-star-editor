import type {ObjectCatalog,ObjectPreset} from './catalog-types';
import type {EditOp,EntityView} from './shared';

export const gateForms=['short','up','tall','side'] as const;
export type GateForm=typeof gateForms[number];
export const gateFormLabel=(form:GateForm)=>({short:'1格 · 外观朝下',up:'1格 · 外观朝上',tall:'1.5格 · 外观朝下',side:'水平横向门'}[form]);
export const gateStem=(p:ObjectPreset)=>p.mesh.replace(/_(Down_Short|Down|Side)$/,'');
export function gateForm(p:ObjectPreset):GateForm {return p.mesh.endsWith('_Side')||Boolean(p.signature.sideways??p.values.sideways)?'side':p.mesh.endsWith('_Down_Short')?'short':p.mesh.endsWith('_Down')?'tall':'up';}
export function gateStandardForm(p:ObjectPreset){const height=Number(p.signature.height??p.values.height??1);return Math.abs(height-(gateForm(p)==='tall'?1.5:1))<.00001;}
/** Catalog organization only: native shading/response variants retain their original keys. */
export function gateLibraryGroup(p:ObjectPreset){const materials=p.materials.map(m=>m.replace(/~[^~]+$/,'~level'));while(materials.at(-1)==='')materials.pop();return JSON.stringify([Boolean(p.signature.is_monster_gate??p.values.is_monster_gate),gateStem(p),materials]);}
export const gatePreferenceKey=(p:ObjectPreset)=>'Gate:'+gateLibraryGroup(p)+':'+gateForm(p);
export function gateLibraryLabel(p:ObjectPreset){const color=({A:'金色',B:'蓝色',C:'紫色',D:'绿色',Monster_A:'黑色',Promesst_A:'红色符文'} as Record<string,string>)[gateStem(p).match(/Glyph_(.+)$/)?.[1]??'']??'原生外观';return(Boolean(p.signature.is_monster_gate??p.values.is_monster_gate)?'怪物门闸':'普通门闸')+' · '+color;}
export function gateLibraryOrder(p:ObjectPreset){const style=gateStem(p).match(/Glyph_(.+)$/)?.[1]??'',order=['A','B','C','D','Promesst_A','Monster_A'].indexOf(style);return Number(Boolean(p.signature.is_monster_gate??p.values.is_monster_gate))*100+(order<0?20:order);}

export function gateDisplayName(p:ObjectPreset){const form=gateForm(p),height=Number(p.signature.height??p.values.height??1);return gateLibraryLabel(p)+' · '+(gateStandardForm(p)?gateFormLabel(form):form==='side'?`水平横向门 · 高度${height}`:`${height}格 · 外观${form==='up'?'朝上':'朝下'}`);}

const colorFields=['a','b'].flatMap(t=>['x','y','z','w'].map(axis=>`tint_color_${t}.${axis}`));
export const gateColors=(p:ObjectPreset)=>colorFields.map(field=>Number(p.values[field]??1));
export const gateColorValues=(colors:number[])=>Object.fromEntries(colorFields.map((field,i)=>[field,colors[i]]));
/** Use a native color reference for the whole library family, independent of the shape's level-specific tint. */
export function gateLibraryColors(catalog:ObjectCatalog,p:ObjectPreset){const group=gateLibraryGroup(p),reference=catalog.presets.filter(v=>v.type==='Gate'&&v.parsed&&gateLibraryGroup(v)===group&&gateForm(v)==='short'&&gateStandardForm(v)).sort((a,b)=>Number(Boolean(a.signature.notted))-Number(Boolean(b.signature.notted))||a.key.localeCompare(b.key))[0];return gateColors(reference??p);}
export function gateColorCorrections(catalog:ObjectCatalog,entities:EntityView[]):EditOp[]{return entities.flatMap<EditOp>(entity=>{if(entity.type!=='Gate'||!entity.editable)return[];const monster=Boolean(entity.nativeProperties?.find(p=>p.field.name==='is_monster_gate')?.value),source=catalog.presets.find(p=>p.type==='Gate'&&p.parsed&&p.mesh===entity.mesh&&Boolean(p.signature.is_monster_gate??p.values.is_monster_gate)===monster&&gateLibraryGroup({...p,materials:entity.materials??p.materials})===gateLibraryGroup(p));if(!source)return[];const colors=gateLibraryColors(catalog,source);return entity.tint?.every((n,i)=>Math.abs(n-colors[i])<.00001)?[]:[{kind:'properties',id:entity.id,values:gateColorValues(colors)}];});}
