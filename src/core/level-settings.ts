import {levelSettingsFields,validateLevelSettings,type LevelSetting,type LevelSettings} from '../level-settings';
import type {EntityFile} from './entities';
import type {PropertyCodec} from './properties';

export function levelSettingsView(codec:PropertyCodec,file:EntityFile):LevelSettings|undefined {
  const record=file.records.find(r=>r.type==='Settings');
  if(!record)return undefined;
  const schema=new Set(codec.schema('Settings').map(f=>f.name));
  const values=new Map(codec.parse(record).fields.map(f=>[f.schema.name,f.value]));
  return Object.fromEntries(Object.entries(levelSettingsFields)
    .filter(([,field])=>schema.has(field.native))
    .map(([key,field])=>[key,Number(values.get(field.native)??field.defaultValue)]));
}

export function applyLevelSettings(codec:PropertyCodec,file:EntityFile,values:LevelSettings) {
  validateLevelSettings(values);
  if(!Object.keys(values).length)return;
  const at=file.records.findIndex(r=>r.type==='Settings');
  if(at<0)throw Error('关卡缺少原生 Settings');
  const patch:Record<string,number|boolean>=Object.fromEntries(Object.entries(values).map(([key,value])=>[levelSettingsFields[key as LevelSetting].native,value]));
  if((values.roomGlow??0)>0)patch.do_spotlight=true;
  file.records[at]=codec.patch(file.records[at],patch);
}
