import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {EditorService} from '../src/main/service';
import {PLAYTEST_SUSPENSION,assertPlaytestCommand} from '../src/playtest-policy';
import type {WorldProject} from '../src/shared';

const suspended=(error:unknown)=>error instanceof Error &&
  (error as Error & {code?:string}).code==='PLAYTEST_SUSPENDED' && error.message===PLAYTEST_SUSPENSION;

test('新旧服务启动接口在部署、校验、战役切换前拒绝，输入与文件保持原样',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-launch-block-'));
  try {
    const service=new EditorService(path.join(root,'workspace'));
    const campaign=path.join(root,'normal');await fs.mkdir(campaign);
    await fs.writeFile(path.join(campaign,'overworld.history'),'unchanged world');
    await fs.writeFile(path.join(campaign,'Status.sokoban_status'),'unchanged status');
    const unexpected=async()=>{throw Error('启动拦截前执行了有副作用的操作');};
    service.assertStopped=unexpected;service.unchanged=unexpected;
    service.worldDeploy=unexpected;service.runValidate=unexpected;
    service.campaigns.activate=unexpected;service.campaigns.reset=unexpected;
    const world={id:'0123456789ab',levels:[{project:{operations:[]}}]} as unknown as WorldProject;
    const original=JSON.stringify(world);
    await assert.rejects(()=>service.launch(),suspended);
    await assert.rejects(()=>service.worldLaunch(world,'entry','overworld',true),suspended);
    for(const mode of ['single','subset','world'] as const)
      await assert.rejects(()=>service.runLaunch(world,{mode,levelIds:['a']}),/请选择兼容测试存档/);
    assert.equal(JSON.stringify(world),original);
    assert.equal(await fs.readFile(path.join(campaign,'overworld.history'),'utf8'),'unchanged world');
    assert.equal(await fs.readFile(path.join(campaign,'Status.sokoban_status'),'utf8'),'unchanged status');
    await assert.rejects(()=>fs.access(service.workspace),{code:'ENOENT'});
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('暂停策略不拦截编辑、保存、预览、校验与构建命令',()=>{
  for(const command of ['launch','worldLaunch','worldReset'])assert.throws(()=>assertPlaytestCommand(command),suspended);
  for(const command of ['runPlan','runLaunch','nativeRunPlan','nativeRunLaunch','prepare','deploy','worldDeploy','worldSave','save','preview','previewUpdate','worldValidate','runValidate','worldBuild','build'])
    assert.doesNotThrow(()=>assertPlaytestCommand(command));
});

test('真实主进程的启动、部署与旧进度重置 IPC 均被拦截，未创建工作区',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sstar-ipc-block-'));
  try {
    const handlers=new Map<string,(event:unknown,...args:unknown[])=>Promise<unknown>>();
    let shown!:()=>void;const ready=new Promise<void>(resolve=>{shown=resolve;});
    let window:any;
    class FakeWindow {
      webContents={mainFrame:{},on(){},setWindowOpenHandler(){},session:{setPermissionRequestHandler(){}}};
      constructor(){window=this;}
      removeMenu(){} async loadFile(){} show(){shown();} focus(){}
    }
    const electron={
      app:{isPackaged:true,setName(){},requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getPath:()=>root,on(){},quit(){}},
      BrowserWindow:FakeWindow,Menu:{setApplicationMenu(){}},dialog:{},shell:{},
      ipcMain:{handle:(name:string,handler:any)=>handlers.set(name,handler)}
    };
    const output=await build({entryPoints:['src/main/main.ts'],bundle:true,platform:'node',format:'cjs',write:false,
      plugins:[{name:'mock-electron',setup(b){b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'mock'}));
        b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'module.exports = globalThis.__electron;',loader:'js'}));}}]});
    const context=vm.createContext({__electron:electron,require:createRequire(import.meta.url),module:{exports:{}},exports:{},
      __dirname:root,__filename:path.join(root,'main.cjs'),process:{...process,env:{}},Buffer,console,setTimeout,clearTimeout,URL});
    vm.runInContext(output.outputFiles[0].text,context);await ready;
    const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
    for(const method of ['launch','worldLaunch','worldReset']) {
      const handler=handlers.get('editor:'+method);assert.ok(handler,method);
      await assert.rejects(()=>handler(event,undefined,undefined),(e:any)=>e.code==='PLAYTEST_SUSPENDED'&&e.message===PLAYTEST_SUSPENSION);
    }
    assert.deepEqual(await fs.readdir(root),[]);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
