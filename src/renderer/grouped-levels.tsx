import React,{useEffect,useState,type ReactNode} from 'react';
import type {SharedLevel} from '../share-types';
import {Icon} from './studio-ui';

export interface LevelSection {id:string;title:string;levels:SharedLevel[]}
export function GroupedLevels({sections,query='',reveal=false,openKeys,onOpenKeys,renderLevel}:{sections:LevelSection[];query?:string;reveal?:boolean;openKeys?:string[];onOpenKeys?:(keys:string[])=>void;renderLevel:(level:SharedLevel)=>ReactNode}){
  const [normal,setNormal]=useState<string[]>([]),[overrides,setOverrides]=useState<Record<string,boolean>>({}),[limits,setLimits]=useState<Record<string,number>>({});
  useEffect(()=>{setOverrides({});setLimits({});},[query]);
  const keys=openKeys??normal;
  return <div className="hub-group-directory">{sections.map(section=>{
    const open=(reveal?overrides[section.id]??true:keys.includes(section.id)),limit=limits[section.id]??16;
    function toggle(){
      if(reveal){setOverrides(value=>({...value,[section.id]:!open}));return;}
      const next=open?keys.filter(id=>id!==section.id):[...keys,section.id];
      if(onOpenKeys)onOpenKeys(next);else setNormal(next);
    }
    return <section className="hub-level-group" key={section.id}>
      <button type="button" className="hub-group-toggle" onClick={toggle} aria-expanded={open}><Icon name={open?'down':'chevron'} size={15}/><span>{section.title}</span><small>{section.levels.length} 关</small></button>
      {open&&<div className="hub-group-levels">{section.levels.slice(0,limit).map(level=><React.Fragment key={level.id}>{renderLevel(level)}</React.Fragment>)}
        {limit<section.levels.length&&<button type="button" className="hub-button" onClick={()=>setLimits(value=>({...value,[section.id]:limit+16}))}>显示更多关卡</button>}
      </div>}
    </section>;
  })}</div>;
}
