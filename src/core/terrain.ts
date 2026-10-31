import {parseEntities,type EntityFile,type EntityRecord}from'./entities';import{PropertyCodec}from'./properties';import{GamePackage}from'./package';import type{TerrainOp}from'../shared';
export function applyTerrain(pkg:GamePackage,c:PropertyCodec,f:EntityFile,op:TerrainOp){
  const cells=new Map(op.cells.map(p=>[`${p.x},${p.y},${p.z}`,p]));
  for(let j=0;j<f.records.length;j++){const r=f.records[j];if(r.type!=='Wall_Set'||!c.parse(r).complete)continue;
    const get=(n:string,d=0)=>Number(c.get(r,n,d)),sx=get('wall_data.dimensions.x'),sy=get('wall_data.dimensions.y'),sz=get('wall_data.dimensions.z');if(sx*sy*sz>1_000_000)throw new Error('地形体积过大');
    const origin=['x','y','z'].map(a=>get('position.'+a)+get('wall_data.corner.'+a)),slots=(c.get(r,'wall_data.bits.slots',[])as string[]).map(BigInt);let changed=false;
    for(const p of cells.values()){const ix=p.x-origin[0],iy=p.y-origin[1],iz=p.z-origin[2];if(![ix,iy,iz].every(Number.isInteger)||ix<0||iy<0||iz<0||ix>=sx||iy>=sy||iz>=sz)continue;const i=ix+iy*sx+iz*sx*sy;if(slots[i>>6]!==undefined&&(slots[i>>6]&(1n<<BigInt(i%64)))!==0n){slots[i>>6]&=~(1n<<BigInt(i%64));changed=true;}}
    if(changed)f.records[j]=c.patch(r,{'wall_data.bits.slots':slots.map(String)});
  }
  f.records=f.records.filter(r=>{const name=String(c.get(r,'entity_name',''));return!name.startsWith('editor_voxel_')||!cells.has(name.slice('editor_voxel_'.length));});
  const proto=parseEntities(pkg.get('data-common/3d_intro_heroes.entities')).records.find(r=>r.type==='Wall_Set'&&Number(c.get(r,'wall_data.bits.count'))===1)!;
  const ids=new Set(f.records.map(r=>r.id));let serial=899*0x100000+1;const next=()=>{while(ids.has(serial))serial++;ids.add(serial);return serial++;};
  const bare=(type:string):EntityRecord=>({id:next(),type,typeIndex:f.types.indexOf(type),diff:Buffer.from([0xfd])});
  for(const p of cells.values()){if(!p.solid)continue;const name=`editor_voxel_${p.x},${p.y},${p.z}`;
    const wall=c.patch(proto,{entity_name:name,group_id:0,'position.x':p.x,'position.y':p.y,'position.z':p.z,'visual_position.x':p.x,'visual_position.y':p.y,'visual_position.z':p.z,'wall_data.corner.x':0,'wall_data.corner.y':0,'wall_data.corner.z':0,'wall_data.dimensions.x':1,'wall_data.dimensions.y':1,'wall_data.dimensions.z':1,'wall_data.bits.slots':['1'],'wall_data.bits.count':1});f.records.push({...wall,id:next(),typeIndex:f.types.indexOf('Wall_Set')});
    const common={entity_name:name,mesh:'Shape_Plane_Square_1',materials:['GameFloor_Cobblestone_B_Blend_A-child~3d_intro_heroes'],'tint_color_a.x':.6,'tint_color_a.y':.65,'tint_color_a.z':.58};
    f.records.push(c.patch(bare('Inanimate'),{...common,'position.x':p.x,'position.y':p.y,'position.z':p.z+1}));
    for(const[dx,dy,qx,qy]of[[1,0,0,Math.SQRT1_2],[-1,0,0,-Math.SQRT1_2],[0,1,-Math.SQRT1_2,0],[0,-1,Math.SQRT1_2,0]])f.records.push(c.patch(bare('Inanimate'),{...common,'position.x':p.x+dx/2,'position.y':p.y+dy/2,'position.z':p.z+.5,'orientation.x':qx,'orientation.y':qy,'orientation.w':Math.SQRT1_2}));
  }
}
