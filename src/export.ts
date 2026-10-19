import {open,rename,unlink} from 'node:fs/promises';
import {basename,dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';

type SaveChooser=(name:string)=>Promise<string|null>;
async function nativeSavePath(name:string):Promise<string|null> {
  const electron=require('electron') as {remote?:{app:{getPath(name:string):string};dialog:{showSaveDialog(options:{title:string;defaultPath:string;buttonLabel:string;filters:{name:string;extensions:string[]}[]}):Promise<{canceled:boolean;filePath?:string}>}}};
  if(!electron.remote?.dialog)throw new Error('当前桌面环境无法打开保存对话框；备份已保存在知识库中');
  const result=await electron.remote.dialog.showSaveDialog({title:'导出终端备份',buttonLabel:'保存 Markdown',defaultPath:join(electron.remote.app.getPath('documents'),basename(name)),filters:[{name:'Markdown',extensions:['md']}]});
  return result.canceled?null:result.filePath??null;
}
export async function writeDocument(path:string,content:string):Promise<void> {
  const temporary=join(dirname(path),'.'+basename(path)+'.'+randomUUID()+'.tmp');
  try {
    const file=await open(temporary,'wx',0o600);
    try {await file.writeFile(content,'utf8');await file.sync();}finally{await file.close();}
    await rename(temporary,path);
  }finally{await unlink(temporary).catch(()=>{});}
}
export async function exportMarkdown(name:string,content:()=>Promise<string>,choose:SaveChooser=nativeSavePath):Promise<string|null> {
  const path=await choose(name);
  if(!path)return null;
  await writeDocument(path,await content());
  return path;
}
