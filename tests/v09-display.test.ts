import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultDisplay,restoreSceneDisplay} from '../src/renderer/scene-display';

test('原生材质跨关恢复显示，保留关内高度、隐藏项和分类锁',()=>{
  const saved=defaultDisplay();saved.mode='range';saved.min=-4;saved.max=2;
  saved.categories.background.locked=false;saved.objects={'entity:42':{hidden:true,locked:true}};
  const before=JSON.stringify(saved),shown=restoreSceneDisplay(saved,true);
  assert.equal(shown.categories.background.visible,true);
  assert.equal(shown.categories.background.locked,false);
  assert.deepEqual(shown.objects,saved.objects);assert.equal(shown.min,-4);assert.equal(shown.max,2);
  assert.equal(JSON.stringify(saved),before);
  assert.equal(restoreSceneDisplay(shown,false).categories.background.visible,false);
});
