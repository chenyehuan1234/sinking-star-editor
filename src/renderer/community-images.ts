import {coverLimit,fullImageLimit,fullImageSize,type CommunityImage} from '../share-types';

async function encode(source:CanvasImageSource,width:number,height:number,maxWidth:number,maxHeight:number,limit:number){
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d')!;
  let scale=Math.min(1,maxWidth/width,maxHeight/height);
  while(true){
    canvas.width=Math.max(1,Math.floor(width*scale));
    canvas.height=Math.max(1,Math.floor(height*scale));
    context.drawImage(source,0,0,canvas.width,canvas.height);
    let best=Infinity;
    for(const quality of [.85,.82,.80]){
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality));
      if(!blob||blob.type!=='image/webp')throw Error('无法将此图片转换成 WebP');
      if(blob.size<=limit)return blob;
      best=Math.min(best,blob.size);
    }
    if(canvas.width===1&&canvas.height===1)throw Error('无法将此图片转换成 WebP');
    scale*=Math.min(.85,Math.sqrt(limit/best)*.94);
  }
}

export async function readCommunityImage(input:File|string){
  if(typeof input==='string'){
    const image=new Image();image.src=input;await image.decode();
    return prepare(image,image.naturalWidth,image.naturalHeight);
  }
  const bitmap=await createImageBitmap(input);
  try{return await prepare(bitmap,bitmap.width,bitmap.height);}finally{bitmap.close();}
}

function prepare(image:CanvasImageSource,width:number,height:number){
  return Promise.all([
    encode(image,width,height,640,360,coverLimit),
    encode(image,width,height,fullImageSize.width,fullImageSize.height,fullImageLimit),
  ]);
}

export function asDataUrl(file:Blob):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export async function communityImage(input:File|string):Promise<CommunityImage>{
  const [small,large]=await readCommunityImage(input);
  const [thumbnail,full]=await Promise.all([asDataUrl(small),asDataUrl(large)]);
  return {thumbnail,full};
}

export async function imageUploadBody(input:File,fullPreview:boolean){
  const [small,large]=await readCommunityImage(input);
  if(!fullPreview)return small;
  const prefix=new DataView(new ArrayBuffer(4));prefix.setUint32(0,small.size);
  return new Blob([prefix.buffer,small,large],{type:'application/octet-stream'});
}
