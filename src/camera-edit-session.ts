import type{CameraConfig}from'./shared';

/** One gesture is one history item; cancelling never changes the saved configuration. */
export class CameraEditSession{
 private active=false;private before?:CameraConfig;private next?:CameraConfig;
 constructor(private draft:(v:CameraConfig|null)=>void,private commit:(v:CameraConfig)=>void){}
 get pending(){return this.active;}
 begin(config:CameraConfig|undefined){this.cancel();this.active=true;this.before=structuredClone(config);}
 preview(config:CameraConfig){if(!this.active)return;this.next=config;this.draft(config);}
 finish(inside=true){if(!this.active)return;const next=this.next,before=this.before;this.active=false;this.next=undefined;this.before=undefined;if(inside&&next&&JSON.stringify(next)!==JSON.stringify(before))this.commit(next);else this.draft(null);}
 cancel(){if(!this.active)return;this.active=false;this.before=undefined;this.next=undefined;this.draft(null);}
}
