// Retail v33 campaign status. Original campaigns are only read; generated test campaigns own their files.
const APOLLO_EPOCH=(-630480n<<64n)+0xae1758526cfc8000n;
export function apolloNow(){const filetime=(BigInt(Date.now())+11644473600000n)*10000n;return APOLLO_EPOCH+filetime*100000000n;}
function str16(s:string){const b=Buffer.from(s,'utf8');if(b.length>65535)throw new Error('存档字符串过长');const h=Buffer.alloc(2);h.writeUInt16LE(b.length);return Buffer.concat([h,b]);}
export function readCampaign(b:Buffer){
  if(b.length<123||b.readUInt32LE()!==33||b.readUInt32LE(4)!==0)throw new Error('仅支持正式版 v33 战役状态');
  let p=119;const read=()=>{const n=b.readUInt16LE(p);p+=2;if(p+n>b.length)throw new Error('战役状态越界');const s=b.toString('utf8',p,p+n);p+=n;return s;};
  const current=read(),menu=read();const count=b.readUInt32LE(p);p+=4;if(count>100000)throw new Error('战役条目过多');const levels:{name:string;flags:number}[]=[];
  for(let i=0;i<count;i++){const name=read();levels.push({name,flags:b[p++]});}
  const time=b.readBigUInt64LE(8)+(b.readBigInt64LE(16)<<64n);
  return{current,menu,levels,time,prefix:Buffer.from(b.subarray(0,119)),tail:Buffer.from(b.subarray(p))};
}
export function writeCampaign(b:Buffer,update:{current?:string;menu?:string;time?:bigint}):Buffer{
  const c=readCampaign(b),prefix=Buffer.from(c.prefix);const time=update.time??c.time;prefix.writeBigUInt64LE(BigInt.asUintN(64,time),8);prefix.writeBigInt64LE(BigInt.asIntN(64,time>>64n),16);
  const n=Buffer.alloc(4);n.writeUInt32LE(c.levels.length);
  return Buffer.concat([prefix,str16(update.current??c.current),str16(update.menu??c.menu),n,...c.levels.flatMap(l=>[str16(l.name),Buffer.from([l.flags])]),c.tail]);
}
export function newCampaign(current='overworld'):Buffer{
  const prefix=Buffer.alloc(119);prefix.writeUInt32LE(33);const time=apolloNow();prefix.writeBigUInt64LE(BigInt.asUintN(64,time),8);prefix.writeBigInt64LE(BigInt.asIntN(64,time>>64n),16);prefix.writeBigUInt64LE(1n,41);prefix[118]=1;
  return Buffer.concat([prefix,str16(current),str16('menu_under_mirrors_rivers_a'),Buffer.alloc(16)]);
}
