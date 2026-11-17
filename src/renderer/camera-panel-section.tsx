import React from 'react';
export function CameraPanelSection({id,title,open,onOpen,children,count,actions}:{id:string;title:string;open:boolean;onOpen:(open:boolean)=>void;children:React.ReactNode;count?:number;actions?:React.ReactNode}){
 return <details className="s-inspector-section s-camera-section" data-camera-section={id} open={open} onToggle={e=>{if(e.currentTarget.open!==open)onOpen(e.currentTarget.open);}}><summary><span>{title}{count!==undefined&&<small>{count}</small>}</span>{actions&&<span className="s-camera-section-actions" onClick={e=>{e.preventDefault();e.stopPropagation();}}>{actions}</span>}</summary>{children}</details>;
}
