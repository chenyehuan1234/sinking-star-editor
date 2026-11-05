import type{LevelView}from'../src/shared';
export interface UiCheck{input:(v:string)=>Promise<void>;pointer:(e:unknown)=>Promise<void>;delay:(ms:number)=>Promise<void>;fixture:()=>Promise<{level:LevelView}>;capture:(n:string)=>Promise<void>;resize:(w:number,h:number,z:number)=>Promise<void>;stats:()=>Promise<Record<string,number>>;saved:()=>Promise<any>;finish:(data:unknown)=>Promise<void>}
declare global{interface Window{uiCheck:UiCheck}}
