import {test} from 'node:test';import assert from 'node:assert/strict';
import {createWorkbenchApi} from '../src/renderer/native-session';import {mergePreview} from '../src/preview-delta';
import type {EditorApi,WorldProject,RunRequest,LevelView} from '../src/shared';
import {EditorService} from '../src/main/service';import {nativeDocument} from '../src/native-project';
function world():WorldProject {return {format:'sinking-star-world',version:3,id:'0123456789ab',name:'大世界',sourceHash:'a'.repeat(64),sourceBuild:'test',native:{base:'overworld',sourceVersion:5,assignments:[]},map:{width:32,height:32,tiles:Array(1024).fill(0),spawn:[0,0],entries:[]},levels:Array.from({length:993},(_,i)=>({id:'scene_'+i,title:'关卡 '+i,project:{format:'sinking-star-project',version:3,sourceHash:'a'.repeat(64),sourceBuild:'test',template:'mirror_1',name:'scene_'+i,operations:[]}}))};}
test('冻结的Electron接口可适配；单关及关卡组仅传选中场景，不把993关送入简化地图编译',async()=>{
 const calls:{w:WorldProject;r:RunRequest}[]=[],base=Object.freeze({runPlan:async(w:WorldProject,r:RunRequest)=>{calls.push({w,r});return {};}}) as unknown as EditorApi;
 const {api}=createWorkbenchApi(base),source=world();
 for(const r of [{mode:'single',levelIds:['scene_2']},{mode:'subset',levelIds:['scene_4','scene_8']}] as RunRequest[]){await api.runPlan(source,r);const call=calls.at(-1)!;assert.equal(call.w.native,undefined);assert.equal(call.w.id,source.id);assert.deepEqual(call.w.levels.map(l=>l.id),r.levelIds);assert.ok(call.w.map.tiles.every(Boolean));assert.deepEqual(call.r,r);}
 assert.equal(source.levels.length,993);assert.ok(source.native);
});
test('世界范围请求保留负Z和修订号，概览切到细节会清掉旧概览标记',async()=>{
 const requests:any[]=[],view:LevelView={name:'overworld',typeCount:1,entities:[],manifest:'',terrain:[],overview:true};
 const base={nativeRegion:async(r:any)=>{requests.push(r);return {view:{...view,overview:requests.length===1?true:undefined},elapsedMs:1};}} as unknown as EditorApi;
 const bridge=createWorkbenchApi(base),w=world();bridge.setRange({min:[-20,-30,-8],max:[25,40,3],overview:true});
 const first=await bridge.api.previewUpdate({world:w,scene:w.id+':world',revision:1});const initial=mergePreview(null,first);assert.equal(initial.overview,true);
 bridge.setRange({min:[-20,-30,-8],max:[25,40,3],overview:false});const second=await bridge.api.previewUpdate({world:w,scene:w.id+':world',revision:2,baseRevision:1});
 assert.equal(mergePreview(initial,second,1).overview,undefined);assert.equal(requests[1].revision,2);assert.deepEqual(requests[1].bounds.min,[-20,-30,-8]);assert.equal(requests[1].project.version,5);
});
test('仅部署接口在游戏运行时拒绝准备和写入测试副本',async()=>{const s=new EditorService('unused-v09-test'),calls:string[]=[];(s as any).nativeIndex=async()=>{calls.push('index');return {};};s.assertStopped=async()=>{calls.push('stopped');throw Error('游戏正在运行');};s.prepare=async()=>{calls.push('prepare');return '';};await assert.rejects(s.nativeDeploy(nativeDocument(world())),/游戏正在运行/);assert.deepEqual(calls,['index','stopped']);});
