import{test}from'node:test';import assert from'node:assert/strict';import{quarterTurn,rotationCenter,nativeQuaternion}from'../src/editor-math';import type{EntityView,Vec3}from'../src/shared';
const object=(id:number,p:Vec3,type='Gate')=>({id,type,position:p,rotation:[0,0,0,1]}as EntityView);
const near=(actual:number[],expected:number[])=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10,`${actual} != ${expected}`));
test('快转保留单物件位置和原有倾斜，正反向相互还原',()=>{
  const e=object(1,[3,7,2]);e.rotation=[Math.SQRT1_2,0,0,Math.SQRT1_2];const before=structuredClone(e),op=quarterTurn([e])[0];assert.equal(op.kind,'transform');if(op.kind!=='transform')return;assert.deepEqual(op.position,e.position);near(op.rotation!,nativeQuaternion(90,e.rotation));const back=quarterTurn([{...e,rotation:op.rotation}],-1)[0];assert.equal(back.kind,'transform');if(back.kind==='transform')near(back.rotation!,e.rotation);assert.deepEqual(e,before);
});
test('多选绕共同格点整体旋转，保留相对距离、高度、ID且不修改输入',()=>{
  const input=[object(10,[-3,0,1]),object(11,[0,1,4]),object(12,[-1,-1,2])],before=structuredClone(input),ops=quarterTurn(input);assert.equal(ops.length,3);const after=ops.map((op,i)=>{assert.equal(op.kind,'transform');if(op.kind!=='transform')throw Error();assert.equal(op.id,input[i].id);assert.equal(op.position![2],input[i].position![2]);assert.ok(op.position!.every(Number.isInteger));return{...input[i],position:op.position!,rotation:op.rotation};});
  const distance=(a:EntityView,b:EntityView)=>Math.hypot(a.position![0]-b.position![0],a.position![1]-b.position![1]);assert.equal(distance(after[0],after[1]),distance(input[0],input[1]));const back=quarterTurn(after,-1,true,rotationCenter(input));back.forEach((op,i)=>{if(op.kind!=='transform')throw Error();assert.deepEqual(op.position,input[i].position);near(op.rotation!,input[i].rotation!);});assert.deepEqual(input,before);
});
test('不旋转轴对齐体素和水格，混选时整个操作拒绝',()=>{
  for(const type of['Wall_Set','Ocean_Map'])assert.throws(()=>quarterTurn([object(1,[0,0,0]),object(2,[1,0,0],type)]),/轴对齐/);assert.deepEqual(quarterTurn([]),[]);
});
