import type {Vec3} from './shared';

// Faces are indexed in the same order as Three.js BoxGeometry.
export const faceNormals:readonly Vec3[] = [
  [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
];
export const floorFace=4;
export type TerrainPlacementKind = 'floor'|'wall';
export type TerrainColor = string;
export type TerrainPalette = Partial<Record<TerrainPlacementKind,TerrainColor>>;
export type TerrainFaceColors = Partial<Record<number,TerrainColor>>;
export interface TerrainFacePaint {cell:Vec3; face:number; color:TerrainColor|null}

export const faceKey=(cell:Vec3,face:number)=>cell.join(',')+':'+face;
export const faceIndex=(normal:Vec3)=>faceNormals.findIndex(n=>n.every((v,i)=>v===normal[i]));
export const paletteColor=(palette:TerrainPalette,face:number)=>palette[face===floorFace?'floor':'wall'];
export const validTerrainColor=(color:unknown):color is TerrainColor=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color);

export function terrainFaceColor(cells:{x:number;y:number;z:number;colors?:TerrainFaceColors}[],cell:Vec3,normal:Vec3,palette:TerrainPalette={}):TerrainColor {
  const face=faceIndex(normal);
  const source=cells.find(p=>p.x===cell[0]&&p.y===cell[1]&&p.z===cell[2]+1);
  return source?.colors?.[face]??paletteColor(palette,face)??'#84978b';
}

export function terrainPlacementFaces(cells:Vec3[],kind:TerrainPlacementKind,color:TerrainColor):TerrainFacePaint[] {
  const faces=kind==='floor'?[floorFace]:[0,1,2,3];
  return cells.flatMap(cell=>faces.map(face=>({cell,face,color})));
}

export function validateTerrainPalette(palette:TerrainPalette) {
  if(!palette||typeof palette!=='object'||Array.isArray(palette)||
    Object.entries(palette).some(([key,color])=>!['floor','wall'].includes(key)||!validTerrainColor(color)))throw Error('地形默认色无效');
}

export function validateTerrainFaces(faces:TerrainFacePaint[],limit:number,allowReset=true) {
  if(!Array.isArray(faces)||faces.length>limit||faces.some(item=>!item||
    !Array.isArray(item.cell)||item.cell.length!==3||!item.cell.every(n=>Number.isInteger(n)&&Math.abs(n)<10000)||
    !Number.isInteger(item.face)||item.face<0||item.face>=faceNormals.length||
    !(validTerrainColor(item.color)||allowReset&&item.color===null)))throw Error('地形刷色数据无效');
}

export function rotateTerrainFace(face:number,yaw:number) {
  if(face>=4)return face;
  const ordered=[0,2,1,3];
  return ordered[(ordered.indexOf(face)+(yaw/90)%4+4)%4];
}

export function terrainTint(color:TerrainColor):Vec3{
  const ch=(index:number)=>{
    const v=parseInt(color.slice(index,index+2),16)/255;
    return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
  };
  return [ch(1),ch(3),ch(5)];
}
