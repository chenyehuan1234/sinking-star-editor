import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import {GamePackage} from '../core/package';
import {ExeReflection} from '../core/reflection';
import {PropertyCodec} from '../core/properties';
import {blankFile} from '../core/blank';
import {parseEntities,type EntityFile} from '../core/entities';
import {applyProject,levelView} from '../core/project';
import {WorldCompiler,worldIssues} from '../core/world';
import {validateReferences} from '../core/mechanisms';
import {mechanismIssues} from '../core/mechanism-check';
import {diffPreview,type PreviewRequest} from '../preview-delta';
import {gameplayProject} from '../editor-organization';
import type {EditorProject,LevelView,WorldProject,WorldIssue} from '../shared';
const pkg=new GamePackage(fs.readFileSync(path.join(workerData.root,'data/levels.package')));
const exe=fs.readFileSync(path.join(workerData.root,'sinking_star.exe'));
const codec=exe.length>64?new PropertyCodec(new ExeReflection(exe)):undefined;
const compiler=codec?new WorldCompiler(pkg,codec):undefined;
const bases=new Map<string,EntityFile>();
function base(p:EditorProject){const key=JSON.stringify([p.template,p.base]);let b=bases.get(key);if(!b){b=p.base?.kind==='blank'?blankFile(pkg,codec!,p.base.width,p.base.height):parseEntities(pkg.get(`data-common/${p.template}.entities`));bases.set(key,b);if(bases.size>16)bases.delete(bases.keys().next().value!);}return{...b,types:[...b.types],records:b.records.map(r=>({...r})),analysisWarnings:b.analysisWarnings?.map(w=>({...w}))};}
const files=new Map<string,ReturnType<typeof applyProject>>();
function file(p:EditorProject){const key=JSON.stringify(gameplayProject(p));let value=files.get(key);if(!value){value=applyProject(pkg,p,codec,base(p));files.set(key,value);if(files.size>8)files.delete(files.keys().next().value!);}return value;}
const sessions=new Map<string,{revision:number;view:LevelView}>();
function preview(p:EditorProject){return levelView(pkg,p.template,file(p),codec);}
function worldPreview(w:WorldProject):LevelView{return !w.map.tiles.some(Boolean)&&!w.map.objects?.length&&!w.map.entries.length?{name:'overworld',entities:[],typeCount:88,manifest:'',terrain:[]}:levelView(pkg,'overworld',compiler!.previewMap(w),codec);}
function validate(w:WorldProject){const issues:WorldIssue[]=worldIssues(w);if(w.map.objects?.length)try{for(const message of validateReferences(codec!,compiler!.previewMap(w)))issues.push({severity:'error',message:'大地图：'+message});}catch(e){issues.push({severity:'error',message:'大地图：'+String(e)});}for(const l of w.levels){try{const f=file(l.project);if(codec)issues.push(...mechanismIssues(codec,f).map(i=>({...i,levelId:l.id,message:l.title+'：'+i.message})));if(!f.records.some(r=>r.type==='Guy'))issues.push({severity:'error',levelId:l.id,message:l.title+'：缺少主角'});if(l.project.base?.kind==='blank'&&!f.records.some(r=>r.type==='Door'))issues.push({severity:'error',levelId:l.id,message:l.title+'：缺少出口'});if(codec)for(const error of validateReferences(codec,f))issues.push({severity:'error',levelId:l.id,entityId:Number(error.match(/#(\d+)/)?.[1])||undefined,message:l.title+'：'+error});}catch(e){issues.push({severity:'error',levelId:l.id,message:l.title+'：'+String(e)});}}return issues;}
parentPort!.on('message',({id,method,value})=>{try{const start=performance.now();let result:unknown;if(method==='preview')result=preview(value);else if(method==='worldPreview')result=worldPreview(value);else if(method==='validate')result=validate(value);else{const r=value as PreviewRequest,previous=sessions.get(r.scene),next=r.project?preview(r.project):worldPreview(r.world!);result=diffPreview(previous&&previous.revision===r.baseRevision?previous.view:null,next,r,performance.now()-start);sessions.set(r.scene,{revision:r.revision,view:next});if(sessions.size>4)sessions.delete(sessions.keys().next().value!);}parentPort!.postMessage({id,value:result});}catch(e){parentPort!.postMessage({id,error:String(e)});}});
