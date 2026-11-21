import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync,gzipSync} from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {community} from './app';
import {localDatabase} from './sqlite';
import {digest,encodeShare,independentDesign,parseShare,shareLevel} from '../src/core/share';
import {newWorld} from '../src/core/world';
import type {EditorProject} from '../src/shared';
import type {SharedWork} from '../src/share-types';
import {matchDirectory} from '../src/level-catalog';
import {DownloadLibrary} from '../src/main/download-library';
import {EditorService} from '../src/main/service';
import {parseEntities} from '../src/core/entities';
import {applyProject} from '../src/core/project';
import {nativeWorkbench} from '../src/native-project';
import {appendImportedLevels,fileImport,shareImport} from '../src/main/level-import';

function design(){
  const world=newWorld('a'.repeat(64),'fixture');
  world.name='机关试验场';
  const p:EditorProject={format:'sinking-star-project',version:3,sourceHash:world.sourceHash,sourceBuild:world.sourceBuild,template:'mirror_1',name:'start',operations:[]};
  world.levels=[
    {id:'start',title:'起点之门',folderId:'blue',project:{...p,operations:[{kind:'properties',id:1,values:{target_level:'ed_'+world.id+'_other'}}]}},
    {id:'other',title:'地下房间',folderId:'red',project:{...p,name:'other'}},
    {id:'solo',title:'独立镜面',project:{...p,name:'solo'}},
  ];
  world.levelGroups=[{id:'blue',title:'蓝色回廊'},{id:'red',title:'红色回廊'}];
  return world;
}
const levels=[{id:'start',title:'起点之门',requires:['other']},{id:'other',title:'地下房间'},{id:'solo',title:'独立镜面'}];

test('share scope keeps required stages, removes unrelated stages and rebinds the world namespace',()=>{
  const world=design(),whole=encodeShare(world,'project','0.11.0-beta.1',levels);
  const closure=shareLevel(world,whole.manifest,'start'),selected=parseShare(closure.bytes);
  assert.equal(selected.manifest.scope,'group');
  assert.equal(selected.manifest.primaryId,'start');
  assert.deepEqual(selected.manifest.levels.map(level=>level.id),['start','other']);
  assert.equal(selected.design.format,'sinking-star-world');
  const dependency=selected.design.levels[0].project.operations[0];
  assert.equal(dependency.kind,'properties');
  assert.equal(dependency.values.target_level,'ed_'+selected.design.id+'_other');
  const imported=independentDesign(selected.design);
  assert.equal(imported.format,'sinking-star-world');
  assert.notEqual(imported.id,selected.design.id);
  const rebound=imported.levels[0].project.operations[0];
  assert.equal(rebound.kind,'properties');
  assert.equal(rebound.values.target_level,'ed_'+imported.id+'_other');
  assert.equal(parseShare(shareLevel(world,whole.manifest,'solo').bytes).manifest.scope,'level');
  assert.equal(world.levels.length,3);
});

test('同名分组保持独立，检索可组合工程、分组和关卡名',()=>{
  const groups=[{id:'a',title:'地表'},{id:'b',title:'地表'}];
  const entries=[{id:'a1',title:'入口',groupId:'a'},{id:'b1',title:'镜面',groupId:'b'},{id:'c1',title:'其它'}];
  const both=matchDirectory(entries,groups,'地表',['原版世界']);
  assert.deepEqual(both.sections.map(group=>group.id),['a','b']);
  assert.deepEqual(matchDirectory(entries,groups,'原版 地表 镜面',['原版世界']).sections.map(group=>group.id),['b']);
  assert.equal(matchDirectory(entries,groups,'未分组').sections[0].levels[0].id,'c1');
});

