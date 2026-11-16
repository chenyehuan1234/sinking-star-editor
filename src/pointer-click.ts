/** Keep click actions separate from navigation, including releases without a move event. */
export class PointerClick {
  private dragged=false;
  constructor(readonly x:number,readonly y:number,readonly threshold:number){}
  move(x:number,y:number){this.dragged ||= Math.hypot(x-this.x,y-this.y)>this.threshold;return this.dragged;}
  finish(x:number,y:number,inside:boolean){return !this.move(x,y)&&inside;}
}

/** A short, stationary, middle-only press. Navigation/holding can never sample. */
export class MiddleClick {
  private invalid=false;
  private readonly click:PointerClick;
  constructor(x:number,y:number,readonly startedAt:number){this.click=new PointerClick(x,y,0);}
  cancel(){this.invalid=true;}
  move(x:number,y:number,movementX=0,movementY=0,buttons=4){if(this.click.move(x,y)||movementX!==0||movementY!==0||buttons!==4)this.cancel();}
  finish(x:number,y:number,time:number,inside:boolean,buttons=0){const elapsed=time-this.startedAt;return !this.invalid&&buttons===0&&elapsed>=0&&elapsed<=300&&this.click.finish(x,y,inside);}
}
