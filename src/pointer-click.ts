/** Keep click actions separate from navigation, including releases without a move event. */
export class PointerClick {
  private dragged=false;
  constructor(readonly x:number,readonly y:number,readonly threshold:number){}
  move(x:number,y:number){this.dragged ||= Math.hypot(x-this.x,y-this.y)>this.threshold;return this.dragged;}
  finish(x:number,y:number,inside:boolean){return !this.move(x,y)&&inside;}
}
