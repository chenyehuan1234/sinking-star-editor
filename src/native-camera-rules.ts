/** Camera_Control constructor defaults verified against Steam Build 26466613.
 * Omitted native fields are not zero and must not use the free editor camera defaults.
 */
export const nativeCameraDefaults = {upDistance:19,southDistance:12,lookAtSouthDistance:0,fov:35,panRate:.35} as const;

/** The game keeps the 16:9 horizontal field on narrower windows. */
export function nativeVerticalFov(degrees:number,aspect=16/9){
 return aspect>0&&aspect<16/9?2*Math.atan(Math.tan(degrees*Math.PI/360)*(16/9)/aspect)*180/Math.PI:degrees;
}
