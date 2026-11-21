import React, {useMemo} from 'react';
import type {LevelView} from '../shared';
import {categoryOf, type SceneDisplay} from './scene-display';
import {BufferInput} from './studio-inspector';

type Props = {
  value: SceneDisplay;
  level?: LevelView;
  onChange: (value: SceneDisplay) => void;
  onOverview?: () => void;
  presets?: {title: string; min: number; max: number}[];
};

export function WorldRange({value, onChange, onOverview, presets, level}: Props) {
  const bounds = useMemo(() => {
    let min = Infinity, max = -Infinity;
    function add(z: number) {
      if (Number.isFinite(z)) {
        min = Math.min(min, z);
        max = Math.max(max, z);
      }
    }
    for (const tile of level?.terrain ?? []) add(tile.z);
    for (const water of level?.waters ?? []) add(water.gridZ ?? water.z);
    for (const entity of level?.entities ?? []) {
      if (entity.position && ['character', 'monster', 'mechanism'].includes(categoryOf(entity))) add(entity.position[2]);
    }
    return Number.isFinite(min) ? {min: Math.floor(min), max: Math.ceil(max)} : {min: 0, max: 0};
  }, [level]);

  function choose(mode: string) {
    const preset = presets?.find(item => item.title === mode);
    if (preset) onChange({...value, mode: 'range', min: preset.min, max: preset.max, upper: 'hide'});
    else if (mode === 'all') onChange({...value, mode});
    else if (mode === 'range') {
      const firstRange = !onOverview && !value.rangeSet && value.mode !== 'range' && !value.min && !value.max;
      onChange({...value, ...(firstRange ? bounds : {}), mode, rangeSet: true, upper: 'hide'});
    }
  }

  return <div className="s-native-range09" aria-label={onOverview ? '大世界显示高度范围' : '小关显示高度范围'}>
    <select aria-label="高度显示方式" title="筛选画布显示的高度层" value={value.mode} onChange={e => choose(e.target.value)}>
      <option value="all">全部高度</option>
      {value.mode === 'current' && <option value="current">当前高度</option>}
      <option value="range">Z 范围</option>
      {presets?.map(p => <option value={p.title} key={p.title}>{p.title}</option>)}
    </select>
    {value.mode === 'range' && (['min', 'max'] as const).map(key =>
      <label key={key}>{key === 'min' ? '从' : '到'} <BufferInput label={key === 'min' ? '显示最低 Z' : '显示最高 Z'}
        value={String(value[key])} step="1" onCommit={()=>{}} onPreview={text => {
          const height = Number(text);
          if (Number.isFinite(height) && value[key] !== height) onChange({...value, [key]: height});
        }}/></label>)}
    {onOverview && <button onClick={onOverview}>完整概览</button>}
  </div>;
}
