import React from 'react';
import {defaultPrismColors,prismColorMask,prismColors,withPrismColors} from '../prism-settings';
import type {EditOp,EntityView} from '../shared';

const current=(entity:EntityView)=>Number(entity.nativeProperties?.find(p=>p.field.name==='p3_wand_flags')?.value??defaultPrismColors);

export function PrismInspector({entities,busy,onApply}:{entities:EntityView[];busy:boolean;onApply:(ops:EditOp[])=>void}) {
  function apply(select:(entity:EntityView)=>number) {
    onApply(entities.flatMap(entity=>{
      const previous=current(entity),next=withPrismColors(previous,select(entity));
      return next===previous?[]:[{kind:'properties',id:entity.id,values:{p3_wand_flags:next}}];
    }));
  }
  function card(entry:typeof prismColors[number]) {
    const all=entities.every(entity=>Boolean(current(entity)&entry.bit));
    const some=entities.some(entity=>Boolean(current(entity)&entry.bit));
    const last=all&&entities.some(entity=>(current(entity)&prismColorMask)===entry.bit);
    return <button type="button" key={entry.bit} aria-pressed={all?true:some?'mixed':false} disabled={busy||last} style={{'--beam':entry.color} as React.CSSProperties} onClick={()=>{
      apply(entity=>all?current(entity)&~entry.bit:current(entity)|entry.bit);
    }}>{entry.label}</button>;
  }
  return <details className="s-inspector-section" open>
    <summary>三棱镜变色范围</summary>
    <div className="s-beam-swatches">{prismColors.filter(entry=>!('advanced' in entry)).map(card)}</div>
    <details><summary>特殊原生光束</summary><div className="s-beam-swatches">{prismColors.filter(entry=>'advanced' in entry).map(card)}</div></details>
    <div className="s-paint-actions"><button type="button" disabled={busy} onClick={()=>apply(()=>defaultPrismColors)}>默认四色</button>
      <button type="button" disabled={busy} onClick={()=>apply(entity=>entity.prismPreset??defaultPrismColors)}>恢复原版预设</button></div>
  </details>;
}
