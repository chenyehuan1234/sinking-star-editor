import type {DuplicateOp,EntityView,Vec3} from './shared';
export interface ArraySpec {counts:Vec3;spacing:Vec3;associations:'independent'|'shared'}
export function arrayOffsets(spec:ArraySpec,sourceCount:number):Vec3[]{
 if(!spec.counts.every(n=>Number.isInteger(n)&&n>=1)||!spec.spacing.every(n=>Number.isInteger(n)&&Math.abs(n)<10000))throw Error('数量须为正整数，间距须为整数');
 const count=spec.counts.reduce((a,b)=>a*b,1)-1;if(!sourceCount||count*sourceCount>2000||count<1)throw Error('阵列须新增 1～2000 个物件');
 const out:Vec3[]=[];for(let z=0;z<spec.counts[2];z++)for(let y=0;y<spec.counts[1];y++)for(let x=0;x<spec.counts[0];x++)if(x||y||z)out.push([x*spec.spacing[0],y*spec.spacing[1],z*spec.spacing[2]]);if(out.some(p=>p.some(n=>Math.abs(n)>=10000)))throw Error('阵列偏移超出坐标范围');return out;
}
export function arrayOperations(entities:EntityView[],allIds:number[],firstId:number,spec:ArraySpec):DuplicateOp[]{
 if(entities.some(e=>!e.cloneable||!e.position||['Wall_Set','Ocean_Map','Level_Entry','Group','Inanimate','Decal'].includes(e.type)||/Camera|Marker/.test(e.type)))throw Error('阵列仅支持可复制的玩法物件');
 const offsets=arrayOffsets(spec,entities.length),used=new Set(allIds);let next=firstId;
 return offsets.map(offset=>({kind:'duplicate',id:entities[0].id,offset,associations:spec.associations,copies:entities.map(e=>{if(e.position!.some((n,i)=>Math.abs(n+offset[i])>=10000))throw Error('阵列超出坐标范围');while(used.has(next))next++;if(next>0xffffffff)throw Error('物件标识已用尽');const newId=next++;used.add(newId);return{id:e.id,newId};})}));
}
