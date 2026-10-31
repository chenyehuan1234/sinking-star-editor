import * as T from 'three';
import type {EntityView} from '../shared';
export class ViewAssets {
  decalGeometry?:T.PlaneGeometry;
  geometries=new Map<string,Promise<{geometry:T.BufferGeometry;materials:string[]}>>();
  materials=new Map<string,Promise<T.MeshStandardMaterial>>();textures=new Map<string,Promise<T.DataTexture>>();variants=new Map<string,T.MeshStandardMaterial>();disposed=false;
  constructor(readonly changed:()=>void,readonly failed:(message:string)=>void){}
  geometry(name:string,pose=false){const key=name+':'+pose;let p=this.geometries.get(key);if(!p){p=(pose?window.editor.previewMesh({name,lod:1,pose:'idle'}):window.editor.meshAsset(name,1)).then(a=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(a.positions,3));g.setAttribute('uv',new T.BufferAttribute(a.uvs,2));g.setIndex(new T.BufferAttribute(a.indices,1));for(const group of a.groups)g.addGroup(group.start,group.count,group.materialIndex);g.computeVertexNormals();g.computeBoundingSphere();if(this.disposed)g.dispose();return{geometry:g,materials:a.materials};});this.geometries.set(key,p);}return p;}
  texture(name:string){let p=this.textures.get(name);if(!p){p=window.editor.textureAsset(name,512).then(a=>{const t=new T.DataTexture(a.pixels,a.width,a.height,T.RGBAFormat);t.colorSpace=a.srgb?T.SRGBColorSpace:T.NoColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.flipY=false;t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.needsUpdate=true;if(this.disposed)t.dispose();return t;});this.textures.set(name,p);}return p;}
  material(name:string){let p=this.materials.get(name);if(!p){p=window.editor.materialAsset(name||'default').then(async a=>{const mat=new T.MeshStandardMaterial({name,color:new T.Color(...a.color.slice(0,3)as[number,number,number]),roughness:a.roughness,metalness:/metal/i.test(a.shader)?.35:0,side:a.doubleSided?T.DoubleSide:T.FrontSide,transparent:a.color[3]<1,opacity:a.color[3]});
      if(/crystal|glass/i.test(a.shader)){mat.transparent=true;mat.opacity=.78;mat.roughness=.22;}
      if(/masked|foliage|decal/i.test(a.shader))mat.alphaTest=.35;
      mat.userData.mask=a.mask??'0';
      if(a.worldUV||a.tintMap){
        const tint={value:null as T.Texture|null};
        mat.onBeforeCompile=shader=>{shader.uniforms.nativeTintMap=tint;shader.uniforms.nativeTintOffset={value:new T.Vector2(...(a.tintOffset??[0,0]))};shader.uniforms.nativeTintSize={value:Math.max(.001,a.tintSize??1)};shader.uniforms.nativeUVScale={value:Math.max(.001,a.uvScale??1)};
          shader.vertexShader='varying vec3 vNativeWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvNativeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          shader.fragmentShader='varying vec3 vNativeWorld;\nuniform sampler2D nativeTintMap;\nuniform vec2 nativeTintOffset;\nuniform float nativeTintSize;\nuniform float nativeUVScale;\n'+shader.fragmentShader;
          if(a.worldUV)shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\nvec4 sampledDiffuseColor = texture2D(map, vNativeWorld.xy / nativeUVScale);\ndiffuseColor *= sampledDiffuseColor;\n#endif');
          if(a.tintMap&&tint.value)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nvec2 nativeTintUV=vec2(vNativeWorld.x-nativeTintOffset.x,nativeTintOffset.y-vNativeWorld.y)/nativeTintSize;\ndiffuseColor.rgb *= texture2D(nativeTintMap,nativeTintUV).rgb;');
        };
        mat.customProgramCacheKey=()=>JSON.stringify([a.worldUV,a.tintMap,Boolean(tint.value)]);
        if(a.tintMap)await this.texture(a.tintMap).then(t=>{tint.value=t;mat.needsUpdate=true;this.changed();}).catch(e=>this.failed(a.tintMap+': '+String(e)));
      }
      if(a.alphaMap)await this.texture(a.alphaMap).then(t=>{mat.alphaMap=t;mat.transparent=true;mat.alphaTest=.08;mat.needsUpdate=true;this.changed();}).catch(e=>this.failed(String(e)));
      if(a.map)await this.texture(a.map).then(t=>{mat.map=t;mat.needsUpdate=true;this.changed();}).catch(e=>this.failed(a.map+': '+String(e)));
      if(this.disposed)mat.dispose();return mat;
    }).catch(e=>{this.failed(name+': '+String(e));return new T.MeshStandardMaterial({color:'#c87b51',roughness:.9,wireframe:true});});this.materials.set(name,p);}return p;}
  async entity(e:EntityView){const a=e.type==='Decal'?{geometry:this.decalGeometry??=new T.PlaneGeometry(1,1),materials:e.materials?.length?e.materials:['default']}:await this.geometry(e.mesh,['Guy','Monster'].includes(e.type));const names=a.materials.map((name,i)=>e.materials?.[i]||name);const materials=await Promise.all(names.map(n=>this.material(n)));const tinted=materials.map(m=>{if(!e.tint||e.tint.every(v=>v===1))return m;const key=m.name+':'+e.tint.join(',');let v=this.variants.get(key);if(!v){v=m.clone();v.color.multiply(new T.Color(...e.tint));v.onBeforeCompile=m.onBeforeCompile;v.customProgramCacheKey=m.customProgramCacheKey;this.variants.set(key,v);}return v;});const visibility=e.accessoryMask,inventory=Number(e.nativeProperties?.find(p=>p.field.name==='inventory_flags')?.value??0);const filtered=tinted.map(m=>{const mask=Number(m.userData.mask??0)>>>0;if(visibility!==undefined&&mask&&(mask&(visibility>>>0))===0||e.type==='Guy'&&(/prom_wand/.test(m.name)&&!(inventory&1024)||/prom_torc/.test(m.name)&&!(inventory&2048)||/prom_prism/.test(m.name)&&!(inventory&4096))){const key='hidden:'+m.uuid;let hidden=this.variants.get(key);if(!hidden){hidden=m.clone();hidden.visible=false;this.variants.set(key,hidden);}return hidden;}return m;});const mesh=new T.Mesh(a.geometry,filtered);if(e.type==='Decal')mesh.position.z=.015;return mesh;}
  dispose(){this.disposed=true;this.decalGeometry?.dispose();for(const p of this.geometries.values())void p.then(a=>a.geometry.dispose()).catch(()=>{});for(const p of this.materials.values())void p.then(m=>m.dispose()).catch(()=>{});for(const p of this.textures.values())void p.then(t=>t.dispose()).catch(()=>{});for(const m of this.variants.values())m.dispose();}
}
