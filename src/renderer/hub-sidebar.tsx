import type {ReactNode} from 'react';
import {Icon} from './studio-ui';

export function HubSidebar({label,children,feedback}:{label:string;children:ReactNode;feedback?:(kind:'bug'|'idea')=>void}){
  return <aside className="hub-nav">
    <div className="hub-brand">
      <span className="hub-brand-mark"><Icon name="cube" size={23}/></span>
      <div><strong>沉星之序</strong><small>关卡工作台</small></div>
    </div>
    <nav aria-label={label}>{children}</nav>
    <footer className="hub-nav-footer">
      {feedback&&<nav aria-label="反馈"><button type="button" onClick={()=>feedback('bug')}><Icon name="warning"/>报告问题</button>
        <button type="button" onClick={()=>feedback('idea')}><Icon name="help"/>功能建议</button></nav>}
      <small className="hub-nav-note">非官方创作工具</small>
    </footer>
  </aside>;
}
