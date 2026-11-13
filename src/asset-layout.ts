import type {AssetFamily,AssetVariant} from './asset-variants';
import type {ScrollPosition} from './ui-memory';
export type AssetRow={id:string;top:number;height:number}&({kind:'families';families:AssetFamily[]}|{kind:'heading';family:AssetFamily}|{kind:'variants';family:AssetFamily;variants:AssetVariant[]});
export function layoutAssets(families:AssetFamily[],columns:number,rowHeight:number,expanded:Record<string,boolean>,variantRowHeight=rowHeight){
 const rows:AssetRow[]=[];let top=0;columns=Math.max(1,Math.floor(columns));
 for(let i=0;i<families.length;i+=columns){const chunk=families.slice(i,i+columns);rows.push({id:chunk[0].id,top,height:rowHeight,kind:'families',families:chunk});top+=rowHeight;
  for(const family of chunk)if(expanded[family.id]&&family.variants.length>1){rows.push({id:'heading:'+family.id,top,height:28,kind:'heading',family});top+=28;
   for(let j=0;j<family.variants.length;j+=columns){const variants=family.variants.slice(j,j+columns);rows.push({id:variants[0].preset.key,top,height:variantRowHeight,kind:'variants',family,variants});top+=variantRowHeight;}
  }
 }return{rows,height:top};
}
export function rememberAssetScroll(rows:AssetRow[],scrollTop:number):ScrollPosition{const row=rows.find(r=>r.top+r.height>scrollTop)??rows.at(-1);return{scrollTop,anchor:row?.id,offset:row?Math.max(0,scrollTop-row.top):0};}
export function restoreAssetScroll(saved:ScrollPosition,rows:AssetRow[],max:number){
 const row=rows.find(r=>r.id===saved.anchor)??rows.find(r=>r.kind==='variants'&&r.variants.some(v=>v.aliases.some(p=>p.key===saved.anchor)))??rows.find(r=>r.kind==='families'&&r.families.some(f=>f.id===saved.anchor||f.variants.some(v=>v.aliases.some(p=>p.key===saved.anchor))));
 const top=row?row.top+(saved.offset??0):saved.scrollTop;return Math.max(0,Math.min(max,Number.isFinite(top)?top:0));
}
