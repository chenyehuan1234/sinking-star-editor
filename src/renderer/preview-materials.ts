import * as T from 'three';

/** Three's Material.clone does not copy shader callbacks used by native world UV/tint. */
export function cloneNativeMaterial<M extends T.Material>(source:M):M{
  const copy=source.clone();
  copy.onBeforeCompile=source.onBeforeCompile;
  copy.customProgramCacheKey=source.customProgramCacheKey;
  return copy;
}
export function previewMaterial<M extends T.Material>(source:M,opacity:number):M{
  const copy=cloneNativeMaterial(source);
  copy.userData={...copy.userData,previewBaseOpacity:source.opacity,previewBaseAlphaTest:source.alphaTest};
  copy.transparent=true;copy.depthWrite=false;copy.forceSinglePass=true;
  copy.polygonOffset=true;copy.polygonOffsetFactor=-1;copy.polygonOffsetUnits=-1;
  setPreviewOpacity(copy,opacity);
  return copy;
}
export function setPreviewOpacity(material:T.Material,opacity:number){
  material.opacity=(material.userData.previewBaseOpacity??1)*opacity;
  // Alpha testing happens after opacity multiplication: keep the same texture cutout.
  if(material.userData.previewBaseAlphaTest!==undefined)material.alphaTest=material.userData.previewBaseAlphaTest*opacity;
}
