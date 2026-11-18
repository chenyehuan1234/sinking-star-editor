import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performanceCapture as capture,summarizePerformance} from '../src/renderer/performance-capture';

test('性能记录合并同一次选择，只在高亮已绘制后完成，并隔离旧会话回调',()=>{
  const ids=[9845174];
  assert.equal(capture.begin(),undefined);
  capture.start();
  try{
    capture.setScene('level',100,25);
    const input=capture.begin();
    capture.select(ids,input);
    capture.selectionDrawn(ids);
    capture.selectionPhase(ids,'select.list');
    capture.selectionPhase(ids,'select.inspector');
    capture.selectionPhase(ids,'select.highlight');
    capture.selectionDrawn([9845174]);
    capture.selectionDrawn(ids);
    capture.selectionDrawn(ids);
    const report=capture.stop()!;
    assert.deepEqual(report.samples.map(s=>s.phase),['select.list','select.inspector','select.highlight','select.feedback']);
    assert.equal(new Set(report.samples.map(s=>s.id)).size,1);
    assert.deepEqual(report.scenes,[{kind:'level',objects:100,cells:25}]);
    assert.ok(!JSON.stringify(report).includes('9845174'));
    capture.start();
    capture.end(input,'asset.read',{},20);
    assert.equal(capture.stop()?.samples.length,0);
    capture.clear();
    assert.equal(capture.report,null);
  }finally{capture.stop();}
});

test('P95按样本计算，计数阶段保留提交次数',()=>{
  capture.start();
  try{
    for(let i=1;i<=20;i++)capture.end(capture.begin(),'drag.frame',{category:'object'},i);
    capture.count('drag.commit',1,'object');
    capture.count('drag.commit',1,'object');
    const rows=summarizePerformance(capture.stop()!.samples);
    const drag=rows.find(row=>row.phase==='drag.frame')!;
    assert.equal(drag.count,20);
    assert.equal(drag.median,10);
    assert.equal(drag.p95,19);
    assert.equal(drag.max,20);
    assert.equal(rows.find(row=>row.phase==='drag.commit')?.totalCount,2);
  }finally{capture.stop();}
});
