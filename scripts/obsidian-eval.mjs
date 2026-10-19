import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const expected=resolve('../test-vault');
if(!process.argv[2])throw new Error('用法：node scripts/obsidian-eval.mjs <JS文件> [测试库名称]');
const source=readFileSync(process.argv[2],'utf8');
const guarded='(()=>{if(app.vault.adapter.getBasePath()!=='+JSON.stringify(expected)+')throw Error("Refusing to modify a non-test vault");return '+source+';})()';
const result=spawnSync('obsidian',['eval',`vault=${process.argv[3]||'test-vault'}`, `code=${guarded}`],{cwd:expected,encoding:'utf8',timeout:60000,maxBuffer:2e6});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;process.exitCode=result.status??1;
