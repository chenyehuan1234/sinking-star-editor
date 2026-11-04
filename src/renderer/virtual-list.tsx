import React,{useState} from 'react';
export function VirtualList<T>({items,rowHeight=36,height=240,render,label}:{items:T[];rowHeight?:number;height?:number;render:(item:T,index:number)=>React.ReactNode;label:string}){
 const[top,setTop]=useState(0),start=Math.max(0,Math.min(Math.floor(top/rowHeight)-4,Math.max(0,items.length-Math.ceil(height/rowHeight)))),end=Math.min(items.length,start+Math.ceil(height/rowHeight)+8);
 return <div className="s-virtual079" role="region" aria-label={label} style={{height:Math.min(height,Math.max(rowHeight,items.length*rowHeight)),overflow:'auto'}} onScroll={e=>setTop(e.currentTarget.scrollTop)}><div style={{height:items.length*rowHeight,position:'relative'}}>{items.slice(start,end).map((item,n)=><div key={start+n} style={{position:'absolute',top:(start+n)*rowHeight,height:rowHeight,left:0,right:0}}>{render(item,start+n)}</div>)}</div></div>;
}
