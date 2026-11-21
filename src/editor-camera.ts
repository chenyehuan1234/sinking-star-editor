import * as T from 'three';
/** A stable camera identity keeps controls, picking and transform gizmos attached. */
export class EditorCamera extends T.PerspectiveCamera {
 orthographic=false;isOrthographicCamera=false;span=20;left=-10;right=10;top=10;bottom=-10;
 setProjection(orthographic:boolean,distance:number){this.span=2*Math.max(.1,distance)*Math.tan(this.fov*Math.PI/360);this.zoom=1;this.orthographic=orthographic;this.isOrthographicCamera=orthographic;Object.defineProperty(this,'isPerspectiveCamera',{value:!orthographic,writable:true,configurable:true});this.updateProjectionMatrix();}
 override updateProjectionMatrix(){if(!this.orthographic){super.updateProjectionMatrix();return;}this.top=this.span/2;this.bottom=-this.top;this.right=this.top*this.aspect;this.left=-this.right;this.projectionMatrix.makeOrthographic(this.left/this.zoom,this.right/this.zoom,this.top/this.zoom,this.bottom/this.zoom,this.near,this.far);this.projectionMatrixInverse.copy(this.projectionMatrix).invert();}
}
/** Move in image space by a fraction of the visible height at the focus point. */
export function keyPanOffset(rotation:T.Quaternion, height:number, direction:readonly [number,number]){
 return new T.Vector3(direction[0],direction[1],0).applyQuaternion(rotation).multiplyScalar(height*.025);
}

export function viewHeight(camera:EditorCamera,depth:number){
 return camera.orthographic?camera.span/camera.zoom:2*depth*Math.tan(camera.getEffectiveFOV()*Math.PI/360);
}

/** Keep the projected point underneath the pointer and rebase the orbit depth there. */
export function zoomEditorCamera(camera:EditorCamera,target:T.Vector3,anchor:T.Vector3,factor:number,limit:number){
 const direction=camera.getWorldDirection(new T.Vector3());
 const offset=anchor.clone().sub(camera.position),depth=offset.dot(direction);
 if(camera.orthographic){
  const height=viewHeight(camera,depth),next=T.MathUtils.clamp(height*factor,.15,limit);
  offset.addScaledVector(direction,-depth).multiplyScalar(1-next/height);
  camera.zoom=camera.span/next;
  camera.position.add(offset);
  target.add(offset);
 }else{
  const safeDepth=Math.max(.15,depth),next=T.MathUtils.clamp(safeDepth*factor,.15,limit);
  camera.position.addScaledVector(offset,1-next/safeDepth);
  target.copy(camera.position).addScaledVector(direction,next);
 }
 camera.updateProjectionMatrix();
}

/** Sample the view at its focus depth and intersect nearby horizontal layers.
 * Near the horizon, cap ray length so empty sky cannot request the entire world.
 */
export function viewportXY(camera:EditorCamera,target:T.Vector3,levels:number[]){
 const forward=camera.getWorldDirection(new T.Vector3());
 const focus=new T.Plane().setFromNormalAndCoplanarPoint(forward,target);
 const result=new T.Box2(),raycaster=new T.Raycaster(),point=new T.Vector3();
 const reach=Math.max(32,camera.position.distanceTo(target),viewHeight(camera,1)*Math.max(1,camera.aspect))*2.5;
 function include(p:T.Vector3){result.expandByPoint(new T.Vector2(p.x,p.y));}
 for(const x of [-1,0,1])for(const y of [-1,0,1]){
  raycaster.setFromCamera(new T.Vector2(x,y),camera);
  const ray=raycaster.ray,at=ray.intersectPlane(focus,point);
  if(at)include(at);
  if(Math.abs(ray.direction.z)<1e-7)continue;
  for(const z of levels){
   const distance=(z-ray.origin.z)/ray.direction.z;
   if(distance>=0&&distance<=reach)include(ray.at(distance,point));
  }
 }
 if(result.isEmpty())include(target);
 return result;
}

export function axisDirection(axis:number,sign:number){return new T.Vector3().setComponent(axis,sign<0?-1:1);}
export function stableUp(direction:T.Vector3){return Math.abs(direction.z)>.999?new T.Vector3(0,direction.z>0?1:-1,0):new T.Vector3(0,0,1);}

import{OrbitControls}from'three/addons/controls/OrbitControls.js';
/** OrbitControls caches the up-axis basis; axis-aligned views change it at runtime. */
export class EditorOrbitControls extends OrbitControls {
 override update(deltaTime?:number):boolean {const controls=this as any;if(controls._quat&&controls._quatInverse){controls._quat.setFromUnitVectors(this.object.up,new T.Vector3(0,1,0));controls._quatInverse.copy(controls._quat).invert();}return super.update(deltaTime);}
}
