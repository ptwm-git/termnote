import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
if(!process.argv[2])throw new Error('用法：node scripts/obsidian-eval.mjs <JS文件> [测试库名称]');
const result=spawnSync('obsidian',[`vault=${process.argv[3]||'test-vault'}`,'eval',`code=${readFileSync(process.argv[2],'utf8')}`],{encoding:'utf8',timeout:60000,maxBuffer:2e6});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;process.exitCode=result.status??1;
