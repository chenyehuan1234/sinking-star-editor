import React from 'react';
import {levelSettingsFields,timingFields,type LevelSetting,type LevelSettings} from '../level-settings';
import {BufferInput} from './studio-inspector';

export interface LevelSettingsProps {
  values?:LevelSettings;
  overrides:LevelSettings;
  change:(field:LevelSetting,value?:number)=>void;
  disabled?:boolean;
}

function SettingField({field,values,overrides,change,disabled}:LevelSettingsProps&{field:LevelSetting}) {
  const definition=levelSettingsFields[field];
  const value=overrides[field]??values?.[field];
  const [error,setError]=React.useState('');
  if(value===undefined)return null;
  return <div className="s-level-setting">
    <label className="s-field">{definition.label} {definition.unit&&<small>{definition.unit}</small>}
      <BufferInput label={definition.label} disabled={disabled} step=".01" value={value<0?'':String(Number(value.toFixed(4)))} onCommit={text=>{
        const n=Number(text);
        if(!Number.isFinite(n)||n<definition.min||n>definition.max){
          setError(`请输入 ${definition.min} 到 ${definition.max}`);
          return;
        }
        setError('');
        change(field,n);
      }}/>
    </label>
    {overrides[field]!==undefined?<button type="button" disabled={disabled} aria-label={'恢复模板'+definition.label} onClick={()=>{setError('');change(field);}}>恢复模板</button>:
      <small>{value<0?'模板自动':'模板值'}</small>}
    {error&&<small className="s-error" role="alert">{error}</small>}
  </div>;
}

export function TimingControls(props:LevelSettingsProps) {
  if(!props.values)return null;
  return <details className="s-inspector-section">
    <summary>玩法时序</summary>
    <p className="s-muted">移动间隔越短，移动越快。</p>
    {timingFields.map(field=><SettingField key={field} field={field} {...props}/>)}
    <details><summary>高级</summary><SettingField field="lilyStart" {...props}/></details>
  </details>;
}

export function RoomPowerControls(props:LevelSettingsProps) {
  if(props.values?.roomGlow===undefined)return null;
  return <details className="s-inspector-section">
    <summary>房间通电高亮</summary>
    <SettingField field="roomGlow" {...props}/>
    <button type="button" className="s-text-button" disabled={props.disabled} onClick={()=>props.change('roomGlow',.7)}>西 1 风格 · 0.7</button>
    <p className="s-muted">在布局中选中房间可预览。启用时使用原版聚光效果，亮边由房间供电触发。</p>
    <details><summary>地下高亮</summary><SettingField field="lowerRoomDimming" {...props}/></details>
  </details>;
}
