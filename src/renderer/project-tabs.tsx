import React,{useEffect,useRef,useState} from 'react';
import type {ProjectTabAction,ProjectTabState} from '../project-tabs';
import {Icon} from './studio-ui';
import './project-tabs.css';

const mime='application/x-sstar-project-tab';

export function ProjectTabs(){
  const api=window.projectTabs!;
  const [state,setState]=useState<ProjectTabState>({tabs:[]});
  const [error,setError]=useState('');
  const [dragging,setDragging]=useState<string|undefined>();
  const [over,setOver]=useState<string|undefined>();
  const list=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const unsubscribe=api.onState(setState);
    void api.state().then(setState).catch(e=>setError(String(e)));
    return unsubscribe;
  },[api]);

  useEffect(()=>{
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
  },[state.active]);

  function action(command:ProjectTabAction,id?:string,before?:string,point?:{x:number;y:number}){
    setError('');
    void api.action(command,id,before,point).catch(error=>setError(String(error).replace(/^Error: Error invoking remote method '[^']+': Error: /,'')));
  }

  function target(e:React.DragEvent,before?:string){
    if(!e.dataTransfer.types.includes(mime))return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect='move';
    setOver(before??'end');
  }

  function drop(e:React.DragEvent,before?:string){
    if(!e.dataTransfer.types.includes(mime))return;
    e.preventDefault();
    e.stopPropagation();
    const id=e.dataTransfer.getData(mime);
    setOver(undefined);
    if(id)action('drop',id,before);
  }

  return <main className="project-window">
    <header className="project-strip" aria-label="工程标签栏" onKeyDown={e=>{if(e.key==='Escape')action('cancel-drag');}}>
      <div className="project-tabs" role="tablist" aria-label="已打开的工程" ref={list}
        onDragOver={e=>target(e)} onDrop={e=>drop(e)}
        onDragLeave={e=>{if(!(e.relatedTarget instanceof Node)||!e.currentTarget.contains(e.relatedTarget))setOver(undefined);}}>
        {state.tabs.map(tab=><div key={tab.id}
          className={'project-tab'+(tab.id===state.active?' active':'')+(tab.id===dragging?' dragging':'')+(tab.id===over?' insert-before':'')}
          onDragOver={e=>target(e,tab.id)} onDrop={e=>drop(e,tab.id)}
          onContextMenu={e=>{e.preventDefault();action('menu',tab.id);}}>
          <button type="button" role="tab" aria-selected={tab.id===state.active}
            title={tab.title+' · 向下拖出标签栏可分离'} draggable
            onClick={()=>action('activate',tab.id)}
            onDragStart={e=>{
              e.dataTransfer.setData(mime,tab.id);
              e.dataTransfer.effectAllowed='move';
              setDragging(tab.id);
              action('begin-drag',tab.id);
            }}
            onDragEnd={e=>{
              setDragging(undefined);
              setOver(undefined);
              action('end-drag',tab.id,undefined,{x:e.screenX,y:e.screenY});
            }}>
            <Icon name="cube" size={15}/><span>{tab.title}</span>{tab.dirty&&<i aria-label="未保存"/>}
          </button>
          <button type="button" className="project-close" title="关闭工程" aria-label={'关闭 '+tab.title} onClick={()=>action('close',tab.id)}>
            <Icon name="close" size={13}/>
          </button>
        </div>)}
        {over==='end'&&<span className="project-tab-end" aria-hidden/>}
      </div>
      <div className="project-tab-actions">
        <button type="button" title="新建工程标签" aria-label="新建工程标签" onClick={()=>action('new')}><Icon name="plus" size={16}/></button>
        <button type="button" title="打开工程标签" aria-label="打开工程标签" onClick={()=>action('open')}><Icon name="folder" size={16}/></button>
      </div>
      {error&&<span className="project-tab-error" role="alert" title={error}>{error}</span>}
    </header>
    {!state.tabs.length&&<section className="project-window-empty"><Icon name="cube" size={32}/>
      <h1>工程工作台</h1>
      <div><button onClick={()=>action('new')}>新建工程</button><button onClick={()=>action('open')}>打开工程</button></div>
    </section>}
  </main>;
}
