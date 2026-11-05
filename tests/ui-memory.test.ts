import{test}from'node:test';import assert from'node:assert/strict';
import{readAssetBrowser,readNativeBrowser,rememberScroll,restoreScroll,rememberedView}from'../src/ui-memory';
test('损坏及旧版浏览偏好安全回退；素材分类各自独立',()=>{
  for(const value of[null,[],true,'bad'])assert.equal(readAssetBrowser(value,['character','block']).active,'character');
  const m=readAssetBrowser({active:'favorites',category:'block',tabs:{character:{query:'牧师',all:true,scrollTop:500},block:{query:'石块',scrollTop:Infinity},favorites:{scrollTop:-8}}},['character','block']);
  assert.equal(m.active,'favorites');assert.equal(m.category,'block');assert.equal(m.tabs.character.query,'牧师');assert.equal(m.tabs.character.scrollTop,500);assert.equal(m.tabs.block.query,'石块');assert.equal(m.tabs.block.scrollTop,0);assert.equal(m.tabs.favorites.scrollTop,0);
  assert.equal(readAssetBrowser(m,['character','block'],true).active,'favorites');assert.equal(readAssetBrowser({...m,active:'block'},['character','block'],true).active,'filtered');
});
test('原版目录偏好保留搜索、展开及辅助场景，拒绝无效滚动值',()=>{
  const m=readNativeBrowser({query:'mirror',open:{region:true,bad:'true',closed:false},aux:true,scrollTop:620,lastLevel:'mirror_1'});
  assert.deepEqual(m,{query:'mirror',open:{region:true},aux:true,scrollTop:620,lastLevel:'mirror_1'});
  assert.equal(readNativeBrowser({scrollTop:NaN}).scrollTop,0);
});
test('缩略图列数或尺寸改变后恢复到同一物件；资源缺失和列表缩短安全夹取',()=>{
  const keys=Array.from({length:100},(_,i)=>'preset-'+i),saved=rememberScroll(keys,5,114,470);
  assert.equal(saved.anchor,'preset-20');assert.equal(restoreScroll(saved,keys,8,150,2000),314);
  assert.equal(restoreScroll(saved,keys.slice(0,10),5,114,200),200);
  assert.equal(restoreScroll(saved,[],5,114,0),0);
});
test('上次小关使用稳定 ID，已删除或无效记录回到大地图',()=>{
  const levels=[{id:'first'},{id:'last'}];assert.equal(rememberedView(levels,'last'),'last');assert.equal(rememberedView(levels,'first'),'first');
  for(const value of['deleted','world',0,null,{}])assert.equal(rememberedView(levels,value),'world');
});
