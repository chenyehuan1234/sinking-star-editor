import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configureGate,gateDraft,resolveGate} from '../src/gate-config';
import {assetFamilies} from '../src/asset-variants';
import type {ObjectCatalog,ObjectPreset} from '../src/catalog-types';

function fixture(){
 const make=(digit:string,mesh:string,height:number,reverse=false):ObjectPreset=>({key:digit.repeat(24),type:'Gate',mesh:'GAME_SOKO_Gate_Glyph_A'+mesh,materials:['',''],values:{height,negate_direction:reverse},signature:{height,negate_direction:reverse,sideways:mesh==='_Side'},label:'门闸',category:'mechanism',template:'gate_'+digit,sourceId:1,tags:[],parsed:true,placement:'single',verification:'native-data'});
 const presets=[make('a','_Down_Short',1),make('b','',1,true),make('c','_Down',1.5),make('d','_Side',1)];
 const catalog:ObjectCatalog={version:1,schemaRevision:3,sourceHash:'a'.repeat(64),exeHash:'b'.repeat(64),build:'fixture',generatedAt:'',presets,types:[],totals:{levels:0,entities:0,types:0,meshes:0,textures:0,presets:4}};
 return{catalog,presets};
}
test('门闸外观朝向与开合反转分开，反转不再替换朝上或朝下模型',()=>{
 const {catalog,presets}=fixture(),before=JSON.stringify(catalog);
 for(const p of presets)for(const reverse of [false,true]){const draft={...gateDraft(p),negate_direction:reverse,flavor:'9007199254740993'},configured=configureGate(catalog,p,draft);assert.equal(configured.mesh,p.mesh);assert.equal(configured.placementValues?.flavor,draft.flavor);assert.equal(configured.placementValues?.negate_direction,reverse);assert.equal(resolveGate(catalog,configured.key)?.mesh,p.mesh);}
 assert.equal(JSON.stringify(catalog),before);
});
test('明确改外观才切换原生模型，旧配置键不带外观字段仍能读取',()=>{
 const {catalog,presets}=fixture(),down=presets[0],draft={...gateDraft(down),appearance:'up' as const,notted:true,flavor:'17'};
 const up=configureGate(catalog,down,draft);assert.equal(up.mesh,presets[1].mesh);assert.equal(up.placementValues?.notted,true);assert.equal(up.placementValues?.flavor,'17');
 const legacy=gateDraft(presets[1]);delete legacy.appearance;const key='gate-config:'+encodeURIComponent(JSON.stringify({key:presets[1].key,draft:legacy}));assert.equal(resolveGate(catalog,key)?.mesh,presets[1].mesh);
 const onlyDown={...catalog,presets:[down]};assert.throws(()=>configureGate(onlyDown,down,draft),/没有已验证/);assert.equal(assetFamilies(onlyDown)[0].variants.length,1);assert.ok(assetFamilies(onlyDown).every(f=>!f.unavailable));
});
