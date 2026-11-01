import type{EntityFile,EntityRecord}from'./entities';
import type{PropertyCodec}from'./properties';
import type{ControlOp}from'../shared';

/** Control keys are identities, even when the original anchor no longer exists. */
export function copiedControlValues(c:PropertyCodec,records:EntityRecord[],ids:Map<number,number>,independent:boolean){
 const field=(r:EntityRecord)=>r.type==='Guy'?'turn_order_id':r.type==='Rock'?'transmute_stashed_turn_order_id':undefined;
 const groups=new Map<number,EntityRecord[]>();
 for(const r of records){const name=field(r);if(!name)continue;const key=Number(c.get(r,name,0))||(r.type==='Guy'?r.id:0);if(!key)continue;const list=groups.get(key)??[];list.push(r);groups.set(key,list);}
 const values=new Map<number,Record<string,number>>();
 for(const[key,members]of groups){const target=ids.get(key)??(independent?ids.get(members[0].id)!:key);for(const r of members)values.set(r.id,{[field(r)!]:target});}
 return values;
}

/** Native selection is keyed by Guy.turn_order_id, falling back to its own PID. */
export function applyCharacterControl(c:PropertyCodec,file:EntityFile,op:ControlOp){
 const guys=file.records.filter(r=>r.type==='Guy'),byId=new Map(guys.map(r=>[r.id,r])),selected=new Set(op.ids);
 if(!selected.size||selected.size!==op.ids.length||selected.size>2000||op.ids.some(id=>!byId.has(id)))throw Error('同步控制只能选择本关角色');
 const target=op.targetId===undefined?undefined:byId.get(op.targetId);if(op.targetId!==undefined&&!target)throw Error('同步控制目标必须是本关角色');
 const key=(id:number)=>Number(c.get(byId.get(id)!,'turn_order_id',0))||id;
 const destination=target?key(target.id):undefined;
 const groups=new Map<number,number[]>();for(const g of guys){const k=key(g.id),ids=groups.get(k)??[];ids.push(g.id);groups.set(k,ids);}
 for(const r of file.records.filter(r=>r.type==='Rock')){const k=Number(c.get(r,'transmute_stashed_turn_order_id',0));if(k){const ids=groups.get(k)??[];ids.push(r.id);groups.set(k,ids);}}
 const changes=new Map<number,number>(),reanchors=new Map<number,number>();
 // Detaching a group's anchor must leave its unselected members together.
 for(const [old,ids]of groups){if(!selected.has(old)||destination===old)continue;const remaining=ids.filter(id=>!selected.has(id));if(!remaining.length)continue;const next=remaining.find(id=>!groups.has(id));if(next===undefined)throw Error('原生控制关系含交叉锚点，请先选择整组角色后修改');reanchors.set(old,next);for(const id of remaining)if(byId.has(id))changes.set(id,next);}
 for(const id of selected)changes.set(id,destination??id);
 file.records=file.records.map(r=>{if(changes.has(r.id))return c.patch(r,{turn_order_id:changes.get(r.id)!});if(r.type==='Rock'){const old=Number(c.get(r,'transmute_stashed_turn_order_id',0));if(reanchors.has(old))return c.patch(r,{transmute_stashed_turn_order_id:reanchors.get(old)!});}return r;});
}
