import type{WaterView}from'./shared';
export type WaterDirection=0|1|2|3|4;
export type WaterPaintMode='flow'|'still'|'water'|'hole';
export interface WaterBrush {id:number;mode:WaterPaintMode;direction:WaterDirection;shape:'stroke'|'rectangle';showArrows:boolean}
export const waterDirections=[{id:0,label:'静水',arrow:'·',dx:0,dy:0},{id:1,label:'东 · X+',arrow:'→',dx:1,dy:0},{id:2,label:'北 · Y+',arrow:'↑',dx:0,dy:1},{id:3,label:'西 · X−',arrow:'←',dx:-1,dy:0},{id:4,label:'南 · Y−',arrow:'↓',dx:0,dy:-1}]as const;
// Native Ocean_Map getter (Build 26249670): wet = byte & 1;
// direction = (byte >> 2) & 7. Other bits belong to native rules: preserve them.
export const waterWet=(value:number)=>(value&1)!==0;
export const waterDirection=(value:number)=>(value>>>2)&7;
export function waterValue(value:number,mode:WaterPaintMode,direction:WaterDirection){
 if(mode==='hole')return 0;if(mode==='water')return waterWet(value)?value:1;
 if(!waterWet(value))return value;
 return (value&~28)|((mode==='still'?0:direction)<<2);
}
export function rotatedWaterValue(value:number,yaw:number){const d=waterDirection(value);return waterWet(value)&&d>=1&&d<=4?(value&~28)|(((d-1+((yaw/90)%4+4)%4)%4+1)<<2):value;}
export function waterIndex(w:Pick<WaterView,'x'|'y'|'width'|'height'>,x:number,y:number){const dx=x-w.x,dy=y-w.y;return Number.isInteger(dx)&&Number.isInteger(dy)&&dx>=0&&dy>=0&&dx<w.width&&dy<w.height?dx+dy*w.width:-1;}
export function waterEditCells(w:WaterView,points:readonly (readonly[number,number])[],mode:WaterPaintMode,direction:WaterDirection){return [...new Map(points.map(([x,y])=>[x+','+y,[x,y]as[number,number]])).values()].filter(([x,y])=>{const i=waterIndex(w,x,y);return i>=0&&waterValue(w.cells[i]??0,mode,direction)!==(w.cells[i]??0);});}
/** Integer interpolated path: fast pointer moves leave no gaps in a stroke. */
export function waterLine(a:readonly[number,number],b:readonly[number,number]):[number,number][]{const result:[number,number][]=[];let[x,y]=a;const dx=Math.abs(b[0]-x),dy=Math.abs(b[1]-y),sx=x<b[0]?1:-1,sy=y<b[1]?1:-1;let error=dx-dy;while(true){result.push([x,y]);if(x===b[0]&&y===b[1])return result;if(result.length>4096)throw Error('一笔水域操作最多 4096 格');const e=error*2;if(e>-dy){error-=dy;x+=sx;}if(e<dx){error+=dx;y+=sy;}}}
export function waterRectangle(a:readonly[number,number],b:readonly[number,number]):[number,number][]{const minX=Math.min(a[0],b[0]),minY=Math.min(a[1],b[1]),width=Math.abs(a[0]-b[0])+1,height=Math.abs(a[1]-b[1])+1;if(width*height>4096)throw Error('一次水域矩形最多 4096 格');return Array.from({length:width*height},(_,i)=>[minX+i%width,minY+Math.floor(i/width)]);}
