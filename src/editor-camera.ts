import * as T from 'three';
/** A stable camera identity keeps controls, picking and transform gizmos attached. */
export class EditorCamera extends T.PerspectiveCamera {
 orthographic=false;isOrthographicCamera=false;span=20;left=-10;right=10;top=10;bottom=-10;
 setProjection(orthographic:boolean,distance:number){this.span=2*Math.max(.1,distance)*Math.tan(this.fov*Math.PI/360);this.zoom=1;this.orthographic=orthographic;this.isOrthographicCamera=orthographic;Object.defineProperty(this,'isPerspectiveCamera',{value:!orthographic,writable:true,configurable:true});this.updateProjectionMatrix();}
 override updateProjectionMatrix(){if(!this.orthographic){super.updateProjectionMatrix();return;}this.top=this.span/2;this.bottom=-this.top;this.right=this.top*this.aspect;this.left=-this.right;this.projectionMatrix.makeOrthographic(this.left/this.zoom,this.right/this.zoom,this.top/this.zoom,this.bottom/this.zoom,this.near,this.far);this.projectionMatrixInverse.copy(this.projectionMatrix).invert();}
}
export function axisDirection(axis:number,sign:number){return new T.Vector3().setComponent(axis,sign<0?-1:1);}
export function stableUp(direction:T.Vector3){return Math.abs(direction.z)>.999?new T.Vector3(0,direction.z>0?1:-1,0):new T.Vector3(0,0,1);}

import{OrbitControls}from'three/addons/controls/OrbitControls.js';
/** OrbitControls caches the up-axis basis; axis-aligned views change it at runtime. */
export class EditorOrbitControls extends OrbitControls {
 override update(deltaTime?:number):boolean {const controls=this as any;if(controls._quat&&controls._quatInverse){controls._quat.setFromUnitVectors(this.object.up,new T.Vector3(0,1,0));controls._quatInverse.copy(controls._quat).invert();}return super.update(deltaTime);}
}