test('下载库可离线重开，按作品版本复用文件',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-download-'));
  try{
    const world=design(),entry=shareLevel(world,encodeShare(world,'project','0.11.0-beta.2',levels).manifest,'start');
    const work={id:'a'.repeat(32),author:'测试作者',title:world.name,version:'1',manifest:entry.manifest} as SharedWork;
    const library=new DownloadLibrary(folder),first=await library.save(entry.bytes,work,'https://community.test','start');
    assert.equal((await library.save(entry.bytes,work,'https://community.test','start')).key,first.key);
    const reopened=new DownloadLibrary(folder);
    assert.equal((await reopened.list()).length,1);
    assert.equal(parseShare(await reopened.bytes(first.key)).manifest.primaryId,'start');
    const signature=await library.signature(first.key),thumb={image:'data:image/webp;base64,AAAA',fallback:false};
    await library.thumbnailSave(first.key,thumb,signature);
    assert.deepEqual(await reopened.thumbnail(first.key),thumb);
    const next=await library.save(entry.bytes,{...work,version:'2'},'https://community.test','start');
    assert.notEqual(next.key,first.key);
    assert.equal(await reopened.thumbnail(next.key),null);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('使用原生出口验证跨工程导入的引用，并能读取旧的单关工程',{skip:!process.env.SINKING_STAR_GAME},async()=>{
  const engine=new EditorService(path.resolve('workspace')),game=await engine.connect(process.env.SINKING_STAR_GAME!);
  const source=newWorld(game.sourceHash,game.build),records=parseEntities(engine.pkg.get('data-common/mirror_1.entities')).records;
  const door=records.find(record=>record.type==='Door')!;
  assert.ok(door);
  const p:EditorProject={format:'sinking-star-project',version:3,sourceHash:game.sourceHash,sourceBuild:game.build,
    template:'mirror_1',name:'origin',operations:[{id:door.id,kind:'properties',values:{target_level:'ed_'+source.id+'_destination'}}]};
  source.levels.push({id:'origin',title:'依赖入口',project:p},{id:'destination',title:'依赖目标',project:{...p,name:'destination',operations:[]}});
  const pack=encodeShare(source,'project','0.11.0-beta.2',[{id:'origin',title:'依赖入口',requires:['destination']},{id:'destination',title:'依赖目标'}]);
  const payload=shareImport(shareLevel(source,pack.manifest,'origin').bytes);
  const standard=newWorld(game.sourceHash,game.build);
  const native=nativeWorkbench({format:'sinking-star-native-world',version:4,id:'0'.repeat(12),base:'overworld',name:'原版样本',sourceHash:game.sourceHash,sourceBuild:game.build,edits:{},levelEdits:{},assignments:[]},await engine.nativeIndex());
  for(const target of [standard,native]){
    const count=target.levels.length,next=await appendImportedLevels(engine,target,payload);
    assert.equal(next.project.levels.length,count+2);
    assert.equal(target.levels.length,count);
    const [origin,destination]=next.project.levels.slice(count);
    assert.equal(next.primary,origin.id);
    const compiled=applyProject(engine.pkg,origin.project,engine.codec);
    assert.equal(engine.codec!.get(compiled.records.find(record=>record.id===door.id)!,'target_level'),
      target.native?destination.id:'ed_'+target.id+'_'+destination.id);
    const repeated=await appendImportedLevels(engine,next.project,payload);
    assert.notEqual(repeated.primary,next.primary);
  }
  const former=newWorld(game.sourceHash,game.build),folder=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-single-'));
  try{
    former.levels=[source.levels[1]];
    const file=path.join(folder,'旧单关.sstar-world.json');await fs.writeFile(file,JSON.stringify(former));
    assert.equal((await fileImport(file)).primary,'destination');
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('malformed gzip, modified checksums and local-only fields are rejected',()=>{
  const world=design(),bundle=encodeShare(world,'project','0.11.0-beta.1',levels);
  assert.throws(()=>parseShare(bundle.bytes.subarray(0,30)),/无法解压/);
  const payload=JSON.parse(gunzipSync(bundle.bytes).toString());
  payload.manifest.sha256='0'.repeat(64);
  assert.throws(()=>parseShare(gzipSync(JSON.stringify(payload))),/校验值/);
  const contaminated={...world,workspacePath:'E:/private'};
  assert.throws(()=>encodeShare(contaminated,'project','0.11.0-beta.1'),/不支持的字段/);
});

test('community serves guest search and downloads and enforces author ownership and recovery',{timeout:10000},async()=>{
  const db=localDatabase(),objects=new Map<string,Buffer>();
  let onWrite:(()=>Promise<void>)|undefined;
  const api=community(db,{
    get:async key=>objects.get(key)??null,
    size:async key=>objects.get(key)?.length??null,
    put:async(key,bytes)=>{objects.set(key,bytes);await onWrite?.();},
    remove:async key=>{objects.delete(key);},
  });
  const call=(route:string,method='GET',input?:unknown,token='',meta?:unknown)=>{
    const headers:Record<string,string>={'x-sstar-desktop':'1'};
    if(token)headers.authorization='Bearer '+token;
    if(meta)headers['x-work-meta']=Buffer.from(JSON.stringify(meta)).toString('base64');
    if(input!==undefined&&!Buffer.isBuffer(input))headers['content-type']='application/json';
    return api(new Request('http://example.test/api/'+route,{method,headers,body:input===undefined?undefined:Buffer.isBuffer(input)?new Uint8Array(input):JSON.stringify(input)}));
  };
  try{
    const identity={username:'谜题作者',password:'local fixture password'},created=await call('account/signup','POST',identity);
    assert.equal(created.status,200);
    const {token,recovery}=await created.json();
    assert.ok(token&&recovery);
    const packed=encodeShare(design(),'project','0.11.0-beta.1',levels);
    const legacy=JSON.parse(gunzipSync(packed.bytes).toString());
    delete legacy.manifest.groups;
    const bundle=gzipSync(JSON.stringify(legacy)),meta={title:'地图 Ａ',description:'三个机关谜题',version:'1.0'};
    assert.equal((await call('works','POST',bundle,'',meta)).status,401);
    assert.equal((await call('works','POST',Buffer.alloc(22),token,meta)).status,400);
    const published=await call('works','POST',bundle,token,meta);
    assert.equal(published.status,201);
    const {id}=await published.json();
    const query=encodeURIComponent('地下房间');
    assert.equal((await (await call('works?q='+query)).json()).works[0].id,id);
    assert.equal((await (await call('works?q='+encodeURIComponent('红色回廊 地下房间'))).json()).works[0].id,id);
    assert.equal((await (await call('works?q='+encodeURIComponent('蓝色回廊 地下房间'))).json()).works.length,0);
    assert.equal((await (await call('works?q='+encodeURIComponent('红色回廊'))).json()).works[0].manifest.groups.length,2);
    assert.equal((await (await call('works?q='+encodeURIComponent('地图 a 红色回廊'))).json()).works[0].id,id);
    assert.equal((await (await call('works?type=level')).json()).works.length,0);
    assert.equal((await call('works?mine=1')).status,401);
    assert.deepEqual((await (await call('works?mine=1','GET',undefined,token)).json()).works.map((work:{id:string})=>work.id),[id]);
    const other=await (await call('account/signup','POST',{...identity,username:'另一位作者'})).json();
    assert.equal((await (await call('works?mine=1','GET',undefined,other.token)).json()).works.length,0);
    const download=await call('works/'+id+'/download?level=start'),bytes=Buffer.from(await download.arrayBuffer());
    assert.equal(download.headers.get('x-design-sha256'),digest(bytes));
    assert.equal(parseShare(bytes).manifest.scope,'group');
    const scene=await call('works/'+id+'/download?level=start&preview=1'),sceneBytes=Buffer.from(await scene.arrayBuffer());
    assert.equal(scene.headers.get('x-sstar-scene-preview'),'1');
    assert.equal(scene.headers.get('x-sstar-work-content'),packed.manifest.sha256);
    assert.equal(scene.headers.get('x-design-sha256'),digest(sceneBytes));
    assert.equal(parseShare(sceneBytes).manifest.scope,'level');
    assert.equal(parseShare(sceneBytes).manifest.levels.length,1);
    assert.deepEqual(Buffer.from(await (await call('works/'+id+'/download')).arrayBuffer()),bundle);
    const info={title:'改名后的地图',description:'更新后的简介',tags:['光学','推箱子','光学']};
    assert.equal((await call('works/'+id,'PATCH',info,other.token)).status,403);
    assert.equal((await call('works/'+id,'PATCH',info,token)).status,200);
    const updated=(await (await call('works?q='+encodeURIComponent(info.title))).json()).works[0];
    assert.equal(updated.description,info.description);
    assert.equal(updated.version,meta.version);
    assert.deepEqual(updated.tags,['光学','推箱子']);
    assert.equal((await (await call('works?tag='+encodeURIComponent('光学'))).json()).works[0].id,id);
    assert.equal((await (await call('works?q='+encodeURIComponent('推箱子'))).json()).works[0].id,id);
    assert.equal((await call('works/'+id,'PATCH',{...info,tags:['三'.repeat(25)]},token)).status,400);
    assert.equal((await call('works','POST',bytes,token,{...meta,version:'group'})).status,400);
    assert.deepEqual(Buffer.from(await (await call('works/'+id+'/download')).arrayBuffer()),bundle);
    const png=Buffer.from('fake');
    assert.equal((await call('works/'+id+'/cover','POST',png,token)).status,400);
    const image=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');
    const large=Buffer.from(image);large.writeUInt16LE(1920,26);large.writeUInt16LE(1080,28);
    const length=Buffer.alloc(4);length.writeUInt32BE(image.length);
    const images=Buffer.concat([length,image,large]),cover='works/'+id+'/cover';
    const oversize=Buffer.from(large);oversize.writeUInt16LE(1081,28);
    assert.equal((await call(cover+'?size=full','POST',Buffer.concat([length,image,oversize]),token)).status,400);
    assert.equal((await call(cover+'?size=full','POST',images,other.token)).status,403);
    assert.equal((await call(cover+'?size=full','POST',images,token)).status,200);
    assert.deepEqual(Buffer.from(await (await call(cover)).arrayBuffer()),image);
    assert.deepEqual(Buffer.from(await (await call(cover+'?size=full')).arrayBuffer()),large);
    assert.equal((await call(cover,'POST',image,token)).status,200);
    assert.deepEqual(Buffer.from(await (await call(cover+'?size=full')).arrayBuffer()),image);
    assert.equal((await call('works/'+id+'/report','POST',{reason:'需检查的测试内容'})).status,200);
    assert.equal((await call('works/'+id,'PATCH',bundle,'',meta)).status,403);
    assert.equal((await call('works/'+id,'PATCH',bundle,token,meta)).status,409);
    assert.equal(objects.size,2);
    // Block both uploads at the same point so they try to publish from the same version.
    let writes=0,release!:()=>void;
    const barrier=new Promise<void>(resolve=>{release=resolve;});
    onWrite=async()=>{if(++writes===2)release();await barrier;};
    const competing=await Promise.all(['1.1','1.1'].map(version=>call('works/'+id,'PATCH',bundle,token,{...meta,version})));
    onWrite=undefined;
    assert.deepEqual(competing.map(response=>response.status).sort(),[200,409]);
    assert.equal(objects.size,3);
    assert.equal((await db.query<{value:number}>('SELECT value FROM storage_usage'))[0].value,bundle.length*2+image.length);
    assert.equal((await (await call('works/'+id)).json()).version,'1.1');
    await db.query('UPDATE storage_usage SET value=891289600');
    assert.equal((await call('works','POST',bundle,token,{...meta,version:'2.0'})).status,429);
    assert.equal((await db.query<{count:number}>('SELECT count(*) AS count FROM works'))[0].count,1);
    assert.equal(objects.size,3);
    const reset={...identity,password:'rotated fixture password',recovery};
    const resetResponse=await call('account/recover','POST',reset);
    assert.equal(resetResponse.status,200);
    const next=await resetResponse.json();
    assert.notEqual(next.recovery,recovery);
    assert.equal((await call('account/recover','POST',reset)).status,401);
    assert.equal((await call('works/'+id,'DELETE',undefined,token)).status,403);
    assert.equal((await call('works/'+id,'DELETE',undefined,next.token)).status,200);
    assert.equal((await (await call('works?mine=1','GET',undefined,next.token)).json()).works.length,0);
    assert.equal((await call('works/'+id+'/download')).status,404);
  }finally{await db.close();}
});
