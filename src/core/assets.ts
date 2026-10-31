import type{MeshAsset,TextureAsset}from'../asset-types';
export interface NativeAsset {type:number;version:number;flags:number;header:Buffer;data:Buffer}
/** Bounds-checked raw LZ4 block (the native asset stores the output size in its header). */
export function decodeLz4(input:Buffer,size:number):Buffer{
  if(!Number.isInteger(size)||size<0||size>256*1024*1024)throw new Error('资源解压大小无效');
  const out=Buffer.alloc(size);let p=0,q=0;
  const length=(initial:number)=>{let n=initial;if(initial===15){let b:number;do{if(p>=input.length)throw new Error('LZ4 长度被截断');b=input[p++];n+=b;}while(b===255);}return n;};
  while(p<input.length){const token=input[p++],literal=length(token>>>4);if(p+literal>input.length||q+literal>size)throw new Error('LZ4 字面数据越界');input.copy(out,q,p,p+literal);p+=literal;q+=literal;if(p===input.length)break;
    if(p+2>input.length)throw new Error('LZ4 匹配偏移被截断');const offset=input.readUInt16LE(p);p+=2;if(!offset||offset>q)throw new Error('LZ4 匹配偏移无效');const match=length(token&15)+4;if(q+match>size)throw new Error('LZ4 匹配越界');for(let i=0;i<match;i++)out[q+i]=out[q+i-offset];q+=match;
  }
  if(q!==size)throw new Error(`LZ4 长度不匹配：${q} / ${size}`);return out;
}
export function readNativeAsset(buffer:Buffer):NativeAsset{
  if(buffer.length<12)throw new Error('资源头被截断');const type=buffer.readUInt16LE(0),version=buffer.readUInt16LE(2),flags=buffer.readUInt16LE(4),headerSize=buffer.readUInt16LE(6),total=buffer.readUInt32LE(8);
  if(headerSize<12||headerSize>buffer.length||total<headerSize||total>256*1024*1024)throw new Error('资源头范围无效');
  const data=buffer.length===total?Buffer.from(buffer.subarray(headerSize)):decodeLz4(buffer.subarray(headerSize),total-headerSize);
  return{type,version,flags,header:Buffer.from(buffer.subarray(0,headerSize)),data};
}
export function decodeMesh(buffer:Buffer,name:string,lodRequested=1):MeshAsset{
  const a=readNativeAsset(buffer),b=a.data;if(a.type!==1||a.version!==16||b.length<56)throw new Error(`不支持的模型格式 ${a.type}/${a.version}`);
  const lodCount=b.readUInt32LE(0),n=b.readUInt32LE(4),checksum=b.readUInt32LE(8),skinned=b[14]!==0,nl=b.readUInt32LE(52);
  if(lodCount<1||lodCount>16||n>5_000_000||!n||nl>4096)throw new Error('模型顶点或 LOD 数量异常');
  const bounds=Array.from({length:6},(_,i)=>b.readFloatLE(16+i*4))as MeshAsset['bounds'];if(!bounds.every(Number.isFinite))throw new Error('模型边界无效');
  const ps=skinned?20:12,attributes=56+n*ps,colorOffset=attributes+n*20;let p=colorOffset+n*4;
  if(p>b.length)throw new Error('模型顶点流越界');
  const positions=new Float32Array(n*3),uvs=new Float32Array(n*2),colors=Uint8Array.from(b.subarray(colorOffset,p));
  for(let i=0;i<n;i++){for(let j=0;j<3;j++){const v=b.readFloatLE(56+i*ps+j*4);if(!Number.isFinite(v))throw new Error('模型坐标不是有限数值');positions[i*3+j]=v;}for(let j=0;j<2;j++){const v=b.readFloatLE(attributes+i*20+j*4);uvs[i*2+j]=Number.isFinite(v)?v:0;}}
  const lod=Math.max(0,Math.min(lodCount-1,Math.trunc(lodRequested)));let groups:MeshAsset['groups']=[],indices=new Uint32Array();
  for(let l=0;l<lodCount;l++){
    if(p+nl*12+10>b.length)throw new Error('模型三角列表越界');
    const info=Array.from({length:nl},()=>{const v={materialIndex:b.readUInt32LE(p),count:b.readUInt32LE(p+4),start:b.readUInt32LE(p+8)};p+=12;return v;});
    const count=b.readUInt32LE(p),size=b.readUInt32LE(p+4),format=b.readUInt16LE(p+8);p+=10;const stride=format===0?2:format===1?4:0;
    // The stored count is in 16-bit words, including for 32-bit index streams.
    if(!stride||count*2!==size||size%stride||p+size>b.length)throw new Error('模型索引格式或范围无效');
    if(l===lod){const used=info.reduce((v,g)=>Math.max(v,g.start+g.count),0);if(used>size/stride||info.some(g=>g.count%3!==0||g.materialIndex>=nl))throw new Error('模型材质组越界');indices=new Uint32Array(used);for(let i=0;i<used;i++){const id=stride===2?b.readUInt16LE(p+i*2):b.readUInt32LE(p+i*4);if(id>=n)throw new Error('模型索引超过顶点数量');indices[i]=id;}groups=info;}
    p+=size;
  }
  const materials:string[]=[];for(let i=0;i<nl;i++){if(p+2>b.length)throw new Error('模型材质名称被截断');const size=b.readUInt16LE(p);p+=2;if(size>4096||p+size>b.length)throw new Error('模型材质名称越界');materials.push(b.toString('utf8',p,p+size));p+=size;}
  let skin:MeshAsset['skin'];
  if(skinned){if(p+4>b.length)throw new Error('模型骨架头被截断');const count=b.readUInt32LE(p);p+=4;if(count<1||count>256)throw new Error('模型骨骼数量无效');const names:string[]=[],inverseBind=new Float32Array(count*16);for(let i=0;i<count;i++){const length=b.readUInt16LE(p);p+=2;if(length>256||p+length+64>b.length)throw new Error('模型骨架越界');names.push(b.toString('utf8',p,p+length));p+=length;for(let j=0;j<16;j++)inverseBind[i*16+j]=b.readFloatLE(p+j*4);p+=64;}const weights=new Uint8Array(n*4),boneIndices=new Uint8Array(n*4);for(let i=0;i<n;i++)for(let j=0;j<4;j++){weights[i*4+j]=b[56+i*20+12+j];boneIndices[i*4+j]=b[56+i*20+16+j];if(weights[i*4+j]&&boneIndices[i*4+j]>=count)throw new Error('顶点骨骼索引越界');}skin={weights,indices:boneIndices,names,inverseBind};}
  return{name,checksum,skinned,lod,lodCount,bounds,positions,uvs,colors,indices,groups,materials,skin};
}
const align=(n:number,a:number)=>Math.ceil(n/a)*a;
const half=(n:number)=>{const s=n&0x8000?-1:1,e=(n>>10)&31,m=n&1023;return e===0?s*Math.pow(2,-14)*m/1024:e===31?m?NaN:s*Infinity:s*Math.pow(2,e-15)*(1+m/1024);};
const color565=(n:number)=>[(n>>11)*255/31,((n>>5)&63)*255/63,(n&31)*255/31];
function alphaTable(b:Buffer,p:number):number[]{const a=b[p],c=b[p+1],t=[a,c];for(let i=1;i<=(a>c?6:4);i++)t.push(a>c?((7-i)*a+i*c)/7:((5-i)*a+i*c)/5);if(a<=c)t.push(0,255);return t;}
function alphaIndices(b:Buffer,p:number):bigint{let v=0n;for(let i=0;i<6;i++)v|=BigInt(b[p+2+i])<<BigInt(8*i);return v;}
export function decodeTexture(buffer:Buffer,name:string,maxSize=1024):TextureAsset{
  const a=readNativeAsset(buffer),h=a.header;if(a.type!==0||a.version!==8||h.length<40)throw new Error(`不支持的纹理头：${a.type}/${a.version}`);
  let width=h.readUInt16LE(12),height=h.readUInt16LE(14);const depth=h.readUInt16LE(16),mips=h.readUInt16LE(18),format=h.readUInt16LE(20),flags=h.readUInt16LE(22);
  if(!width||!height||width>16384||height>16384||!mips||mips>16||depth>1)throw new Error('只支持二维普通纹理');
  const blockSize=format===256||format===258?8:format===257||format===259?16:0,rgba=[1,2,4,5,18].includes(format),pixelStride=format===1?1:format===2?2:format===18?8:4;
  if(!blockSize&&!rgba)throw new Error(`尚未解码的纹理格式 ${format}`);
  let offset=0,rowBytes=0;
  for(let mip=0;mip<mips;mip++){
    rowBytes=align(blockSize?Math.ceil(width/4)*blockSize:width*pixelStride,256);const rows=blockSize?Math.ceil(height/4):height,bytes=align(rowBytes*rows,512);
    if(width<=maxSize&&height<=maxSize||mip===mips-1)break;offset+=bytes;width=Math.max(1,width>>1);height=Math.max(1,height>>1);
  }
  const rows=blockSize?Math.ceil(height/4):height;if(offset+rowBytes*rows>a.data.length)throw new Error('纹理像素越界');
  const pixels=new Uint8Array(width*height*4),b=a.data;
  if(rgba){for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=offset+y*rowBytes+x*pixelStride,q=(y*width+x)*4;if(format===18){for(let j=0;j<4;j++)pixels[q+j]=Math.round(Math.max(0,Math.min(1,half(b.readUInt16LE(p+j*2))))*255);}else{pixels[q]=b[p+(format===5?2:0)];pixels[q+1]=format===1?b[p]:b[p+1];pixels[q+2]=format===1?b[p]:format===2?0:b[p+(format===5?0:2)];pixels[q+3]=pixelStride<4?255:b[p+3];}}}
  else for(let by=0;by<Math.ceil(height/4);by++)for(let bx=0;bx<Math.ceil(width/4);bx++){
    const p=offset+by*rowBytes+bx*blockSize;
    if(format===256||format===257){const cp=p+(format===257?8:0),c0=b.readUInt16LE(cp),c1=b.readUInt16LE(cp+2),v0=color565(c0),v1=color565(c1),four=c0>c1||format===257;
      const colors=[v0,v1,four?v0.map((v,j)=>(2*v+v1[j])/3):v0.map((v,j)=>(v+v1[j])/2),four?v0.map((v,j)=>(v+2*v1[j])/3):[0,0,0]],idx=b.readUInt32LE(cp+4),at=format===257?alphaTable(b,p):[],ai=format===257?alphaIndices(b,p):0n;
      for(let i=0;i<16;i++){const x=bx*4+i%4,y=by*4+(i>>2);if(x>=width||y>=height)continue;const ci=(idx>>>(i*2))&3,q=(y*width+x)*4;for(let j=0;j<3;j++)pixels[q+j]=Math.round(colors[ci][j]);pixels[q+3]=format===257?Math.round(at[Number((ai>>BigInt(i*3))&7n)]):!four&&ci===3?0:255;}
    }else{const red=alphaTable(b,p),ri=alphaIndices(b,p),green=format===259?alphaTable(b,p+8):red,gi=format===259?alphaIndices(b,p+8):ri;
      for(let i=0;i<16;i++){const x=bx*4+i%4,y=by*4+(i>>2);if(x>=width||y>=height)continue;const q=(y*width+x)*4,r=Math.round(red[Number((ri>>BigInt(i*3))&7n)]),g=Math.round(green[Number((gi>>BigInt(i*3))&7n)]);pixels[q]=r;pixels[q+1]=g;pixels[q+2]=format===259?Math.round((Math.sqrt(Math.max(0,1-(r/127.5-1)**2-(g/127.5-1)**2))*.5+.5)*255):r;pixels[q+3]=255;}
    }
  }
  return{name,width,height,format,srgb:Boolean(flags&1),pixels};
}
