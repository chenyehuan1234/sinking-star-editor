import type {AssetSource} from '../asset-diagnostics';

export type Phase = 'select.feedback' | 'select.pick' | 'select.highlight' | 'select.list' | 'select.inspector' |
  'drag.frame' | 'drag.move' | 'drag.release' | 'drag.commit' | 'drag.input' | 'drag.paint' |
  'place.preview' | 'place.resources' | 'frame.render' | 'frame.sceneSync' | 'frame.terrainSync' |
  'preview.wait' | 'preview.backend' | 'preview.roundtrip' | 'preview.apply' | 'preview.full' | 'preview.delta' |
  'asset.roundtrip' | 'asset.reuse' | 'asset.renderer' | 'asset.disk' | 'asset.read' | 'asset.decode' | 'asset.cacheWrite' |
  'asset.workerBoundary' | 'asset.ipcBoundary' | 'main.longTask';
type Category = 'object' | 'terrain' | 'camera' | 'mesh' | 'texture' | 'pose' | 'material' | 'normal' | 'world';
type Details = {parent?:number; category?:Category; source?:AssetSource; count?:number};
type SceneSize = {kind:'level'|'world'|'none';objects:number;cells:number};
export type Ticket = {session:number;id:number;at:number;size:SceneSize};
export type Sample = Details & {id:number;phase:Phase;atMs:number;ms:number;scene:number};
export type PerformanceReport = {version:1;durationMs:number;dropped:number;scenes:SceneSize[];samples:Sample[]};

const maxSamples = 16384;
const maxDurationMs = 30_000;
const round = (value:number) => Math.round(value * 1000) / 1000;

type ReuseCounter = {ticket:Ticket;category:Category;count:number};

class PerformanceCapture {
  private session = 0;
  private current?:{started:number;id:number;report:PerformanceReport;timer:ReturnType<typeof setTimeout>;observer?:PerformanceObserver;reuse:Map<string,ReuseCounter>};
  private latest:PerformanceReport|null = null;
  private listeners = new Set<()=>void>();
  private scene:SceneSize = {kind:'none',objects:0,cells:0};
  private selection?:{ids:readonly number[];input:Ticket;ready:boolean};

  get active(){return this.current !== undefined;}
  get report(){return this.latest;}
  subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private changed(){for(const listener of this.listeners)listener();}

  setScene(kind:SceneSize['kind'],objects:number,cells:number){
    if(this.scene.kind===kind&&this.scene.objects===objects&&this.scene.cells===cells)return;
    this.flushReuse();
    this.scene = {kind,objects,cells};
  }

  start(){
    if(this.current)return;
    this.session++;
    this.latest=null;
    const report:PerformanceReport={version:1,durationMs:0,dropped:0,scenes:[],samples:[]};
    this.current={started:performance.now(),id:0,report,timer:setTimeout(()=>this.stop(),maxDurationMs),reuse:new Map()};
    if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes.includes('longtask')){
      const observer=new PerformanceObserver(list=>{
        for(const task of list.getEntries()){
          const sample=this.begin(task.startTime);
          this.end(sample,'main.longTask',{},task.duration);
        }
      });
      observer.observe({type:'longtask'});
      this.current.observer=observer;
    }
    this.changed();
  }

  stop(){
    if(!this.current)return this.latest;
    const {started,timer,observer,report}=this.current;
    clearTimeout(timer);
    observer?.disconnect();
    this.flushReuse();
    report.durationMs=round(performance.now()-started);
    this.current=undefined;
    this.selection=undefined;
    this.latest=report;
    this.changed();
    return report;
  }

  clear(){
    if(!this.latest)return;
    this.latest=null;
    this.changed();
  }

  begin(at?:number):Ticket|undefined{
    const capture=this.current;
    if(capture)return {session:this.session,id:++capture.id,at:Math.max(capture.started,at??performance.now()),size:this.scene};
  }

  end(ticket:Ticket|undefined,phase:Phase,details?:Details,elapsed?:number){
    const capture=this.current;
    if(!capture||!ticket||ticket.session!==this.session)return;
    const {report,started}=capture;
    if(report.samples.length>=maxSamples){report.dropped++;return;}
    const last=report.scenes.at(-1);
    const size=ticket.size;
    if(!last||size.kind!==last.kind||size.objects!==last.objects||size.cells!==last.cells)report.scenes.push(size);
    report.samples.push({id:ticket.id,phase,atMs:round(ticket.at-started),ms:round(Math.max(0,elapsed??performance.now()-ticket.at)),scene:report.scenes.length-1,...details});
  }

  count(phase:Phase,count=1,category?:Category){
    if(this.active)this.end(this.begin(),phase,{count,category},0);
  }

  reuseAsset(category:Extract<Category,'mesh'|'texture'|'pose'|'material'>){
    const capture=this.current;
    if(!capture)return;
    const bucket=capture.reuse.get(category);
    if(bucket)bucket.count++;
    else capture.reuse.set(category,{ticket:this.begin()!,category,count:1});
  }

  private flushReuse(){
    if(!this.current)return;
    for(const {ticket,category,count} of this.current.reuse.values())this.end(ticket,'asset.reuse',{category,source:'renderer',count},0);
    this.current.reuse.clear();
  }

  select(ids:readonly number[],input?:Ticket){
    const ticket=input??this.begin();
    if(ticket)this.selection={ids,input:ticket,ready:false};
  }

  selectionPhase(ids:readonly number[],phase:'select.highlight'|'select.list'|'select.inspector'){
    const sample=this.selection;
    if(!sample||sample.ids!==ids)return;
    this.end(sample.input,phase,{count:ids.length});
    if(phase==='select.highlight')sample.ready=true;
  }

  selectionDrawn(ids:readonly number[]){
    if(this.selection?.ready&&this.selection.ids===ids){
      this.end(this.selection.input,'select.feedback',{count:ids.length});
      this.selection=undefined;
    }
  }
}

export const performanceCapture = new PerformanceCapture();

export function summarizePerformance(samples:readonly Sample[]){
  const groups=new Map<string,Sample[]>();
  for(const sample of samples){
    const key=[sample.phase,sample.category,sample.source].filter(Boolean).join(' / ');
    const group=groups.get(key);
    if(group)group.push(sample);else groups.set(key,[sample]);
  }
  return [...groups].map(([key,group])=>{
    const sorted=group.sort((a,b)=>a.ms-b.ms);
    const quantile=(p:number)=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)].ms;
    return {key,phase:sorted[0].phase,count:sorted.length,totalCount:sorted.reduce((n,s)=>n+(s.count??0),0),median:quantile(.5),p95:quantile(.95),max:sorted.at(-1)!.ms};
  }).sort((a,b)=>b.p95-a.p95);
}
