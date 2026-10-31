import{Matrix4,Quaternion,Vector3}from'three';import type{MeshAsset}from'../asset-types';
export function idleMatrices(b:Buffer){
 if(b.length<80||b.toString('ascii',0,4)!=='Anim'||b.readUInt16LE(4)!==12)throw new Error('尚不支持的原生动画版本');
 const count=b.readUInt32LE(10),samples=b.readUInt32LE(14),firstSize=b.readUInt32LE(18),nextSize=b.readUInt32LE(22);if(count<1||count>1024||samples<1||samples>100000)throw new Error('动画骨骼或采样数量无效');
 const parents=Array.from({length:count},(_,i)=>b.readInt16LE(74+i*2)),boneStart=Math.ceil((74+count*2)/4)*4,names:string[]=[];let p=boneStart+count*44;
 for(let i=0;i<count;i++){const n=b[p++];if(!n||p+n>=b.length||b[p+n]!==0)throw new Error('动画骨骼名称无效');names.push(b.toString('utf8',p,p+n));p+=n+1;}
 const frameStart=Math.ceil(p/4)*4;if(frameStart+firstSize+(samples-1)*nextSize!==b.length)throw new Error('动画采样流范围不匹配');
 const matrices:Matrix4[]=[];
 for(let i=0;i<count;i++){const k=boneStart+i*44,flags=b.readUInt32LE(k);let q=frameStart+b.readUInt32LE(k+4);const position=new Vector3(),orientation=new Quaternion(),scale=new Vector3(1,1,1);
  if(!(flags&8)){const values=[0,1,2].map(a=>{const min=b.readFloatLE(k+24+a*4),max=b.readFloatLE(k+12+a*4),value=flags&1?0:b.readUInt16LE(q)/65535;if(!(flags&1))q+=2;return min+(max-min)*value;});position.fromArray(values);}
  if(!(flags&16)){orientation.set(...[0,1,2,3].map(()=>{const value=b.readInt16LE(q)/32767;q+=2;return value;})as[number,number,number,number]).normalize();}
  if(!(flags&32)){const min=b.readFloatLE(k+40),max=b.readFloatLE(k+36),value=flags&4?min:min+(max-min)*b.readUInt16LE(q)/65535;if(!(flags&4))q+=2;scale.setScalar(value);}
  if(q>frameStart+firstSize)throw new Error('动画第一帧越界');const matrix=new Matrix4().compose(position,orientation,scale),parent=parents[i];if(parent>=i||parent< -1)throw new Error('动画骨骼层级无效');if(parent>=0)matrix.premultiply(matrices[parent]);matrices.push(matrix);
 }
 return new Map(names.map((name,i)=>[name,matrices[i]]));
}
export function bakeIdle(mesh:MeshAsset,animation:Buffer,name:string):MeshAsset{
 if(!mesh.skin)return mesh;const pose=idleMatrices(animation),skin=mesh.skin,matrices=skin.names.map((bone,i)=>{const animated=pose.get(bone);if(!animated)throw new Error('待机动画缺少骨骼：'+bone);const inverse=new Matrix4().fromArray(skin.inverseBind,i*16),w=inverse.elements[15];if(!Number.isFinite(w)||Math.abs(w)<1e-8)throw new Error('骨骼绑定矩阵无效');inverse.multiplyScalar(1/w);return new Matrix4().makeScale(.01,.01,.01).multiply(animated).multiply(inverse);});
 const positions=new Float32Array(mesh.positions.length),v=new Vector3(),out=new Vector3(),part=new Vector3();for(let i=0;i<positions.length/3;i++){v.fromArray(mesh.positions,i*3);out.set(0,0,0);let total=0;for(let j=0;j<4;j++){const weight=skin.weights[i*4+j]/255;if(!weight)continue;part.copy(v).applyMatrix4(matrices[skin.indices[i*4+j]]);out.addScaledVector(part,weight);total+=weight;}if(!total)out.copy(v);else out.divideScalar(total);out.toArray(positions,i*3);}
 if(!positions.every(Number.isFinite))throw new Error('待机姿态产生无效顶点');const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i++){const a=i%3;min[a]=Math.min(min[a],positions[i]);max[a]=Math.max(max[a],positions[i]);}return{...mesh,positions,bounds:[...min,...max]as MeshAsset['bounds'],skin:undefined,previewPose:name};
}
