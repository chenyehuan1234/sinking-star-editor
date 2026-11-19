import type {Vec3,WorldMap,WorldProject} from './shared';

export const worldXYLimit=512;
export const worldZLimit=128;
export const worldVolumeLimit=1_000_000;
export const mapOrigin=(map:WorldMap):[number,number]=>map.origin??[0,0];
export const mapSpawn=(map:WorldMap):Vec3=>[...map.spawn,map.spawnZ??0];
export const cellKey=(point:Vec3)=>point.join(',');
export const spatialEntryId=(index:number)=>801*0x100000+index+1;

export function worldContains(map:WorldMap,x:number,y:number){
  const [left,bottom]=mapOrigin(map);
  return x>=left&&y>=bottom&&x<left+map.width&&y<bottom+map.height;
}

export function worldVoxels(map:WorldMap):Vec3[]{
  if(map.voxels)return map.voxels;
  const cells:Vec3[]=[];
  map.tiles.forEach((tile,index)=>{
    if(!tile)return;
    const x=index%map.width,y=Math.floor(index/map.width);
    cells.push([x,y,-1]);
    if(tile===2)cells.push([x,y,0]);
  });
  return cells;
}

export function upgradeSpatialWorld(world:WorldProject){
  if(world.native||world.version===4)return world;
  world.version=4;
  world.map.voxels=worldVoxels(world.map);
  world.map.tiles=[];
  world.map.origin=[0,0];
  return world;
}

export function worldTerrain(map:WorldMap,positions:Vec3[],solid:boolean){
  const cells=new Map(worldVoxels(map).map(p=>[cellKey(p),p]));
  for(const p of positions){
    if(!worldContains(map,p[0],p[1]))throw Error('地形超出大地图边界');
    if(solid)cells.set(cellKey(p),p);
    else cells.delete(cellKey(p));
  }
  map.voxels=[...cells.values()];
}

export function worldExpansion(map:WorldMap,points:Vec3[]){
  const [x,y]=mapOrigin(map);
  let minX=x,minY=y,maxX=x+map.width-1,maxY=y+map.height-1;
  for(const [px,py] of points){
    minX=Math.min(minX,Math.floor(px));minY=Math.min(minY,Math.floor(py));
    maxX=Math.max(maxX,Math.ceil(px));maxY=Math.max(maxY,Math.ceil(py));
  }
  const width=maxX-minX+1,height=maxY-minY+1;
  if(width>worldXYLimit||height>worldXYLimit)throw Error('扩展后超过大地图 512 × 512 格边界');
  return {origin:[minX,minY] as [number,number],width,height};
}

export function worldVerticalBounds(map:WorldMap,extra:Vec3[]=[]){
  let lo=-1,hi=0;
  for(const z of [map.spawnZ??0,...map.entries.map(e=>e.z??0)]){
    lo=Math.min(lo,z);hi=Math.max(hi,z);
  }
  for(const [, ,z] of worldVoxels(map)){lo=Math.min(lo,z);hi=Math.max(hi,z+1);}
  for(const [, ,z] of extra){lo=Math.min(lo,Math.floor(z));hi=Math.max(hi,Math.ceil(z));}
  const corner=lo-2,size=Math.max(8,hi+3-corner);
  if(size>worldZLimit||(map.width+4)*(map.height+4)*size>worldVolumeLimit)
    throw Error('大地图逻辑范围过大。高度最多 128 层，合计最多 100 万个逻辑格');
  return {corner,size};
}
