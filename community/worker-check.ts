import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {digest, encodeShare, parseShare} from '../src/core/share';
import {newWorld} from '../src/core/world';
import type {EditorProject} from '../src/shared';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8787');
const suffix = randomUUID().slice(0,8);
const identities = {username:'cf-check-'+suffix,password:randomUUID()};
const title = 'Cloudflare 测试 '+suffix;
const project = newWorld('a'.repeat(64), 'test');
project.name = title;
project.levelGroups = [{id:'west',title:'西侧回廊'}];
const stage:EditorProject = {format:'sinking-star-project',version:3,sourceHash:project.sourceHash,
  sourceBuild:project.sourceBuild,template:'mirror_1',name:'one',operations:[]};
project.levels = [
  {id:'one',title:'机关门',folderId:'west',project:{...stage,operations:[{kind:'properties',id:1,values:{target_level:'ed_'+project.id+'_two'}}]}},
  {id:'two',title:'终点',project:{...stage,name:'two'}},
];
const design = encodeShare(project,'project','0.11.2',[
  {id:'one',title:'机关门',requires:['two']},
  {id:'two',title:'终点'},
]);
const image = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');

let token = '', work: string | undefined, largeWork: string | undefined;
async function request(path:string, expected=200, method='GET', body?:object|Buffer, version?:string){
  const headers = new Headers({'x-sstar-desktop':'1'});
  if(token)headers.set('authorization','Bearer '+token);
  if(version)headers.set('x-work-meta', Buffer.from(JSON.stringify({title,description:'部署验收',version})).toString('base64'));
  const payload=Buffer.isBuffer(body)?new Uint8Array(body):body?JSON.stringify(body):undefined;
  const response=await fetch(new URL(path,base),{method,headers,body:payload,signal:AbortSignal.timeout(30000)});
  const failure = response.status === expected ? '' : (await response.text()).slice(0,250);
  assert.equal(response.status,expected,method+' '+path+' '+failure);
  return response;
}

async function measureScene(id:string,level:string,label:string){
  let bytes!:Buffer;
  const wallMs=[];
  for(let i=0;i<5;i++){
    const started=performance.now();
    const response=await request('/api/works/'+id+'/download?level='+level+'&preview=1');
    bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(response.headers.get('x-sstar-scene-preview'),'1');
    assert.equal(response.headers.get('x-design-sha256'),digest(bytes));
    wallMs.push(Math.round(performance.now()-started));
  }
  console.log(JSON.stringify({label,sceneBytes:bytes.length,wallMs}));
  return bytes;
}

try {
  assert.match(await (await request('/')).text(),/关卡社区/);
  assert.ok((await request('/app.js')).headers.get('content-type')?.includes('javascript'));
  await request('/api/works');
  const author = await (await request('/api/account/signup',200,'POST',identities)).json();
  assert.ok(author.recovery && author.token);
  token = author.token;
  work=(await (await request('/api/works',201,'POST',design.bytes,'1.0')).json()).id as string;
  const resource = '/api/works/'+work;
  await request(resource+'/cover',200,'POST',image);
  await Promise.all([
    request(resource+'/cover',200,'POST',image),
    request(resource+'/previews/one',200,'POST',image),
  ]);
  assert.deepEqual(Buffer.from(await (await request(resource+'/cover')).arrayBuffer()),image);
  assert.deepEqual(Buffer.from(await (await request(resource+'/previews/one')).arrayBuffer()),image);
  const listing=await (await request('/api/works?type=projects&q='+encodeURIComponent(suffix+' 西侧回廊 机关门'))).json();
  assert.equal(listing.works[0].id,work);
  const downloaded = await request(resource+'/download');
  assert.equal(downloaded.headers.get('x-design-sha256'),digest(design.bytes));
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),design.bytes);
  const single = Buffer.from(await (await request(resource+'/download?level=one')).arrayBuffer());
  assert.equal(parseShare(single).manifest.primaryId,'one');
  assert.equal(parseShare(single).manifest.scope,'group');
  const full=Buffer.from(image);full.writeUInt16LE(1920,26);full.writeUInt16LE(1080,28);
  const length=Buffer.alloc(4);length.writeUInt32BE(image.length);
  await request(resource+'/cover?size=full',200,'POST',Buffer.concat([length,image,full]));
  assert.deepEqual(Buffer.from(await (await request(resource+'/cover?size=full')).arrayBuffer()),full);
  const smallScene=await measureScene(work!,'one','两关工程');
  assert.equal(parseShare(smallScene).manifest.levels.length,1);
  const big={...project,levels:[project.levels[0],project.levels[1],...Array.from({length:298},(_,index)=>{
    const id='scene_'+index;
    const operations=Array.from({length:32},(_,i)=>({kind:'transform' as const,id:i+1,x:index+i,y:index,z:0,yaw:90}));
    return {id,title:'测试关卡 '+index,project:{...stage,name:id,operations}};
  })]};
  const large=encodeShare(big,'project',design.manifest.editorVersion);
  largeWork=(await (await request('/api/works',201,'POST',large.bytes,'1.0')).json()).id;
  assert.deepEqual(await measureScene(largeWork!,'one','300 关工程'),smallScene);
  console.log(JSON.stringify({fullProjectBytes:large.bytes.length,expandedProjectBytes:gunzipSync(large.bytes).length,levels:big.levels.length}));
  await request('/api/works/'+largeWork,200,'DELETE');
  largeWork=undefined;
  await request(resource,409,'PATCH',design.bytes,'1.0');
  await request(resource,200,'PATCH',design.bytes,'1.1');
  assert.equal((await (await request(resource)).json()).version,'1.1');
  await request(resource+'/report',200,'POST',{reason:'Cloudflare 验收'});
  const recovered=await (await request('/api/account/recover',200,'POST',{...identities,password:randomUUID(),recovery:author.recovery})).json();
  assert.notEqual(recovered.recovery,author.recovery);
  assert.equal((await (await request('/api/account/session')).json()).username,null);
  token=recovered.token;
  await request(resource,200,'DELETE');
  await request(resource+'/download',404);
  work=undefined;
  console.log('Cloudflare 社区验收通过，覆盖静态站点、注册、搜索、预览、完整及依赖关卡下载、更新、举报、账号恢复和下架');
} finally {
  if(largeWork&&token)await request('/api/works/'+largeWork,200,'DELETE').catch(()=>{});
  if(work && token)await request('/api/works/'+work,200,'DELETE').catch(()=>{});
}
