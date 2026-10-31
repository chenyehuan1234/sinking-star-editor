export function recentPlacement(previous:string[],key:string,limit=40){return[key,...previous.filter(v=>v!==key)].slice(0,limit);}
