import { sha256 } from './package';
export interface RefType {kind:number;size:number;name:string;va:number;offset:number}
export interface RefMember {name:string;type:RefType;flags:number;offset:number;notes:string[]}
export interface RefField {name:string;type:RefType;notes:string[]}
export class ExeReflection {
  readonly base:number;readonly sections:{rva:number;size:number;raw:number}[];readonly types=new Map<string,RefType>();readonly hash:string;
  constructor(readonly buffer:Buffer){
    const b=buffer,pe=b.readUInt32LE(0x3c),opt=pe+24;
    if(b.toString('ascii',pe,pe+4)!=='PE\0\0'||b.readUInt16LE(opt)!==0x20b)throw new Error('不支持的可执行文件');
    this.base=Number(b.readBigUInt64LE(opt+24));const n=b.readUInt16LE(pe+6),sec=opt+b.readUInt16LE(pe+20);
    this.sections=Array.from({length:n},(_,i)=>{const p=sec+i*40;return{rva:b.readUInt32LE(p+12),size:b.readUInt32LE(p+16),raw:b.readUInt32LE(p+20)};});
    this.hash=sha256(b);
    for(const s of this.sections)for(let p=s.raw;p<s.raw+s.size-80;p+=8){
      if(b.readUInt32LE(p)!==7)continue;
      const t=this.type(this.base+s.rva+p-s.raw);if(!t||!t.name||t.name==='?'||t.size>1000000)continue;
      const count=this.u64(p+64),members=this.offset(this.u64(p+72));if(count>1000||members<0||members+count*64>b.length)continue;
      if(this.types.has(t.name))continue;this.types.set(t.name,t);
    }
    if(!this.types.has('Entity')||!this.types.has('Wall_Set'))throw new Error('缺少可验证的游戏反射信息');
  }
  offset(va:number){const s=this.sections.find(s=>va-this.base>=s.rva&&va-this.base<s.rva+s.size);return s?s.raw+va-this.base-s.rva:-1;}
  u64(p:number){return Number(this.buffer.readBigUInt64LE(p));}
  string(count:number,ptr:number){const p=this.offset(ptr);return p>=0&&count>0&&count<2048&&p+count<=this.buffer.length?this.buffer.toString('utf8',p,p+count):'?';}
  type(va:number):RefType|null{const p=this.offset(va);if(p<0||p+32>this.buffer.length)return null;const b=this.buffer;return{kind:b.readUInt32LE(p),size:b.readUInt32LE(p+8),name:this.string(this.u64(p+16),this.u64(p+24)),va,offset:p};}
  members(type:string|RefType):RefMember[]{const t=typeof type==='string'?this.types.get(type):type;if(!t||t.kind!==7)return[];
    const count=this.u64(t.offset+64),p=this.offset(this.u64(t.offset+72));if(count>1000||p<0)throw new Error('反射成员越界');
    return Array.from({length:count},(_,i)=>{const m=p+i*64,child=this.type(this.u64(m+16));if(!child)throw new Error('反射子类型无效');const n=this.u64(m+40),a=this.offset(this.u64(m+48));if(n>1000||(n&&(a<0||a+n*16>this.buffer.length)))throw new Error('反射注解越界');const notes=Array.from({length:n},(_,j)=>this.string(this.u64(a+j*16),this.u64(a+j*16+8)));return{name:this.string(this.u64(m),this.u64(m+8)),type:child,offset:Number(this.buffer.readBigInt64LE(m+24)),flags:this.buffer.readUInt32LE(m+32),notes};});
  }
  flatten(name:string):{name:string;type:RefType}[]{
    const walk=(t:RefType,prefix:string,depth:number):{name:string;type:RefType}[]=>{
      if(depth>8||t.name==='Allocator')return[];
      if(t.kind===7)return this.members(t).filter(m=>!(m.flags&33)&&m.type.size>0&&m.name!=='entity').flatMap(m=>walk(m.type,prefix?`${prefix}.${m.name}`:m.name,depth+1));
      return[{name:prefix,type:t}];
    };
    const t=this.types.get(name);if(!t)throw new Error(`缺少 ${name} 反射类型`);return walk(t,'',0);
  }
  fields(name:string):RefField[]{
    const walk=(t:RefType,prefix:string,notes:string[],depth:number):RefField[]=>{
      if(depth>8||t.name==='Allocator')return[];
      if(t.kind===7)return this.members(t).filter(m=>!(m.flags&33)&&m.type.size>0&&m.name!=='entity').flatMap(m=>walk(m.type,prefix?`${prefix}.${m.name}`:m.name,[...notes,...m.notes],depth+1));
      return[{name:prefix,type:t,notes}];
    };
    const t=this.types.get(name);if(!t)throw new Error(`缺少 ${name} 反射类型`);return walk(t,'',[],0);
  }
  enumValues(type:RefType):{name:string;value:string}[]{
    if(type.kind!==11)return[];const n=this.u64(type.offset+40),p=this.offset(this.u64(type.offset+48)),values=this.offset(this.u64(type.offset+64));
    if(n>4096||p<0||values<0||p+n*16>this.buffer.length||values+n*8>this.buffer.length)throw new Error('枚举反射越界');
    return Array.from({length:n},(_,i)=>({name:this.string(this.u64(p+i*16),this.u64(p+i*16+8)),value:this.buffer.readBigInt64LE(values+i*8).toString()}));
  }
}
