import * as T from 'three';
import type {HomeCamera,SceneThumbnail} from '../home-types';
import type {LevelView} from '../shared';
import {gameplayObject} from '../editor-math';
import {ViewAssets} from './native-assets';

let renderer:T.WebGLRenderer|undefined,assets:ViewAssets|undefined,draws=0;
export function withDeadline<T>(task:Promise<T>,ms:number,message:string):Promise<T>{
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(message)),ms);
    void task.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
}

function terrainPreview(level:LevelView,compact=false):SceneThumbnail{
  const canvas=document.createElement('canvas');canvas.width=compact?192:384;canvas.height=compact?108:216;
  const ctx=canvas.getContext('2d')!;
  const {width,height}=canvas;
  ctx.fillStyle='#26333a';ctx.fillRect(0,0,width,height);
  const terrain=level.terrain??[],objects=level.entities.filter(entity=>entity.position&&gameplayObject(entity)).flatMap(entity=>entity.position?[entity.position]:[]);
  const cells=terrain.filter((_,index)=>index%Math.max(1,Math.ceil(terrain.length/10000))===0);
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  for(const [x,y] of [...cells.map(cell=>[cell.x,cell.y]),...objects]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(!Number.isFinite(x0)&&!compact)throw Error('找不到可绘制的地形或物件');
  const scale=Math.min(width*.91/(x1-x0+2),height*.81/(y1-y0+2)),xy=(x:number,y:number)=>[width*.5+(x-(x0+x1)/2)*scale,height*.5-(y-(y0+y1)/2)*scale];
  for(const cell of cells.sort((a,b)=>a.z-b.z)){
    const [x,y]=xy(cell.x,cell.y);
    ctx.fillStyle=Object.values(cell.colors??{}).find(value=>typeof value==='string')??'#92aaa2';
    ctx.fillRect(x-scale/2,y-scale/2,Math.max(1,scale-.45),Math.max(1,scale-.45));
  }
  for(const [x,y] of objects){const [px,py]=xy(x,y);ctx.fillStyle='#fad08d';ctx.beginPath();ctx.arc(px,py,Math.max(1.2,Math.min(4,scale*.2)),0,Math.PI*2);ctx.fill();}
  return {image:canvas.toDataURL('image/webp',compact ? .62 : .78),fallback:true};
}

export function renderCompactThumbnail(level:LevelView){return terrainPreview(level,true).image;}

let queue=Promise.resolve();
export function renderScenePreview(level:LevelView,saved:HomeCamera|null=null,live=()=>true):Promise<SceneThumbnail>{
  const task=queue.then(async()=>{
    if(!live())throw Error('预览已取消');
    try{return {image:await render(level,saved,live)};}
    catch(error){if(!live())throw error;return terrainPreview(level);}
  });
  queue=task.then(()=>{},()=>{});
  return task;
}

async function render(level:LevelView,saved:HomeCamera|null,live:()=>boolean){
  renderer??=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  renderer.setSize(384,216,false);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
  if(draws++%24===0){assets?.dispose();assets=undefined;}
  assets??=new ViewAssets(()=>{},()=>{});
  const scene=new T.Scene(),root=new T.Group();scene.add(root);scene.background=new T.Color('#283239');
  const light=new T.DirectionalLight(0xffedcf,3);light.position.set(-3,-5,10);scene.add(light,new T.HemisphereLight(0xd4efff,0x69736a,2));
  const aspect=16/9,geo=new T.BoxGeometry(1,1,1),mat=new T.MeshStandardMaterial({color:0x87978b});
  const waterGeo=new T.PlaneGeometry(1,1),waterMat=new T.MeshStandardMaterial({color:0x377384,transparent:true,opacity:.58});
  try{
    const terrain=level.terrain??[],stride=Math.max(1,Math.ceil(terrain.length/9000)),count=Math.ceil(terrain.length/stride);
    if(count){
      const mesh=new T.InstancedMesh(geo,mat,count),position=new T.Vector3(),matrix=new T.Matrix4();
      for(let i=0;i<count;i++){
        const cell=terrain[i*stride];position.set(cell.x,cell.y,cell.z-.5);matrix.setPosition(position);mesh.setMatrixAt(i,matrix);
        const color=Object.values(cell.colors??{}).find(v=>typeof v==='string');if(typeof color==='string')mesh.setColorAt(i,new T.Color(color));
      }
      root.add(mesh);
    }
    for(const water of level.waters?.slice(0,32)??[]){
      if(water.kind===1)continue;
      const mesh=new T.Mesh(waterGeo,waterMat);mesh.scale.set(water.width,water.height,1);mesh.position.set(water.x+(water.width-1)*.5,water.y+(water.height-1)*.5,water.gridZ??water.z);root.add(mesh);
    }
    const entities=level.entities.filter(e=>e.position&&e.mesh&&(gameplayObject(e)||e.type==='Level_Entry')).slice(0,100);
    const deadline=performance.now()+4500;
    let loaded=0;
    for(const entity of entities){
      if(!live())throw Error('预览已取消');
      const remaining=deadline-performance.now();if(remaining<25)break;
      const model=await withDeadline(assets.entity(entity),Math.min(remaining,900),'模型读取超时').catch(()=>undefined);
      if(!model)continue;
      model.position.fromArray(entity.position!);if(entity.rotation)model.quaternion.fromArray(entity.rotation);if(entity.scale)model.scale.fromArray(entity.scale);root.add(model);loaded++;
    }
    if(entities.length&&!loaded)throw Error('场景模型暂时不可用');
    if(!live()||!root.children.length)throw Error('该场景暂无可渲染模型');
    const box=new T.Box3().setFromObject(root),target=box.getCenter(new T.Vector3()),span=Math.max(3,box.getSize(new T.Vector3()).length());
    const half=(saved?.span??0)/(2*(saved?.zoom??1));
    const camera=saved?.orthographic&&half>0?new T.OrthographicCamera(-half*aspect,half*aspect,half,-half,.01,20000):new T.PerspectiveCamera(saved?.fov??42,aspect,.03,Math.max(span*12,20000));
    camera.up.fromArray(saved?.up??[0,0,1]);
    if(saved?.position?.length===3&&saved.target?.length===3){camera.position.fromArray(saved.position);target.fromArray(saved.target);}
    else camera.position.copy(target).addScaledVector(new T.Vector3(1,-1.5,1.65).normalize(),span*1.22);
    camera.lookAt(target);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/webp',.78);
  }finally{geo.dispose();mat.dispose();waterGeo.dispose();waterMat.dispose();}
}
