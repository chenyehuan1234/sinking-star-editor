import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {GamePackage} from '../src/core/package';import {ExeReflection} from '../src/core/reflection';import {PropertyCodec} from '../src/core/properties';import {parseEntities,writeEntities} from '../src/core/entities';import {applyCamera,cameraView} from '../src/core/camera';import {blankFile} from '../src/core/blank';import type {CameraConfig} from '../src/shared';
const root=process.env.SINKING_STAR_GAME??'',available=fs.existsSync(root+'/sinking_star.exe'),pkg=available?new GamePackage(fs.readFileSync(root+'/data/levels.package')):null,codec=available?new PropertyCodec(new ExeReflection(fs.readFileSync(root+'/sinking_star.exe'))):null;
for(const name of['green_metamirror','skipping_near_beams_v2','annoying_orange_v3'])test(name+'：分屏保存重开只改指定相机及设置，不改地形、循环或区域引用',{skip:!available},()=>{
 const source=pkg!.get('data-common/'+name+'.entities'),file=parseEntities(source);applyCamera(codec!,file,undefined,pkg!);assert.deepEqual(writeEntities(file),source);
 const view=cameraView(codec!,file),primary=view.controls.find(c=>c.primary&&!c.overview)!,config:CameraConfig={mode:'screens',origin:[-3,-4],screenSize:[10,8],controls:[{id:primary.id,upDistance:24,southDistance:9,fov:48}]},before=JSON.stringify(config),settings=file.records.find(r=>r.type==='Settings')!;
 const keys=['grid.corner.x','grid.corner.y','grid.corner.z','grid.squares_x','grid.squares_y','squares_z','grid.wrapping'],topology=keys.map(k=>codec!.get(settings,k));
 applyCamera(codec!,file,JSON.parse(JSON.stringify(config)),pkg!);const updated=cameraView(codec!,file);assert.deepEqual(updated.origin,[-3,-4]);assert.deepEqual(updated.screenSize,[10,8]);assert.equal(updated.controls.find(c=>c.id===primary.id)!.upDistance,24);assert.deepEqual(keys.map(k=>codec!.get(file.records.find(r=>r.id===settings.id)!,k)),topology);
 for(const r of parseEntities(source).records)if(r.id!==primary.id&&r.type!=='Settings')assert.deepEqual(file.records.find(v=>v.id===r.id)!.diff,r.diff,'原生记录 #'+r.id);
 assert.deepEqual(updated.references,view.references);assert.deepEqual(updated.regions,view.regions);assert.equal(JSON.stringify(config),before);
 const reopened=parseEntities(source);applyCamera(codec!,reopened,config,pkg!);assert.deepEqual(writeEntities(reopened),writeEntities(file));
});
test('多高度未知目标禁止隐式用第一名角色，显式取点可构建；自身引用不覆盖镜头位置',{skip:!available},()=>{
 const file=blankFile(pkg!,codec!,16,16),hero=file.records.find(r=>r.type==='Guy')!,camera=file.records.find(r=>r.type==='Camera_Control')!;file.records.push(codec!.patch({...hero,id:hero.id+100000},{'position.z':30}));
 assert.throws(()=>applyCamera(codec!,file,{mode:'single',controls:[{id:camera.id,upDistance:25}]},pkg!),/观察高度未确认/);
 const index=file.records.findIndex(r=>r.id===camera.id);file.records[index]=codec!.patch(file.records[index],{position_id:0,look_at_id:camera.id});
 applyCamera(codec!,file,{mode:'single',controls:[{id:camera.id,target:[4,5,0],upDistance:18,southDistance:8,yaw:0}]},pkg!);const r=file.records.find(r=>r.id===camera.id)!;assert.equal(codec!.get(r,'position.z'),18);assert.equal(codec!.get(r,'position.y'),-3);assert.equal(codec!.get(r,'look_at_id'),camera.id);
});
