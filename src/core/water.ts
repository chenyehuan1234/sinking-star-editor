import type{EntityFile,EntityRecord}from'./entities';import{parseEntities}from'./entities';import type{PropertyCodec}from'./properties';import type{GamePackage}from'./package';import type{WaterCreateOp,WaterPaintOp,WaterResizeOp,WaterView}from'../shared';import{waterValue,waterIndex}from'../water-edit';
export const WATER_TEMPLATE='skipping_near_beams_v2';
export function validateWaterOp(op:WaterCreateOp|WaterPaintOp|WaterResizeOp){
 if(!Number.isInteger(op.id)||op.id<1||op.id>0xffffffff)throw Error('水域 ID 无效');
 if(op.kind==='water'){if(!['flow','still','water','hole'].includes(op.mode)||!Number.isInteger(op.direction)||op.direction<0||op.direction>4||op.mode==='flow'&&!op.direction||!Array.isArray(op.cells)||!op.cells.length||op.cells.length>4096||op.cells.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isInteger(n)||Math.abs(n)>10000)))throw Error('水流方向或笔画数据无效（最多 4096 格）');}
 else if(!Number.isInteger(op.width)||!Number.isInteger(op.height)||op.width<1||op.height<1||op.width>128||op.height>128||op.width*op.height>4096||!Array.isArray(op.position)||op.position.length!==3||op.position.some(n=>!Number.isInteger(n)||Math.abs(n)>10000))throw Error('水域尺寸必须为正整数，最多 4096 格；位置和高度必须为整数');
}
// Build 26249670: Ocean_Map grid coordinates are local to Entity.position/orientation.
// The native mesh ignores grid.corner.z. Its Z is position.z - sink, with negative
// (including the omitted default -1) sink selecting the native 0.1 inset.
export function waterLayout(c:PropertyCodec,r:EntityRecord){
 const position=['x','y','z'].map(a=>Number(c.get(r,'position.'+a))) as [number,number,number];
 const corner=['x','y'].map(a=>Number(c.get(r,'grid.corner.'+a))),width=Number(c.get(r,'grid.squares_x')),height=Number(c.get(r,'grid.squares_y'));
 const q=['x','y','z','w'].map(a=>Number(c.get(r,'orientation.'+a,a==='w'?1:0))),scale=['x','y','z'].map(a=>Number(c.get(r,'scale.'+a,1)));
 const co=Math.round(1-2*q[2]*q[2]),si=Math.round(2*q[2]*q[3]);
 if([...position,...corner,...q,...scale].some(n=>!Number.isFinite(n))||Math.abs(q[0])+Math.abs(q[1])>1e-5||Math.abs(1-2*q[2]*q[2]-co)>1e-5||Math.abs(2*q[2]*q[3]-si)>1e-5||co*co+si*si!==1||scale.some(n=>Math.abs(n-1)>1e-5))throw Error('该水域包含非整数方向或缩放，原始数据已保留，暂不能逐格编辑');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<0||height<0||width*height>1000000)throw Error('原生水域范围无效或过大');
 const at=(i:number):[number,number]=>{const x=corner[0]+i%width,y=corner[1]+Math.floor(i/width);return[position[0]+co*x-si*y,position[1]+si*x+co*y];};
 const points=width&&height?[at(0),at(width-1),at((height-1)*width),at(width*height-1)]:[[position[0],position[1]]];
 const x=Math.min(...points.map(v=>v[0])),y=Math.min(...points.map(v=>v[1])),worldWidth=co?width:height,worldHeight=co?height:width;
 const index=(x:number,y:number)=>{const dx=x-position[0],dy=y-position[1],lx=co*dx+si*dy-corner[0],ly=-si*dx+co*dy-corner[1],ix=Math.round(lx),iy=Math.round(ly);return Math.abs(lx-ix)<1e-5&&Math.abs(ly-iy)<1e-5&&ix>=0&&iy>=0&&ix<width&&iy<height?ix+iy*width:-1;};
 const rawSink=Number(c.get(r,'sink',-1)),sink=rawSink<0?.1:rawSink;
 if(!Number.isFinite(sink))throw Error('原生水位偏移无效');
 return{position,corner,width,height,co,si,at,index,x,y,worldWidth,worldHeight,gridZ:position[2],sink,z:position[2]-sink};
}
export function nativeWaterCells(c:PropertyCodec,f:EntityFile,r:EntityRecord):number[]{
 const l=waterLayout(c,r),raw=c.get(r,'ocean_values',[])as number[],count=l.width*l.height;if(!count)return[];
 if(!c.get(r,'detect_holes',false)){if(raw.length!==count)throw Error('水域格子数量与尺寸不一致');return [...raw];}
 // Native mesh rebuild first sets wet, then clears only wet on explicitly linked holes.
 const cells=raw.length===count?raw.map(v=>v|1):Array(count).fill(1);
 for(const hole of f.records.filter(h=>h.type==='Wall_Set'&&Number(c.get(h,'kind'))===1&&Number(c.get(h,'ocean_hole_id'))===r.id)){
  const size=['x','y','z'].map(a=>Number(c.get(hole,'wall_data.dimensions.'+a))),origin=['x','y','z'].map(a=>Number(c.get(hole,'wall_data.corner.'+a))),p=['x','y','z'].map(a=>Number(c.get(hole,'position.'+a))),q=['x','y','z','w'].map(a=>Number(c.get(hole,'orientation.'+a,a==='w'?1:0))),bits=(c.get(hole,'wall_data.bits.slots',[])as string[]).map(BigInt);
  if(size.some(n=>!Number.isInteger(n)||n<0)||size.reduce((a,b)=>a*b,1)>1000000)throw Error('水面孔洞范围无效');
  for(let i=0;i<size[0]*size[1]*size[2];i++)if(((bits[i>>6]??0n)&(1n<<BigInt(i%64)))!==0n){
   const x=origin[0]+i%size[0],y=origin[1]+Math.floor(i/size[0])%size[1],z=origin[2]+Math.floor(i/(size[0]*size[1])),tx=2*(q[1]*z-q[2]*y),ty=2*(q[2]*x-q[0]*z),tz=2*(q[0]*y-q[1]*x);
   const wx=p[0]+x+q[3]*tx+q[1]*tz-q[2]*ty,wy=p[1]+y+q[3]*ty+q[2]*tx-q[0]*tz,index=l.index(Math.round(wx),Math.round(wy));if(index>=0)cells[index]&=~1;
  }
 }
 return cells;
}
export function waterView(c:PropertyCodec,f:EntityFile,r:EntityRecord):WaterView {
 try{const l=waterLayout(c,r),raw=nativeWaterCells(c,f,r),cells=Array(raw.length).fill(0);raw.forEach((v,i)=>{const[x,y]=l.at(i);cells[Math.round(y-l.y)*l.worldWidth+Math.round(x-l.x)]=v;});return{id:r.id,x:l.x,y:l.y,z:l.z,gridZ:l.gridZ,width:l.worldWidth,height:l.worldHeight,cells,kind:Number(c.get(r,'kind')),detectHoles:Boolean(c.get(r,'detect_holes')),name:String(c.get(r,'entity_name',''))};}
 catch(e){return{id:r.id,x:Number(c.get(r,'position.x')),y:Number(c.get(r,'position.y')),z:Number(c.get(r,'position.z')),gridZ:Number(c.get(r,'position.z')),width:0,height:0,cells:[],error:String(e),kind:Number(c.get(r,'kind')),name:String(c.get(r,'entity_name',''))};}
}
export function applyWater(pkg:GamePackage,c:PropertyCodec,f:EntityFile,op:WaterCreateOp|WaterPaintOp|WaterResizeOp){validateWaterOp(op);
 if(op.kind==='waterCreate'){
  if(f.records.some(r=>r.id===op.id))throw Error('新水域 ID 冲突');const source=parseEntities(pkg.get('data-common/'+WATER_TEMPLATE+'.entities')).records.find(r=>r.type==='Ocean_Map'&&Number(c.get(r,'kind'))===0);if(!source)throw Error('当前原游戏版本缺少基础水域');const typeIndex=f.types.indexOf('Ocean_Map');if(typeIndex<0)throw Error('当前场景缺少水域类型');let r={...source,id:op.id,typeIndex};const clear:Record<string,number|string>={entity_name:'自定义水域',group_id:0};for(const field of c.parse(r).fields)if(field.schema.pid)clear[field.schema.name]=0;r=c.patch(r,clear);const[x,y,z]=op.position;
  f.records.push(c.patch(r,{'position.x':x,'position.y':y,'position.z':z,'visual_position.x':x,'visual_position.y':y,'visual_position.z':z,'orientation.x':0,'orientation.y':0,'orientation.z':0,'orientation.w':1,'scale.x':1,'scale.y':1,'scale.z':1,'grid.corner.x':0,'grid.corner.y':0,'grid.corner.z':0,'grid.squares_x':op.width,'grid.squares_y':op.height,'grid.num_squares':op.width*op.height,'grid.wrapping':false,kind:0,sink:.1,detect_holes:false,ocean_values:Array(op.width*op.height).fill(1)}));return;
 }
 const index=f.records.findIndex(r=>r.id===op.id),r=f.records[index];if(!r||r.type!=='Ocean_Map'||!c.parse(r).complete)throw Error('目标水域不存在或不能解析');const view=waterView(c,f,r);if(view.error)throw Error(view.error);const l=waterLayout(c,r);
 if(op.kind==='water'){
  if(view.kind!==0&&op.mode==='flow')throw Error('仅阻挡玩家的水域不支持绘制水流，请先改为普通水域');if(op.cells.some(([x,y])=>l.index(x,y)<0))throw Error('水流笔画超出选中水域，请先扩大水域');const cells=nativeWaterCells(c,f,r);for(const[x,y]of op.cells){const i=l.index(x,y);cells[i]=waterValue(cells[i],op.mode,op.direction);}f.records[index]=c.patch(r,{detect_holes:false,ocean_values:cells});
 }else{
  const[x,y,z]=op.position,worldCells=Array.from({length:op.width*op.height},(_,i)=>{const old=waterIndex(view,x+i%op.width,y+Math.floor(i/op.width));return old<0?1:view.cells[old];}),corners=[[0,0],[op.width-1,0],[0,op.height-1],[op.width-1,op.height-1]].map(([dx,dy])=>[l.co*dx+l.si*dy,-l.si*dx+l.co*dy]);
  let out=c.patch(r,{'position.x':x,'position.y':y,'position.z':z,'visual_position.x':Number(c.get(r,'visual_position.x'))+x-l.position[0],'visual_position.y':Number(c.get(r,'visual_position.y'))+y-l.position[1],'visual_position.z':Number(c.get(r,'visual_position.z'))+z-l.position[2],'grid.corner.x':Math.min(...corners.map(p=>p[0])),'grid.corner.y':Math.min(...corners.map(p=>p[1])),'grid.squares_x':l.co?op.width:op.height,'grid.squares_y':l.co?op.height:op.width,'grid.num_squares':op.width*op.height,detect_holes:false});
  const next=waterLayout(c,out),cells=Array.from({length:worldCells.length},(_,i)=>{const[wx,wy]=next.at(i);return worldCells[Math.round(wy-y)*op.width+Math.round(wx-x)];});out=c.patch(out,{ocean_values:cells});f.records[index]=out;
 }
}
