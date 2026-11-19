export const prismColors = [
  {bit:1, label:'红 · 开门', color:'#ef5658'},
  {bit:8, label:'橙 · 跳跃', color:'#f29846'},
  {bit:4, label:'黄 · 粉碎', color:'#e5cd53'},
  {bit:2, label:'绿 · 穿越', color:'#6eb966'},
  {bit:16, label:'青 · 推动', color:'#55c9d2'},
  {bit:32, label:'紫 · 传送至光束末端', color:'#b17ae7'},
  {bit:128, label:'改变光束', color:'#a5b2bd', advanced:true},
  {bit:256, label:'宝石光束', color:'#a5b2bd', advanced:true},
  {bit:512, label:'挤压光束', color:'#a5b2bd', advanced:true},
] as const;
export const defaultPrismColors = 15;
export const prismColorMask = prismColors.reduce((mask,entry)=>mask|entry.bit,0);
export const withPrismColors = (current:number,colors:number) => current-(current&prismColorMask)+(colors&prismColorMask);
