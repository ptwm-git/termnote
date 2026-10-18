import { mkdir,copyFile,stat } from 'node:fs/promises';
import { resolve,join } from 'node:path';
if(!process.argv[2])throw new Error('用法：node scripts/install.mjs <知识库绝对路径>');
const vault=resolve(process.argv[2]);
if(!(await stat(join(vault,'.obsidian'))).isDirectory())throw new Error('此目录不是已初始化的 Obsidian 知识库');
const target=join(vault,'.obsidian','plugins','agent-note-terminal');await mkdir(target,{recursive:true});
for(const name of ['manifest.json','main.js','styles.css','LICENSE','THIRD-PARTY-NOTICES.txt','README.md'])await copyFile(name,join(target,name));
console.log('插件已安装：'+target+'（未修改已有插件和会话数据）');
