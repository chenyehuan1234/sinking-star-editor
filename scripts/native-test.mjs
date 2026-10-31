import fs from 'node:fs';
import path from 'node:path';
import {spawnSync}from'node:child_process';
const root=process.env.SINKING_STAR_GAME;
if(!root||!fs.existsSync(path.join(root,'sinking_star.exe'))){console.error('原生集成测试需要安装原游戏，并设置 SINKING_STAR_GAME 为包含 sinking_star.exe 的文件夹。通用测试请运行 npm test。');process.exit(1);}
const files=fs.readdirSync('tests').filter(n=>n.endsWith('.test.ts')).map(n=>'tests/'+n);
const r=spawnSync(process.execPath,['--import','tsx','--test',...files],{stdio:'inherit',env:process.env});process.exit(r.status??1);
