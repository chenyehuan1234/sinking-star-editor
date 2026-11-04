import type {Vec3} from './shared';
const vectors:Record<string,Vec3>={nudgeWest:[-1,0,0],nudgeEast:[1,0,0],nudgeNorth:[0,1,0],nudgeSouth:[0,-1,0],nudgeRise:[0,0,1],nudgeFall:[0,0,-1]};
/** A timer-independent transaction; the viewport owns the 300/80 ms clock. */
export class HeldNudge {
 readonly keys=new Map<string,string>();offset:Vec3=[0,0,0];
 press(code:string,command:string){if(!vectors[command]||this.keys.has(code))return false;this.keys.set(code,command);for(let a=0;a<3;a++)if(vectors[command][a]){const total=[...this.keys.values()].reduce((n,id)=>n+vectors[id][a],0);this.offset[a]+=Math.sign(total);}return true;}
 release(code:string){this.keys.delete(code);return this.keys.size===0;}
 step(){const v:Vec3=[0,0,0];for(const id of this.keys.values())for(let a=0;a<3;a++)v[a]+=vectors[id][a];for(let a=0;a<3;a++)this.offset[a]+=Math.sign(v[a]);return this.offset;}
 get changed(){return this.offset.some(Boolean);}
}
