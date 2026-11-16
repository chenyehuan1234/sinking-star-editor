import type {Vec3} from './shared';
export interface RectArea {origin:[number,number];size:[number,number]}
/** A gesture selects integer-centred cells; both end cells are included. */
export function rectangleArea(a:Vec3,b:Vec3):RectArea{const low=[0,1].map(i=>Math.min(Math.round(a[i]),Math.round(b[i])))as[number,number];return{origin:low,size:[Math.abs(Math.round(a[0])-Math.round(b[0]))+1,Math.abs(Math.round(a[1])-Math.round(b[1]))+1]};}
export function rectangleReason(area:RectArea){return area.origin.some(n=>!Number.isInteger(n)||Math.abs(n)>10000)||area.size.some(n=>!Number.isInteger(n)||n<1||n>512)?'起点须在 ±10000 格内，宽高须为 1～512 格':'';}
