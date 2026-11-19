import * as T from 'three';
/** UV borders follow all six voxel faces without extra objects or draw calls. */
export function terrainGridMaterial(material:T.MeshStandardMaterial,painted=false){
 const enabled={value:1};material.userData.terrainGrid=enabled;
 material.onBeforeCompile=shader=>{
  shader.uniforms.editorTerrainGrid=enabled;
  shader.vertexShader='varying vec2 vTerrainCellUv;\nvarying float vTerrainDistance;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvTerrainCellUv=uv;').replace('#include <project_vertex>','#include <project_vertex>\nvTerrainDistance=length(mvPosition.xyz);');
  if(painted){
   const attributes=Array.from({length:6},(_,i)=>'attribute vec3 terrainFaceTint'+i+';').join('\n');
   shader.vertexShader=attributes+'\nvarying vec3 vTerrainTint;\n'+shader.vertexShader.replace('#include <color_vertex>',`#include <color_vertex>
    vTerrainTint = abs(normal.x) > 0.5 ? (normal.x > 0.0 ? terrainFaceTint0 : terrainFaceTint1)
      : abs(normal.y) > 0.5 ? (normal.y > 0.0 ? terrainFaceTint2 : terrainFaceTint3)
      : normal.z > 0.0 ? terrainFaceTint4 : terrainFaceTint5;`);
   shader.fragmentShader='varying vec3 vTerrainTint;\n'+shader.fragmentShader;
  }
  shader.fragmentShader='uniform float editorTerrainGrid;\nvarying vec2 vTerrainCellUv;\nvarying float vTerrainDistance;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 ${painted?'diffuseColor.rgb *= vTerrainTint;':''}
 vec2 edge=min(vTerrainCellUv,1.0-vTerrainCellUv);
 vec2 pixel=max(fwidth(vTerrainCellUv),vec2(0.0001));
 float line=1.0-smoothstep(0.45,1.35,min(edge.x/pixel.x,edge.y/pixel.y));
 float fade=1.0-smoothstep(50.0,180.0,vTerrainDistance);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*0.34,line*fade*editorTerrainGrid*0.72);`);
 };material.customProgramCacheKey=()=>painted?'terrain-surface-grid-paint':'terrain-surface-grid-1';return material;
}
export function setTerrainGrid(root:T.Object3D,visible:boolean){root.traverse(o=>{const material=(o as T.Mesh).material;for(const m of Array.isArray(material)?material:material?[material]:[])if(m.userData.terrainGrid)m.userData.terrainGrid.value=visible?1:0;});}
