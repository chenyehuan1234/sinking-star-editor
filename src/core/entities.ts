import { checkedU64 } from './package';

export interface EntityRecord { id: number; typeIndex: number; type: string; diff: Buffer }
export interface EntityFile { prefix: Buffer; types: string[]; records: EntityRecord[];analysisWarnings?:{entityId:number;field:string;message:string}[] }
export interface Field { id: number; start: number; value: number; end: number; kind: 'float'|'string'|'opaque' }
export const EDITABLE = new Set(['Mirror','Rock','Guy','Door']);

export function parseEntities(b: Buffer): EntityFile {
  if (b.length < 26 || b.toString('ascii',0,4) !== 'enty' || b.readUInt16LE(4) !== 7 || checkedU64(b,6) !== 25) throw new Error('不支持的实体文件版本');
  const n = checkedU64(b,14);
  if (n > 4096) throw new Error('实体类型表异常');
  let p = 22; const types: string[] = [];
  for(let i=0;i<n;i++) {
    const len=checkedU64(b,p); p+=8;
    if (len > 1024 || p+len+8>b.length) throw new Error('实体类型名称越界');
    types.push(b.toString('utf8',p,p+len)); p+=len+8;
  }
  const prefix=Buffer.from(b.subarray(0,p)), count=b.readUInt32LE(p); p+=4;
  if(count>1_000_000) throw new Error('实体数量异常');
  const records: EntityRecord[] = [], ids=new Set<number>();
  for(let i=0;i<count;i++) {
    const id=b.readUInt32LE(p),typeIndex=b.readUInt16LE(p+4),size=b.readUInt32LE(p+6);p+=10;
    if(ids.has(id)||typeIndex>=types.length||p+size>b.length) throw new Error('重复 ID、无效类型或实体越界');
    ids.add(id);records.push({id,typeIndex,type:types[typeIndex],diff:Buffer.from(b.subarray(p,p+size))});p+=size;
  }
  if(p!==b.length) throw new Error('实体尾部存在未识别数据');
  return {prefix,types,records};
}
export function writeEntities(file: EntityFile): Buffer {
  const count=Buffer.alloc(4); count.writeUInt32LE(file.records.length);
  const parts=[file.prefix,count];
  for(const r of file.records) {
    const h=Buffer.alloc(10);h.writeUInt32LE(r.id);h.writeUInt16LE(r.typeIndex,4);h.writeUInt32LE(r.diff.length,6);parts.push(h,r.diff);
  }
  const result=Buffer.concat(parts);parseEntities(result);return result;
}

// Walk only known serialized field shapes. Never split on 0xFD: it also occurs inside values.
// Unknown fields terminate the walk, making that record read-only for edits needing later fields.
export function baseFields(diff: Buffer): { fields: Field[]; baseComplete: boolean } {
  const fields: Field[]=[]; let p=0,last=-1;
  while(p<diff.length) {
    if(p>0) { if(diff[p]!==0xfd) return {fields,baseComplete:false};p++; }
    if(p===diff.length) return {fields,baseComplete:true};
    if(p+2>diff.length) return {fields,baseComplete:false};
    const start=p,id=diff.readUInt16LE(p);p+=2;
    if(id>=0x1000) return {fields,baseComplete:true};
    if(id<=last) return {fields,baseComplete:false};last=id;
    let end:number,kind:Field['kind']='opaque',value=p;
    if ((id<=9)||(id>=0x0d&&id<=0x18)||(id>=0x21&&id<=0x23)) {end=p+8;value=p+4;kind='float';}
    else if(id===0x0a) {end=p+16;}
    else if(id===0x1f) {
      if(p+16>diff.length) return {fields,baseComplete:false};
      const n=checkedU64(diff,p+8);end=p+16+n;value=p+16;kind='string';
    } else if(id===0x20) {
      if(p+16>diff.length) return {fields,baseComplete:false};
      const defaults=checkedU64(diff,p);if(defaults!==0) return {fields,baseComplete:false};
      end=p+16+checkedU64(diff,p+8)*8;
    } else return {fields,baseComplete:false};
    if(end>diff.length || (end<diff.length&&diff[end]!==0xfd)) return {fields,baseComplete:false};
    fields.push({id,start,value,end,kind});p=end;
  }
  return {fields,baseComplete:false};
}
export function position(r: EntityRecord): [number,number,number] | null {
  const {fields}=baseFields(r.diff);
  const values=[0,1,2].map(id=>{const f=fields.find(f=>f.id===id);return f?r.diff.readFloatLE(f.value):0;});
  return values.every(Number.isFinite)? values as [number,number,number] : null;
}
export function canEdit(r: EntityRecord): boolean {return EDITABLE.has(r.type)&&baseFields(r.diff).baseComplete;}
export function patchTransform(r: EntityRecord, pos?: [number,number,number], yaw?: number): EntityRecord {
  if(!canEdit(r)) throw new Error(`${r.type} #${r.id} 的属性尚未验证，仅可读取`);
  if(pos&&!pos.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000)) throw new Error('坐标必须为有限数值，范围 ±100000');
  if(yaw!==undefined&&(!Number.isFinite(yaw)||Math.abs(yaw)>36000)) throw new Error('朝向无效');
  const {fields}=baseFields(r.diff), changes=new Map<number,number>();
  if(pos) for(let axis=0;axis<3;axis++){changes.set(axis,pos[axis]);changes.set(0x21+axis,pos[axis]);}
  if(yaw!==undefined){const rad=yaw*Math.PI/360;[0,0,Math.sin(rad),Math.cos(rad)].forEach((v,i)=>changes.set(6+i,v));}
  const d=Buffer.from(r.diff),insert: Buffer[]=[];
  for(const [id,v] of changes) {
    const f=fields.find(f=>f.id===id);
    if(f) d.writeFloatLE(v,f.value);
    else if(v!==([9].includes(id)?1:0)) {
      const b=Buffer.alloc(11);b[0]=0xfd;b.writeUInt16LE(id,1);b.writeFloatLE(id===9?1:0,3);b.writeFloatLE(v,7);insert.push(b);
    }
  }
  // Reassemble base members in numeric order, retaining every unknown derived byte.
  const parts:{id:number;body:Buffer}[]=fields.map(f=>({id:f.id,body:d.subarray(f.start,f.end)}));
  for(const b of insert)parts.push({id:b.readUInt16LE(1),body:b.subarray(1)});
  parts.sort((a,b)=>a.id-b.id);
  const tailStart=fields.length?fields[fields.length-1].end:0;
  const tail=d.subarray(tailStart);
  const output=Buffer.concat([...parts.flatMap((f,i)=>i?[Buffer.from([0xfd]),f.body]:[f.body]),tail]);
  const result={...r,diff:output};
  if(!baseFields(result.diff).baseComplete)throw new Error('变换写回校验失败');
  return result;
}
export function yawOf(r: EntityRecord): number {
  const f=baseFields(r.diff).fields;
  const z=f.find(x=>x.id===8),w=f.find(x=>x.id===9);
  return Math.round(2*Math.atan2(z?r.diff.readFloatLE(z.value):0,w?r.diff.readFloatLE(w.value):1)*180/Math.PI*100)/100;
}
