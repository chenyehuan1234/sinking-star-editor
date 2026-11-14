import {gateForceValues,gateForceAppearance} from '../src/gate-appearance';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configureGate,gateDraft,gateLibraryDraft,resolveGate} from '../src/gate-config';
import {gateColorValues,gateColors,gateLibraryColors,gateColorCorrections} from '../src/gate-library';
import type {EntityView} from '../src/shared';
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
 const legacy=gateDraft(presets[1]);delete legacy.appearance;delete legacy.colors;const key='gate-config:'+encodeURIComponent(JSON.stringify({key:presets[1].key,draft:legacy}));assert.equal(resolveGate(catalog,key)?.mesh,presets[1].mesh);
 const onlyDown={...catalog,presets:[down]};assert.throws(()=>configureGate(onlyDown,down,draft),/没有已验证/);assert.equal(assetFamilies(onlyDown)[0].variants.length,1);assert.ok(assetFamilies(onlyDown).every(f=>!f.unavailable));
});
test('同色四款绑定同一原生染色，预览、配置键和落地覆盖均携带颜色',()=>{
 const {catalog,presets}=fixture(),gold=[.88,.37,.014,1,1,1,1,1],blue=[.03,.18,.81,1,1,1,1,1];
 presets[0].values={...presets[0].values,...gateColorValues(gold)};
 for(const p of presets.slice(1))p.values={...p.values,...gateColorValues(blue)};
 const before=JSON.stringify(catalog);
 for(const p of presets){const draft=gateLibraryDraft(catalog,p,{...gateDraft(p),colors:blue,flavor:'17'}),configured=configureGate(catalog,p,draft);assert.deepEqual(draft.colors,gold);assert.deepEqual(gateColors(configured),gold);assert.deepEqual(configured.placementValues,{...gateColorValues(gold),...gateForceValues(gateForceAppearance(presets[0].values)),height:draft.height,sideways:draft.sideways,negate_direction:draft.negate_direction,notted:draft.notted,open:draft.open,flavor:'17'});assert.deepEqual(gateColors(resolveGate(catalog,configured.key)!),gold);}
 assert.deepEqual(gateLibraryColors(catalog,presets[1]),gold);assert.equal(JSON.stringify(catalog),before);
});
test('历史配置没有颜色覆盖时保留原始染色，新配置切换外观不串色',()=>{
 const {catalog,presets}=fixture(),gold=[.88,.37,.014,1,1,1,1,1],blue=[.03,.18,.81,1,1,1,1,1];
 presets[0].values={...presets[0].values,...gateColorValues(gold)};presets[1].values={...presets[1].values,...gateColorValues(blue)};
 const old=gateDraft(presets[1]);delete old.colors;const key='gate-config:'+encodeURIComponent(JSON.stringify({key:presets[1].key,draft:old}));assert.deepEqual(gateColors(resolveGate(catalog,key)!),blue);
 const draft=gateLibraryDraft(catalog,presets[0]),up=configureGate(catalog,presets[0],{...draft,appearance:'up'}),side=configureGate(catalog,up,{...gateDraft(up),sideways:true});assert.deepEqual(gateColors(up),gold);assert.deepEqual(gateColors(side),gold);assert.equal(side.mesh,presets[3].mesh);
});
test('恢复已有门闸颜色只生成染色修改，保留频道、身份及原对象',()=>{
 const {catalog,presets}=fixture(),gold=[.88,.37,.014,1,1,1,1,1];presets[0].values={...presets[0].values,...gateColorValues(gold)};
 const entity={id:42,type:'Gate',mesh:presets[1].mesh,materials:[],editable:true,tint:[.03,.18,.81],nativeProperties:[{field:{name:'flavor'},value:'9007199254740993'}]} as unknown as EntityView,before=JSON.stringify(entity),ops=gateColorCorrections(catalog,[entity]);
 assert.deepEqual(ops,[{kind:'properties',id:42,values:{...gateColorValues(gold),...gateForceValues(gateForceAppearance(presets[0].values))}}]);assert.equal(JSON.stringify(entity),before);
 assert.deepEqual(gateColorCorrections(catalog,[{...entity,tint:gold.slice(0,3) as [number,number,number]}]),[]);assert.deepEqual(gateColorCorrections(catalog,[{...entity,editable:false}]),[]);
});

test('活动门体颜色独立于底座和频道，四形态写入一致并能修复仅门体串色',()=>{const {catalog,presets}=fixture();const purple={color:[.7,.07,1,.7],brightness:2},gold={color:[1,.69,.14,.7],brightness:1.75};presets[0].values={...presets[0].values,...gateForceValues(purple)};for(const p of presets.slice(1))p.values={...p.values,...gateForceValues(gold)};for(const p of presets){const configured=configureGate(catalog,p,{...gateLibraryDraft(catalog,p),flavor:'9223372036854775807'});assert.deepEqual(gateForceAppearance(configured.placementValues!),purple);assert.equal(configured.placementValues!.flavor,'9223372036854775807');assert.deepEqual(resolveGate(catalog,configured.key)?.placementValues,configured.placementValues);}const entity={id:42,type:'Gate',editable:true,mesh:presets[1].mesh,materials:[],tint:[1,1,1],nativeProperties:Object.entries(gateForceValues(gold)).map(([name,value])=>({field:{name},value}))} as unknown as EntityView;assert.equal(gateColorCorrections(catalog,[entity]).length,1);const draft=gateDraft(presets[1]);delete draft.forceField;const legacy=resolveGate(catalog,'gate-config:'+encodeURIComponent(JSON.stringify({key:presets[1].key,draft})))!;assert.deepEqual(gateForceAppearance(legacy.values),gold);assert.ok(!Object.hasOwn(legacy.placementValues!,'force_field_color.x'));});
