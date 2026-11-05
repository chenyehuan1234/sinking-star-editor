import{useEffect,useRef,useState}from'react';
import{readPref,writePref}from'./local-preferences';
/** Scroll writes are delayed, then flushed when the panel closes or the app exits. */
export function useLocalMemory<T>(key:string,decode:(value:unknown)=>T){
  const[value,setValue]=useState(()=>decode(readPref(key,null))),current=useRef(value),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  function flush(){clearTimeout(timer.current);writePref(key,current.current);}
  function save(next:T,render=true){current.current=next;clearTimeout(timer.current);if(render){setValue(next);flush();}else timer.current=setTimeout(flush,150);}
  useEffect(()=>{window.addEventListener('pagehide',flush);return()=>{window.removeEventListener('pagehide',flush);flush();};},[key]);
  return[value,()=>current.current,save]as const;
}
