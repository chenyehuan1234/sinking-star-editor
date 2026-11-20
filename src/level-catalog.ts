import type {SharedGroup,SharedLevel} from './share-types';

export const searchKey=(text:string)=>text.normalize('NFKC').toLocaleLowerCase().trim();
export function directorySections(levels:readonly SharedLevel[],groups:readonly SharedGroup[]=[]){
  const sections=new Map<string,{id:string;title:string;levels:SharedLevel[]}>();
  for(const {id,title} of groups)sections.set(id,{id,title,levels:[]});
  const ungrouped={id:'',title:'未分组',levels:[] as SharedLevel[]};
  for(const level of levels)(sections.get(level.groupId??'')??ungrouped).levels.push(level);
  return [...sections.values(),ungrouped].filter(section=>section.levels.length>0);
}
export function matchDirectory(levels:readonly SharedLevel[],groups:readonly SharedGroup[]|undefined,query:string,parents:readonly string[]=[]){
  const words=searchKey(query).split(/\s+/).filter(Boolean);
  const includes=(fields:string[])=>words.every(word=>fields.some(value=>searchKey(value).includes(word)));
  const rootMatch=includes([...parents]);
  const sections=directorySections(levels,groups).map(section=>({...section,levels:section.levels.filter(level=>rootMatch||includes([...parents,section.title,level.title,level.id]))})).filter(section=>section.levels.length);
  return {rootMatch,sections,count:sections.reduce((sum,section)=>sum+section.levels.length,0)};
}
