import {BufferGeometry,Group,LineBasicMaterial,LineSegments,Matrix4,Vector2,Vector3,Vector4,type Camera,type WebGLRenderer} from 'three';
import {projectScreenSegment} from '../screen-line-projection';

/** Project into the actual render viewport, avoiding near-plane wide-line artifacts. */
export class ScreenBoundaryLines extends Group {
  private geometry=new BufferGeometry().setFromPoints([new Vector3(),new Vector3(1,0,0)]);
  private material=new LineBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false});
  private canvas=document.createElement('canvas');
  private points:Vector3[]=[];
  constructor(){
    super();
    this.canvas.setAttribute('aria-hidden','true');
    this.canvas.className='s-screen-boundary-canvas';
    Object.assign(this.canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
    const trigger=new LineSegments(this.geometry,this.material);
    trigger.frustumCulled=false;
    trigger.onBeforeRender=(renderer,_scene,camera)=>this.paint(renderer,camera);
    this.add(trigger);
  }
  update(points:Vector3[],_size:Vector2){
    this.points=points;
    this.visible=points.length>0;
    if(!this.visible)this.canvas.getContext('2d')?.clearRect(0,0,this.canvas.width,this.canvas.height);
  }
  private paint(renderer:WebGLRenderer,camera:Camera){
    const parent=renderer.domElement.parentElement;
    if(!parent)return;
    if(this.canvas.parentElement!==parent)parent.appendChild(this.canvas);
    const size=renderer.getSize(new Vector2()),ratio=renderer.getPixelRatio();
    const width=Math.round(size.x*ratio),height=Math.round(size.y*ratio);
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    const context=this.canvas.getContext('2d');
    if(!context)return;
    context.setTransform(1,0,0,1,0,0);
    context.clearRect(0,0,width,height);
    context.setTransform(ratio,0,0,ratio,0,0);
    const viewport=renderer.getViewport(new Vector4()),top=size.y-viewport.y-viewport.w;
    context.save();
    context.beginPath();
    context.rect(viewport.x,top,viewport.z,viewport.w);
    context.clip();
    const matrix=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(this.matrixWorld);
    context.beginPath();
    for(let i=0;i+1<this.points.length;i+=2){
      const segment=projectScreenSegment(this.points[i],this.points[i+1],matrix);
      if(!segment)continue;
      const [x0,y0,x1,y1]=segment;
      context.moveTo(viewport.x+(x0+1)*viewport.z/2,top+(1-y0)*viewport.w/2);
      context.lineTo(viewport.x+(x1+1)*viewport.z/2,top+(1-y1)*viewport.w/2);
    }
    context.setLineDash([7,5]);
    context.lineWidth=4;
    context.strokeStyle='#101619';
    context.stroke();
    context.lineWidth=1.5;
    context.strokeStyle='#ffd16b';
    context.stroke();
    context.restore();
  }
  dispose(){
    this.canvas.remove();
    this.geometry.dispose();
    this.material.dispose();
  }
}
