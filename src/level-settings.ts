export const levelSettingsFields = {
  fallingRate: {native:'falling_rate', label:'下落速率', unit:'×', defaultValue:1, min:.01, max:10},
  lilyInterval: {native:'time_per_lily_update', label:'荷叶移动间隔', unit:'秒', defaultValue:.4, min:.01, max:10},
  skipInterval: {native:'time_per_skip', label:'飞石跳跃间隔', unit:'秒', defaultValue:.12, min:.01, max:10},
  roverInterval: {native:'time_per_rover_update', label:'小车移动间隔', unit:'秒', defaultValue:.6, min:.01, max:10},
  lilyStart: {native:'lily_kickoff_time', label:'荷叶起动延迟', unit:'秒', defaultValue:-1, min:0, max:10},
  roomGlow: {native:'room_power_effect_intensity_factor', label:'房间通电高亮', unit:'', defaultValue:-1, min:0, max:1},
  lowerRoomDimming: {native:'underground_room_highlight_dimming_factor', label:'地下房间调暗', unit:'', defaultValue:-1, min:0, max:1},
} as const;

export type LevelSetting = keyof typeof levelSettingsFields;
export type LevelSettings = Partial<Record<LevelSetting,number>>;
export const timingFields = ['fallingRate','lilyInterval','skipInterval','roverInterval'] as const;
export const nativeScreenSize = 6;
export const newScreenSize = 16;

export function validateLevelSettings(values:LevelSettings) {
  if(!values || typeof values!=='object' || Array.isArray(values))throw Error('无效的关卡设置');
  for(const [key,value] of Object.entries(values)){
    if(!Object.hasOwn(levelSettingsFields,key))throw Error('未知的关卡设置：'+key);
    const field=levelSettingsFields[key as LevelSetting];
    if(typeof value!=='number'||!Number.isFinite(value)||value<field.min||value>field.max)throw Error(field.label+'超出范围');
  }
}
