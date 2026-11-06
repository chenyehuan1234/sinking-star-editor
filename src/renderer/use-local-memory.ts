import{useEffect,useRef,useState}from'react';
import{readPref,writePref}from'./local-preferences';
/** Scroll writes are delayed, then flushed when the panel closes or the app exits. */
export function useLocalMemory<T>(key:string,decode:(value:unknown)=>T){
  const[value,setValue]=useState(()=>decode(readPref(key,null))),current=useRef(value),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),source=useRef(Symbol()),decoder=useRef(decode);decoder.current=decode;
  function flush(){clearTimeout(timer.current);writePref(key,current.current);window.dispatchEvent(new CustomEvent('sstar:local-memory',{detail:{key,value:current.current,source:source.current}}));}
  function save(next:T,render=true){current.current=next;clearTimeout(timer.current);if(render){setValue(next);flush();}else timer.current=setTimeout(flush,150);}
  useEffect(()=>{const sync=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.key!==key||d.source===source.current)return;clearTimeout(timer.current);current.current=decoder.current(d.value);setValue(current.current);};window.addEventListener('sstar:local-memory',sync);window.addEventListener('pagehide',flush);return()=>{window.removeEventListener('sstar:local-memory',sync);window.removeEventListener('pagehide',flush);flush();};},[key]);
  return[value,()=>current.current,save]as const;
}
