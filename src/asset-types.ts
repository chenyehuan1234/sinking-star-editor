export interface MeshAsset {
  name:string;checksum:number;skinned:boolean;lod:number;lodCount:number;bounds:[number,number,number,number,number,number];
  positions:Float32Array;uvs:Float32Array;colors:Uint8Array;indices:Uint32Array;
  groups:{start:number;count:number;materialIndex:number}[];materials:string[];
  skin?:{weights:Uint8Array;indices:Uint8Array;names:string[];inverseBind:Float32Array};
  previewPose?:string;
}
export interface TextureAsset {name:string;width:number;height:number;format:number;srgb:boolean;pixels:Uint8Array;}
export interface MaterialAsset {name:string;shader:string;color:[number,number,number,number];map?:string;normalMap?:string;alphaMap?:string;transparent:boolean;roughness:number;doubleSided:boolean;worldUV?:boolean;uvScale?:number;tintMap?:string;tintOffset?:[number,number];tintSize?:number;mask?:string;}
export interface AssetStatus {meshes:number;textures:number;cacheHits:number;decoded:number;failures:{name:string;error:string}[];}
