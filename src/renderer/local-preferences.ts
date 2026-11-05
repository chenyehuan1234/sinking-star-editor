export function readPref<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem('sstar04:'+key)??'null')??fallback;}catch{return fallback;}}
export function writePref(key:string,value:unknown){try{localStorage.setItem('sstar04:'+key,JSON.stringify(value));}catch{}}
