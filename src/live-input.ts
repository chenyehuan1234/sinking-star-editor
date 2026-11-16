let sequence=0,active:string|undefined;
export function nextInputGroup(){return 'numeric-'+ ++sequence;}
export function currentInputGroup(){return active;}
export function inputCommit<T>(group:string,commit:()=>T):T{const previous=active;active=group;try{return commit();}finally{active=previous;}}
export function validNumericInput(value:string,integer=false){if(!value.trim()||!Number.isFinite(Number(value)))return false;return !integer||/^[+-]?\d+$/.test(value.trim());}
