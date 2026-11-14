import type {NativeValue} from './catalog-types';

/** Verified defaults from the native Gate records; the moving barrier has its own colour. */
export const gateForceDefaults:Record<string,number>={
  'force_field_color.x':Math.fround(.1),'force_field_color.y':Math.fround(.8),
  'force_field_color.z':Math.fround(.7),'force_field_color.w':Math.fround(.7),
  force_field_brightness:2,
};
export interface GateForceAppearance {color:number[];brightness:number}
export function gateForceAppearance(values:Record<string,NativeValue>):GateForceAppearance {
  return {color:['x','y','z','w'].map(a=>Number(values['force_field_color.'+a]??gateForceDefaults['force_field_color.'+a])),brightness:Number(values.force_field_brightness??gateForceDefaults.force_field_brightness)};
}
export function gateForceValues(value:GateForceAppearance):Record<string,number> {
  return {...Object.fromEntries(['x','y','z','w'].map((a,i)=>['force_field_color.'+a,value.color[i]])),force_field_brightness:value.brightness};
}
