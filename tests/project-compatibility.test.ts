import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {rebindSource} from '../src/core/compatibility';
import {compatiblePreview} from '../src/core/compatible-preview';
import {parseEntities} from '../src/core/entities';
import {UnifiedNativeWorldEngine} from '../src/core/native-world-v5';
import {applyProject} from '../src/core/project';
import {newWorld,WorldCompiler} from '../src/core/world';
import {EditorService} from '../src/main/service';
import type {EditorProject} from '../src/shared';
import type {NativeWorldProject} from '../src/v08-types';

const install=process.env.SINKING_STAR_GAME;
const available=!!install&&fs.existsSync(path.join(install,'sinking_star.exe'));

test('旧工程允许用不同版本打开，个别历史冲突保留为可定位提示',{skip:!available},async()=>{
 const service=new EditorService(fs.mkdtempSync(path.join(os.tmpdir(),'sstar-compatibility-')));
 await service.connect(install!);
 const original=newWorld('a'.repeat(64),'unknown');
 const file=parseEntities(service.pkg.get('data-common/mirror_1.entities'));
 const hero=file.records.find(r=>r.type==='Guy'&&service.codec!.parse(r).complete)!;
 const project:EditorProject={format:'sinking-star-project',version:3,name:'scene',template:'mirror_1',sourceHash:original.sourceHash,sourceBuild:original.sourceBuild,
  operations:[{kind:'delete',id:0xffffffff},{kind:'transform',id:hero.id,position:[3,4,2]}]};
 original.levels=[{id:'scene',title:'关卡',project}];
 original.sourceEvidence={schema:'older',files:{'data-common/unavailable.entities':'old'}};
 const before=JSON.stringify(original),world=await service.adaptWorld(original);
 assert.equal(JSON.stringify(original),before);
 assert.equal(world.sourceBuild,service.build);
 assert.deepEqual(world.levels[0].project.operations,project.operations);
 const scene=world.levels[0].project,codec=service.codec!;
 const preview=compatiblePreview(scene,candidate=>applyProject(service.pkg,candidate,codec));
 assert.equal(codec.get(preview.records.find(r=>r.id===hero.id)!,'position.x'),3);
 assert.match(preview.replayIssues![0],/修改 1.*4294967295/);
 assert.throws(()=>applyProject(service.pkg,scene,codec),/4294967295/);
 const missing=compatiblePreview({...scene,template:'missing_old_template'},candidate=>applyProject(service.pkg,candidate,codec));
 assert.match(missing.replayIssues![0],/missing_old_template/);
 assert.equal(world.levels.length,1);
 assert.ok(new WorldCompiler(service.pkg,codec).previewMap(world).records.length);
});

test('原版世界兼容预览保留冲突操作，恢复后的场景不得悄悄写入原生包',{skip:!available},async()=>{
 const service=new EditorService(fs.mkdtempSync(path.join(os.tmpdir(),'sstar-native-compat-')));
 await service.connect(install!);
 const engine=new UnifiedNativeWorldEngine(service.pkg,service.codec!,service.sourceHash,service.build);
 const original:NativeWorldProject={format:'sinking-star-native-world',version:5,base:'overworld',
  id:'0123456789ab',name:'旧世界',sourceHash:'a'.repeat(64),sourceBuild:'unknown',
  edits:{},levelEdits:{},assignments:[],scenes:[],operations:[{kind:'delete',id:0xffffffff}]};
 const project=rebindSource(original,service.sourceHash,service.build);
 assert.ok(engine.index(project).entryCount);
 const region=engine.region({project,session:project.id,revision:1,cellId:'world',bounds:{min:[0,0,-3],max:[8,8,4]}});
 assert.match(region.view.replayIssues![0],/4294967295/);
 assert.deepEqual(project.operations,original.operations);
 assert.throws(()=>engine.build(project),/4294967295/);
 const compatible=await service.adaptNativeWorld({...original,operations:[]});
 assert.equal(compatible.sourceHash,service.sourceHash);
 assert.ok(compatible.scenes!.length);
 await (service as any).previews?.dispose();
});
