import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export class PlaytestTiming {
  private readonly started=performance.now();
  private readonly stages:Partial<Record<string,number>>={};
  constructor(readonly scope:string){}

  async measure<T>(name:string,run:()=>T|Promise<T>):Promise<T>{
    const start=performance.now();
    try{return await run();}finally{this.stages[name]=Math.round(performance.now()-start);}
  }

  async window(pid:number){
    if(process.platform!=='win32')return null;
    // Read only the process created by this launch. PowerShell runs hidden.
    const query=`$deadline=[DateTime]::UtcNow.AddSeconds(25); do { $p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if(!$p){exit 2}; if($p.MainWindowHandle -ne 0){exit 0}; Start-Sleep -Milliseconds 75 } while([DateTime]::UtcNow -lt $deadline); exit 1`;
    try{await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',query],{windowsHide:true,timeout:28000});return Math.round(performance.now()-this.started);}
    catch{return null;}
  }

  report(windowMs:number|null){
    return {scope:this.scope,time:new Date().toISOString(),stages:this.stages,windowMs};
  }
}
