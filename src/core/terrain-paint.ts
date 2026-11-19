import {faceKey,faceNormals,paletteColor,terrainTint,type TerrainFaceColors,type TerrainFacePaint,type TerrainPalette} from '../terrain-paint';
import type {Vec3} from '../shared';
import {position,type EntityFile,type EntityRecord} from './entities';
import type {PropertyCodec} from './properties';
import {Quaternion,Vector3} from 'three';

const paintSurfaceMaterial='Floor_Tile_A';
export const paintSurfaceTemplate='a_wiz_out_of_water';
export const generatedTerrainName=(name:string)=>name.startsWith('editor_voxel_')||name==='editor_blank_ground';

function generatedFace(codec:PropertyCodec,record:EntityRecord) {
  const key=String(codec.get(record,'entity_name',''));
  const match=/^editor_voxel_(-?\d+),(-?\d+),(-?\d+)$/.exec(key);
  const at=match&&position(record);
  if(!at)return undefined;
  const cell=match.slice(1).map(Number) as Vec3;
  const delta=[at[0]-cell[0],at[1]-cell[1],at[2]-cell[2]-.5];
  const face=faceNormals.findIndex(normal=>normal.every((n,i)=>Math.abs(delta[i]-n*.5)<.02));
  return face>=0?{cell,face}:undefined;
}

function forEachSolid(codec:PropertyCodec,record:EntityRecord,visit:(cell:Vec3)=>void) {
  const raw=new Map(codec.parse(record).fields.map(f=>[f.schema.name,f.value]));
  if(Number(raw.get('kind')??0)!==0)return;
  const dims=['x','y','z'].map(a=>Number(raw.get('wall_data.dimensions.'+a)??0));
  const volume=dims.reduce((a,b)=>a*b,1);
  if(volume<1||volume>1_000_000)return;
  const corner=['x','y','z'].map(a=>Number(raw.get('position.'+a)??0)+Number(raw.get('wall_data.corner.'+a)??0));
  const slots=raw.get('wall_data.bits.slots');
  if(!Array.isArray(slots))return;
  const [sx,sy]=dims;
  slots.forEach((value,i)=>{
    const bits=BigInt(value);
    if(!bits)return;
    for(let b=0;b<64;b++){
      const bit=i*64+b;
      if(bit>=volume)break;
      if(bits&(1n<<BigInt(b)))visit([corner[0]+bit%sx,corner[1]+Math.floor(bit/sx)%sy,corner[2]+Math.floor(bit/(sx*sy))]);
    }
  });
}

/** Apply colours to the visual mesh after all geometry edits. Collision stays in Wall_Set. */
export function applyTerrainPaint(codec:PropertyCodec,file:EntityFile,palette:TerrainPalette,changes:Map<string,TerrainFacePaint>) {
  if(!Object.keys(palette).length&&!changes.size)return;
  const paintAll=Object.keys(palette).length>0;
  const chosen=new Set([...changes.values()].map(item=>item.cell.join(',')));
  const occupied=new Set<string>(),editable=new Map<string,Vec3>(),art=new Map<string,number[]>();
  file.records.forEach((record,index)=>{
    if(record.type==='Wall_Set'){
      const generated=generatedTerrainName(String(codec.get(record,'entity_name','')));
      forEachSolid(codec,record,cell=>{
        const key=cell.join(',');
        occupied.add(key);
        if(generated&&(paintAll||chosen.has(key)))editable.set(key,cell);
      });
    }else if(record.type==='Inanimate'&&record.diff.includes('editor_voxel_')){
      const parsed=generatedFace(codec,record);
      if(!parsed)return;
      const key=faceKey(parsed.cell,parsed.face),rows=art.get(key)??[];
      rows.push(index);
      art.set(key,rows);
    }
  });
  const used=new Set(file.records.map(r=>r.id));
  let serial=899*0x100000+1;
  const next=()=>{
    while(used.has(serial))serial++;
    if(serial>=900*0x100000)throw Error('地形材质超过原生实体编号容量');
    return serial++;
  };
  const typeIndex=file.types.indexOf('Inanimate');
  const faces=new Map<string,TerrainFaceColors>();
  const transfers:TerrainFacePaint[]=[];
  for(const [key,cell] of editable){
    faceNormals.forEach((normal,face)=>{
      const id=faceKey(cell,face);
      const color=changes.get(id)?.color??paletteColor(palette,face);
      if(!color||occupied.has(cell.map((n,i)=>n+normal[i]).join(',')))return;
      const [red,green,blue]=terrainTint(color);
      // Place the static visual surface above the voxel's own surface. The
      // visual transform also needs to be saved for Inanimate records.
      const [x,y,z]=cell.map((n,i)=>n+normal[i]*.51+(i===2?.5:0));
      const tint={
        entity_flags:524800,materials:[paintSurfaceMaterial],
        'position.x':x,'position.y':y,'position.z':z,
        'visual_position.x':x,'visual_position.y':y,'visual_position.z':z,
        'tint_color_a.x':red,'tint_color_a.y':green,'tint_color_a.z':blue,
        'tint_color_b.x':red,'tint_color_b.y':green,'tint_color_b.z':blue,
      };
      const existing=art.get(id);
      if(existing){
        for(const index of existing)file.records[index]=codec.patch(file.records[index],tint);
      }else{
        const rotation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),new Vector3(...normal));
        file.records.push(codec.patch({id:next(),type:'Inanimate',typeIndex,diff:Buffer.from([0xfd])},{
          entity_name:'editor_voxel_'+key,mesh:'Shape_Plane_Square_1',
          'orientation.x':rotation.x,'orientation.y':rotation.y,'orientation.z':rotation.z,'orientation.w':rotation.w,
          ...tint
        }));
      }
      let colors=faces.get(key);
      if(!colors){colors={};faces.set(key,colors);}
      colors[face]=color;
      transfers.push({cell,face,color});
    });
  }
  file.terrainColors=faces;
  file.terrainPaint=transfers;
}
