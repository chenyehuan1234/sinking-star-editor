import{GamePackage}from'./package';import type{MaterialAsset}from'../asset-types';
type MaterialValue=string|number|boolean|number[];
export class NativeMaterials {
  private texts=new Map<string,string>();private cache=new Map<string,Record<string,MaterialValue>>();
  constructor(pkg:GamePackage){for(const e of pkg.entries){const name=e.name.split('/').at(-1)!.replace(/\.material$/,'');if(this.texts.has(name)&&this.texts.get(name)!==e.data.toString())throw new Error('材质名称重复：'+name);this.texts.set(name,e.data.toString('utf8'));}}
  parameters(name:string,chain:string[]=[]):Record<string,MaterialValue>{
    const cached=this.cache.get(name);if(cached)return cached;if(chain.length>32||chain.includes(name))throw new Error('材质继承循环：'+name);
    const text=this.texts.get(name);if(!text)throw new Error('原生材质不存在：'+name);const values:Record<string,MaterialValue>={};
    for(const line of text.split(/\r?\n/)){const m=line.trim().match(/^(\S+)\s+(.+)$/);if(!m||m[1].startsWith('#'))continue;const[k,v]=[m[1],m[2].trim()];if(v.startsWith('"'))values[k]=v.match(/^"([^"]*)"/)?.[1]??'';else if(v.startsWith('('))values[k]=v.slice(1,v.indexOf(')')).split(/\s+/).filter(Boolean).map(Number);else if(v==='true'||v==='false')values[k]=v==='true';else if(Number.isFinite(Number(v)))values[k]=Number(v);else values[k]=v;}
    const parent=typeof values.parent==='string'?this.parameters(values.parent,[...chain,name]):{};const result={...parent,...values};this.cache.set(name,result);return result;
  }
  material(name:string):MaterialAsset{
    if(name==='default'||!name)return{name:'default',shader:'basic',color:[.65,.68,.64,1],roughness:.85,transparent:false,doubleSided:true};
    const p=this.parameters(name),shader=String(p.shader??'basic'),pick=(...keys:string[])=>keys.map(k=>p[k]).find(v=>typeof v==='string'&&v!==''&&v!=='white')as string|undefined;
    const color=(Array.isArray(p.tint_color_A)?p.tint_color_A:Array.isArray(p.color_core)?p.color_core:[1,1,1]).slice(0,3)as number[];
    while(color.length<3)color.push(1);const alpha=typeof p.opacity==='number'?p.opacity:1;
    const tintMap=pick('tint_map_A','tint_map_B');
    return{name,shader,color:[color[0],color[1],color[2],alpha],map:pick('DIFFR_tex','color_map','DIFFR_A','Crystal_Color_Map','albedo_tex','base_color'),alphaMap:pick('OPAC_tex','opacity_tex'),normalMap:pick('NRML_tex','normal_map','NRML_A','NRML_tex_A'),transparent:alpha<1||/crystal|glass|foliage_masked|basic_masked|decal/i.test(shader),roughness:typeof p.roughness==='number'?p.roughness:typeof p.rough_min==='number'?Math.max(.25,p.rough_min):.8,doubleSided:true,worldUV:shader==='ground_general'&&p.use_mesh_uvs_A===false,uvScale:typeof p.diffr_a_scale_XY==='number'?p.diffr_a_scale_XY:1,tintMap:shader==='ground_general'&&tintMap!=='default'?tintMap:undefined,tintOffset:[Number(p.tint_map_offset_X??0),Number(p.tint_map_offset_Y??0)],tintSize:Number(p.tint_map_size_XY??1),mask:p.mask!==undefined?String(p.mask):undefined};
  }
}
