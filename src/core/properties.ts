import { ExeReflection } from './reflection';
import type { EntityRecord } from './entities';
export type PropertyValue=number|boolean|string|string[]|number[];
export interface PropertySchema {id:number;name:string;kind:'float'|'int'|'bool'|'string'|'strings'|'array'|'fixed';size:number;pid?:boolean;pidArray?:boolean;signed?:boolean;count?:number;defaultRaw?:Buffer}
export interface ParsedProperty {schema:PropertySchema;start:number;end:number;defaultRaw:Buffer;value:PropertyValue}
export class PropertyCodec {
  private cache=new Map<string,PropertySchema[]>();
  private parsed=new WeakMap<Buffer,Map<string,ReturnType<PropertyCodec["parseUncached"]>>>();
  constructor(readonly reflection:ExeReflection){}
  schema(type:string):PropertySchema[]{
    const cached=this.cache.get(type);if(cached)return cached;
    const scalar=(id:number,name:string,kind:PropertySchema['kind'],size:number,extra:Partial<PropertySchema>={}):PropertySchema=>({id,name,kind,size,...extra});
    const base:PropertySchema[]=[];
    for(const [i,field]of this.reflection.flatten('Undoable_Entity_Data').entries()){
      if(i>0x24)break;
      const t=field.type;let kind:PropertySchema['kind']=t.kind===1?'float':t.kind===2?'bool':t.kind===3||i===0x1f?'string':t.kind===8?'strings':'int';
      base.push(scalar(i,field.name,kind,t.size,{pid:t.name==='Pid',signed:t.kind===0}));
    }
    const own=this.reflection.flatten(type).map((f,i)=>{
      const t=f.type,resource=t.kind===4&&/mesh|bitmap|texture|image/.test(f.name),kind:PropertySchema['kind']=t.kind===1?'float':t.kind===2?'bool':t.kind===3||resource?'string':t.kind===8?(t.size===12?'fixed':'array'):'int';
      let size=t.size;if(kind==='array')size=f.name==='wall_data.bits.slots'?8:f.name==='ocean_values'?1:f.name==='affected_entities'?4:0;
      return scalar(0x1000+i,f.name,kind,size,{pid:t.name==='Pid',pidArray:f.name==='affected_entities',signed:t.kind===0,count:kind==='fixed'?3:undefined});
    });
    const result=[...base,...own];this.cache.set(type,result);return result;
  }
  parse(r:EntityRecord):{fields:ParsedProperty[];complete:boolean;tail:number}{
    let types=this.parsed.get(r.diff);if(!types)this.parsed.set(r.diff,types=new Map());
    let value=types.get(r.type);if(!value){value=this.parseUncached(r);types.set(r.type,value);}return value;
  }
  parseTransient(r:EntityRecord){return this.parseUncached(r);}
  private parseUncached(r:EntityRecord):{fields:ParsedProperty[];complete:boolean;tail:number}{
    const b=r.diff,schemas=this.schema(r.type),fields:ParsedProperty[]=[];let p=0,last=-1;
    if(b.length===1&&b[0]===0xfd)return{fields,complete:true,tail:0};
    try{while(p<b.length){const boundary=p;if(p>0){if(b[p++]!==0xfd)throw Error('member boundary');if(p===b.length)return{fields,complete:true,tail:boundary};}
      const start=p,id=b.readUInt16LE(p);p+=2;if(id<=last)throw Error('member order');last=id;
      const s=schemas.find(s=>s.id===id);if(!s)throw Error('unknown member');let defaultRaw:Buffer,value:PropertyValue;
      const length=()=>{const n=Number(b.readBigUInt64LE(p));p+=8;if(!Number.isSafeInteger(n)||n<0||n>1_000_000)throw Error('length');return n;};
      const scalar=(at:number):number|string|boolean=>{if(s.kind==='bool')return b[at]!==0;if(s.kind==='float')return s.size===4?b.readFloatLE(at):b.readDoubleLE(at);if(s.size===8){const n=s.signed?b.readBigInt64LE(at):b.readBigUInt64LE(at);return n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER)?n.toString():Number(n);}return s.signed?b.readIntLE(at,s.size):b.readUIntLE(at,s.size);};
      const d=p;
      if(s.kind==='string'){const n=length();p+=n;if(p>b.length)throw Error('string');defaultRaw=Buffer.from(b.subarray(d,p));const m=length();value=b.toString('utf8',p,p+m);p+=m;}
      else if(s.kind==='strings'){const strings=()=>{const n=length(),a:string[]=[];for(let i=0;i<n;i++){const m=length();a.push(b.toString('utf8',p,p+m));p+=m;}return a;};strings();defaultRaw=Buffer.from(b.subarray(d,p));value=strings();}
      else if(s.kind==='array'){if(!s.size)throw Error('unsupported array');const n=length();p+=n*s.size;defaultRaw=Buffer.from(b.subarray(d,p));const m=length();if(p+m*s.size>b.length)throw Error('array bounds');value=s.size===8?Array.from({length:m},(_,i)=>b.readBigUInt64LE(p+i*8).toString()):Array.from({length:m},(_,i)=>b.readUIntLE(p+i*s.size,s.size));p+=m*s.size;}
      else if(s.kind==='fixed'){defaultRaw=Buffer.from(b.subarray(p,p+s.size));p+=s.size;value=Array.from({length:s.count!},(_,i)=>b.readFloatLE(p+i*4));p+=s.size;}
      else{if(![1,2,4,8].includes(s.size))throw Error('unsupported scalar');defaultRaw=Buffer.from(b.subarray(p,p+s.size));p+=s.size;value=scalar(p);p+=s.size;}
      if(p>b.length||p===b.length||b[p]!==0xfd)throw Error('field bounds');
      fields.push({schema:s,start,end:p,defaultRaw,value});
    }}catch{return{fields,complete:false,tail:fields.length?fields.at(-1)!.end:0};}
    return{fields,complete:false,tail:p};
  }
  get(r:EntityRecord,name:string,fallback:PropertyValue=0):PropertyValue{return this.parse(r).fields.find(f=>f.schema.name===name)?.value??fallback;}
  patch(r:EntityRecord,values:Record<string,PropertyValue>):EntityRecord{
    const parsed=this.parse(r),schemas=this.schema(r.type),parts=parsed.fields.map(f=>({id:f.schema.id,raw:Buffer.from(r.diff.subarray(f.start,f.end))}));
    for(const[name,value]of Object.entries(values)){
      const s=schemas.find(s=>s.name===name);if(!s)throw new Error(`未知属性 ${r.type}.${name}`);
      const old=parsed.fields.find(f=>f.schema.id===s.id);
      if(!old&&!parsed.complete)throw new Error(`${r.type} 有未识别字段，不能添加 ${name}`);
      const defaultRaw=old?.defaultRaw??this.defaultRaw(s);
      const id=Buffer.alloc(2);id.writeUInt16LE(s.id);const raw=Buffer.concat([id,defaultRaw,this.encode(s,value)]);
      const index=parts.findIndex(f=>f.id===s.id);if(index<0)parts.push({id:s.id,raw});else parts[index]={id:s.id,raw};
    }
    parts.sort((a,b)=>a.id-b.id);
    const tail=parsed.complete?Buffer.from([0xfd]):r.diff.subarray(parsed.tail);
    const result={...r,diff:Buffer.concat([...parts.flatMap((p,i)=>i?[Buffer.from([0xfd]),p.raw]:[p.raw]),tail])};
    const check=this.parse(result);for(const name of Object.keys(values))if(!check.fields.some(f=>f.schema.name===name))throw new Error(`写回属性失败：${name}`);return result;
  }
  // Existing records retain their exact default bytes. New fields use a stable
  // baseline, never a default learned from whichever unrelated level was read last.
  private defaultRaw(s:PropertySchema){
    if(s.kind==='string'||s.kind==='strings'||s.kind==='array')return Buffer.alloc(8);
    const b=Buffer.alloc(s.size);if(s.kind==='float'&&(/^(scale|orientation.w|tint_color_[ab])/.test(s.name)))b.writeFloatLE(1);return b;
  }
  private encode(s:PropertySchema,value:PropertyValue):Buffer{
    if(s.kind==='string'){if(typeof value!=='string'||Buffer.byteLength(value)>4096)throw new Error('字符串属性无效');const h=Buffer.alloc(8);h.writeBigUInt64LE(BigInt(Buffer.byteLength(value)));return Buffer.concat([h,Buffer.from(value)]);}
    if(s.kind==='strings'){if(!Array.isArray(value)||value.length>256||!value.every(v=>typeof v==='string'))throw new Error('材质列表无效');const n=Buffer.alloc(8);n.writeBigUInt64LE(BigInt(value.length));return Buffer.concat([n,...value.map(v=>{const b=Buffer.from(v as string),h=Buffer.alloc(8);h.writeBigUInt64LE(BigInt(b.length));return Buffer.concat([h,b]);})]);}
    if(s.kind==='array'){if(!Array.isArray(value)||value.length>65536||![1,2,4,8].includes(s.size))throw new Error('数组属性无效');const b=Buffer.alloc(8+value.length*s.size);b.writeBigUInt64LE(BigInt(value.length));value.forEach((v,i)=>s.size===8?b.writeBigUInt64LE(BigInt(v),8+i*8):b.writeUIntLE(Number(v),8+i*s.size,s.size));return b;}
    if(s.kind==='fixed'){if(!Array.isArray(value)||value.length!==s.count)throw new Error('固定数组属性无效');const b=Buffer.alloc(s.size);value.forEach((v,i)=>b.writeFloatLE(Number(v),i*4));return b;}
    const b=Buffer.alloc(s.size);
    if(s.kind==='bool'){if(typeof value!=='boolean')throw new Error('布尔属性无效');b[0]=value?1:0;}
    else if(s.kind==='float'){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e8)throw new Error('数值属性无效');s.size===4?b.writeFloatLE(value):b.writeDoubleLE(value);}
    else{if((typeof value!=='number'&&typeof value!=='string')||(typeof value==='number'&&!Number.isSafeInteger(value)))throw new Error('整数属性无效');if(s.size===8)s.signed?b.writeBigInt64LE(BigInt(value)):b.writeBigUInt64LE(BigInt(value));else s.signed?b.writeIntLE(Number(value),0,s.size):b.writeUIntLE(Number(value),0,s.size);}
    return b;
  }
}
