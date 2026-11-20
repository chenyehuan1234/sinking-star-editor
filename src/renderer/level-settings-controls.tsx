import React from 'react';
import {levelSettingsFields,timingFields,type LevelSetting,type LevelSettings,type LevelSettingsView} from '../level-settings';
import {roomBoundaryOpacity} from '../room-power';
import {BufferInput} from './studio-inspector';
import {IconButton} from './studio-ui';

export interface LevelSettingsProps {
  values?:LevelSettingsView;
  overrides:LevelSettings;
  change:(field:LevelSetting,value?:number)=>void;
  disabled?:boolean;
}

function SettingField({field,values,overrides,change,disabled}:LevelSettingsProps&{field:LevelSetting}) {
  const definition=levelSettingsFields[field];
  const value=overrides[field]??values?.[field];
  const custom=overrides[field]!==undefined;
  const [error,setError]=React.useState('');
  if(value===undefined)return null;
  const label=field==='roomGlow'?'亮边强度':definition.label;
  return <div className="s-level-setting" data-custom={custom}>
    <span className="s-level-setting-label" title={custom?'已修改':value<0?'模板自动':'沿用模板'}>{label}</span>
    {custom&&<IconButton icon="refresh" label={'恢复模板'+label} disabled={disabled} onClick={()=>{setError('');change(field);}}/>}
    <span className="s-level-setting-number">
      <BufferInput label={label} disabled={disabled} step=".01" value={value<0?'':String(Number(value.toFixed(4)))} onCommit={text=>{
        const n=Number(text);
        if(!Number.isFinite(n)||n<definition.min||n>definition.max){
          setError(`请输入 ${definition.min} 到 ${definition.max}`);
          return;
        }
        setError('');
        change(field,n);
      }}/>
      {definition.unit&&<span aria-hidden="true">{definition.unit}</span>}
    </span>
    {error&&<small className="s-error" role="alert">{error}</small>}
  </div>;
}

export function TimingControls(props:LevelSettingsProps) {
  if(!props.values)return null;
  return <details className="s-inspector-section">
    <summary>玩法时序</summary>
    <div className="s-level-setting-list">{timingFields.map(field=><SettingField key={field} field={field} {...props}/>)}</div>
    <details className="s-level-setting-advanced"><summary>高级</summary><SettingField field="lilyStart" {...props}/></details>
  </details>;
}

export function RoomPowerControls({screens,...props}:LevelSettingsProps&{screens:boolean}) {
  if(props.values?.roomGlow===undefined)return null;
  if(!screens)return <p className="s-muted s-room-rule-note">单场景也可使用宝石槽供电。要配置规则分屏的通电亮边，请先切换运行方式。</p>;
  const override=props.overrides.roomGlow;
  const mode=override===undefined?'template':override===0?'off':'on';
  const templateOn=roomBoundaryOpacity(props.values)>0;
  return <div className="s-room-power-settings">
    <label className="s-field">游戏内房间亮边
      <select aria-label="游戏内房间亮边" disabled={props.disabled} value={mode} onChange={e=>{
        const value=e.target.value;
        props.change('roomGlow',value==='template'?undefined:value==='off'?0:.7);
      }}>
        <option value="template">沿用模板{mode==='template'?(templateOn?' · 已启用':' · 关闭'):''}</option>
        <option value="off">关闭</option>
        <option value="on">通电时显示</option>
      </select>
    </label>
    {mode==='on'&&<><SettingField field="roomGlow" {...props}/><button type="button" className="s-text-button" disabled={props.disabled} onClick={()=>props.change('roomGlow',.7)}>采用西 1 强度 · 0.7</button></>}
    {mode==='template'&&templateOn&&props.values.roomGlow>0&&<small className="s-muted">模板亮边强度 {Number(props.values.roomGlow.toFixed(4))}</small>}
    <p className="s-muted s-room-rule-note">规则分屏决定镜头怎样切屏。画布的黄线是编辑用的分屏网格。这里的亮边只控制宝石给房间供电后游戏里出现的蓝边，关闭亮边仍可供电。</p>
    <p className="s-muted s-room-rule-note">改动每屏格数或网格起点，可能改变宝石槽与发射器的房间归属。可在「布局分屏」选中一屏查看供电预览。</p>
    {(mode==='on'||mode==='template'&&templateOn)&&<details className="s-level-setting-advanced"><summary>地下高亮</summary><SettingField field="lowerRoomDimming" {...props}/></details>}
  </div>;
}
