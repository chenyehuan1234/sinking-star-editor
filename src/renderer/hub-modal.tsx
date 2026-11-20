import React,{useLayoutEffect,useRef,type ReactNode} from 'react';
import {Icon} from './studio-ui';

export function HubModal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  const element=useRef<HTMLDialogElement>(null);
  useLayoutEffect(()=>{element.current?.showModal();},[]);
  return <dialog ref={element} className={'hub-modal'+(wide?' hub-modal-wide':'')} aria-label={title}
    onCancel={event=>{event.preventDefault();onClose();}}
    onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="hub-modal-body">
      <header><strong>{title}</strong><button type="button" className="hub-icon" aria-label="关闭" onClick={onClose}><Icon name="close"/></button></header>
      {children}
    </div>
  </dialog>;
}
