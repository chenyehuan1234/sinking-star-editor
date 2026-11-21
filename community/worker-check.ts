import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
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

let token = '', work: string | undefined;
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
  if(work && token)await request('/api/works/'+work,200,'DELETE').catch(()=>{});
}
