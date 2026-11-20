// Recognize the game's Windows Saved Games initializer across releases.
// The fixed instructions identify the folder name, the known-folder call,
// and the concatenation of the returned directory with that name.
const instructions = [
  [0x00, '48c784240001000019000000488d05'],
  [0x13, '48898424080100004c8d05'],
  [0x22, '488dbc24d0080000ba240000004889f14989f9e8'],
  [0x3a, '48c784243019000000000000488db424301900004889f9ba008000004531c04989f1e8'],
  [0x61, '85c07823488b942430190000488d0d'],
  [0x74, '4c8d8424900000004c8d4c2440e8'],
  [0x86, 'eb0b0f57c00f29842490000000488b8c2430190000e8'],
  [0xa0, '48c744244003000000488d05'],
  [0xb0, '488944244848c7842440010000020000004889b424480100004889ac2430190000488d84249000000048898424381900004889ac2440190000488d8424000100004889842448190000'],
] as const;
const signature = instructions.map(([offset, hex]) => ({offset, bytes:Buffer.from(hex,'hex')}));
const originalDirectory = Buffer.from('Order of the Sinking Star\0');
const savedGamesGuid = Buffer.from('4C5C32FF-BB9D-43b0-B5B4-2D72E54EAAA4\0');
const shell32 = Buffer.from('SHELL32.dll\0');
const knownFolderFunction = Buffer.from('SHGetKnownFolderPath\0');
const requireReadOnly = (flags:number) => (flags & 0x40000040) === 0x40000040 && !(flags & 0xa0000000);

interface Section {
  name:string;
  header:number;
  size:number;
  rva:number;
  rawSize:number;
  raw:number;
  flags:number;
}

function readSections(exe:Buffer){
  if(exe.length<0x40||exe.readUInt16LE(0)!==0x5a4d)return;
  const pe=exe.readUInt32LE(0x3c),optional=pe+24;
  if(optional+128>exe.length||exe.readUInt32LE(pe)!==0x4550||exe.readUInt16LE(pe+4)!==0x8664||
     exe.readUInt16LE(optional)!==0x20b||exe.readUInt32LE(optional+108)<2)return;
  const count=exe.readUInt16LE(pe+6),optionalSize=exe.readUInt16LE(pe+20),first=optional+optionalSize;
  if(!count||count>96||optionalSize<128||first+count*40>exe.length)return;
  const sections:Section[]=[];
  for(let index=0;index<count;index++){
    const header=first+index*40;
    const section={
      name:exe.toString('ascii',header,header+8).replace(/\0.*$/,''),
      header,size:exe.readUInt32LE(header+8),rva:exe.readUInt32LE(header+12),
      rawSize:exe.readUInt32LE(header+16),raw:exe.readUInt32LE(header+20),flags:exe.readUInt32LE(header+36),
    };
    if(section.rawSize&&(section.raw<first+count*40||section.raw+section.rawSize>exe.length))return;
    sections.push(section);
  }
  return {sections,imports:exe.readUInt32LE(optional+120),importSize:exe.readUInt32LE(optional+124)};
}

function atRva(sections:Section[],rva:number,length:number){
  const section=sections.find(s=>rva>=s.rva&&rva-s.rva+length<=Math.min(s.size,s.rawSize));
  return section&&section.raw+rva-section.rva;
}

function importedKnownFolder(exe:Buffer,image:NonNullable<ReturnType<typeof readSections>>,iatRva:number){
  for(let index=0;index<Math.min(128,Math.floor(image.importSize/20));index++){
    const offset=atRva(image.sections,image.imports+index*20,20);
    if(offset===undefined)return false;
    const nameRva=exe.readUInt32LE(offset+12);
    if(!nameRva)return false;
    const name=atRva(image.sections,nameRva,shell32.length);
    if(name===undefined||exe.toString('ascii',name,name+shell32.length).toLowerCase()!=='shell32.dll\0')continue;
    const iat=exe.readUInt32LE(offset+16),lookup=exe.readUInt32LE(offset);
    const delta=iatRva-iat;
    if(!iat||!lookup||delta<0||delta%8||delta>4096)return false;
    for(let entry=0;entry<=delta;entry+=8){
      const slot=atRva(image.sections,lookup+entry,8);
      if(slot===undefined)return false;
      const symbol=exe.readBigUInt64LE(slot);
      if(!symbol)return false;
      if(entry===delta){
        if(symbol>0x7fffffffn)return false;
        const hint=atRva(image.sections,Number(symbol),knownFolderFunction.length+2);
        return hint!==undefined&&exe.subarray(hint+2,hint+2+knownFolderFunction.length).equals(knownFolderFunction);
      }
    }
  }
  return false;
}

export function locateNativeSavePath(exe:Buffer){
  const image=readSections(exe);
  if(!image)return;
  const {sections}=image;
  const text=sections.find(s=>s.name==='.text'),rdata=sections.find(s=>s.name==='.rdata');
  if(!text||!(text.flags&0x20000000)||!rdata||!requireReadOnly(rdata.flags))return;
  const textBytes=exe.subarray(text.raw,text.raw+Math.min(text.rawSize,text.size));
  const rdataBytes=exe.subarray(rdata.raw,rdata.raw+Math.min(rdata.rawSize,rdata.size));
  const directory=rdataBytes.indexOf(originalDirectory),guid=rdataBytes.indexOf(savedGamesGuid);
  if(directory<0||guid<0)return;
  const relativeTarget=(displacement:number)=>text.rva+displacement+4+textBytes.readInt32LE(displacement);
  const first=signature[0].bytes;
  let match:number|undefined;
  for(let start=textBytes.indexOf(first);start>=0;start=textBytes.indexOf(first,start+1)){
    if(!signature.every(({offset,bytes})=>textBytes.subarray(start+offset,start+offset+bytes.length).equals(bytes)))continue;
    if(relativeTarget(start+0x0f)!==rdata.rva+directory||relativeTarget(start+0x1e)!==rdata.rva+guid)continue;
    const thunkRva=relativeTarget(start+0x5d),thunk=thunkRva-text.rva;
    if(thunk<0||thunk+6>textBytes.length||textBytes.readUInt16LE(thunk)!==0x25ff||
       !importedKnownFolder(exe,image,relativeTarget(thunk+2)))continue;
    if(match!==undefined)return;
    match=start;
  }
  if(match===undefined)return;
  // Use only zero-filled file alignment padding outside the original mapped data.
  // A separate string leaves the name used by the pause menu intact.
  const padding=sections.find(s=>{
    if(s!==rdata&&s.name!=='_RDATA'||!requireReadOnly(s.flags)||s.rawSize-s.size<originalDirectory.length)return false;
    const offset=s.raw+s.size,end=s.rva+s.size+originalDirectory.length;
    return sections.every(other=>other===s||other.rva<s.rva||end<=other.rva)&&
      exe.subarray(offset,offset+originalDirectory.length).every(byte=>byte===0);
  });
  if(!padding)return;
  const displacement=text.raw+match+0x0f,nextInstruction=text.rva+match+0x13;
  return {
    displacement,relative:padding.rva+padding.size-nextInstruction,
    virtualSizeOffset:padding.header+8,virtualSize:padding.size+originalDirectory.length,
    stringOffset:padding.raw+padding.size,
  };
}
