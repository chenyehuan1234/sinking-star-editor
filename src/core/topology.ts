import type{TopologyConfig,NativeTopologyView}from'../shared';
import type{EntityFile}from'./entities';
import type{PropertyCodec}from'./properties';

export function validateTopology(value:TopologyConfig|undefined){
 if(value===undefined)return;
 if(!value||typeof value.wrapping!=='boolean'||typeof value.forceWrappingOverride!=='boolean'||!Number.isInteger(value.wrappingOverride)||value.wrappingOverride<0||value.wrappingOverride>15)throw Error('原生循环配置无效');
 if(!Array.isArray(value.corner)||value.corner.length!==3||!value.corner.every(n=>Number.isInteger(n)&&Math.abs(n)<=10000))throw Error('逻辑边界起点必须是整数格');
 if(!Array.isArray(value.size)||value.size.length!==3||!value.size.every((n,i)=>Number.isInteger(n)&&n>=1&&n<=(i===2?128:512))||value.size.reduce((a,b)=>a*b,1)>1_000_000)throw Error('逻辑边界尺寸无效，单关最多 100 万个逻辑格');
}
export function topologyView(c:PropertyCodec,file:EntityFile):NativeTopologyView|undefined{
 const r=file.records.find(r=>r.type==='Settings');if(!r)return;
 return{corner:['x','y','z'].map(a=>Number(c.get(r,'grid.corner.'+a)))as TopologyConfig['corner'],size:[Number(c.get(r,'grid.squares_x',1)),Number(c.get(r,'grid.squares_y',1)),Number(c.get(r,'squares_z',1))],wrapping:Boolean(c.get(r,'grid.wrapping',false)),wrappingOverride:Number(c.get(r,'wrapping_override',0)),forceWrappingOverride:Boolean(c.get(r,'force_wrapping_override_despite_per_screen',false)),perScreen:Boolean(c.get(r,'per_screen_camera',false)),maskCount:file.records.filter(r=>r.type==='Wrapping_Mask').length};
}
export function applyTopology(c:PropertyCodec,file:EntityFile,value:TopologyConfig|undefined){
 validateTopology(value);if(!value)return;
 const r=file.records.find(r=>r.type==='Settings');if(!r)throw Error('关卡缺少原生 Settings');
 const values:Record<string,number|boolean>={'grid.wrapping':value.wrapping,wrapping_override:value.wrappingOverride,force_wrapping_override_despite_per_screen:value.forceWrappingOverride,'grid.squares_x':value.size[0],'grid.squares_y':value.size[1],'grid.num_squares':value.size[0]*value.size[1],squares_z:value.size[2],lock_grid:true};
 value.corner.forEach((n,i)=>values['grid.corner.'+'xyz'[i]]=n);
 file.records[file.records.indexOf(r)]=c.patch(r,values);
}
