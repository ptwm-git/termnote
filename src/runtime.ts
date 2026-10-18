import { execFile } from 'node:child_process';
declare const BRIDGE_SOURCE:string;
export function bridgeArgs(bridge:string):string[] {return bridge?['-u',bridge]:['-u','-c',BRIDGE_SOURCE];}
export interface PythonCommand { executable: string; prefix: string[]; description: string; }
function probe(executable: string,args: string[]): Promise<string> {
  return new Promise((resolve,reject)=>execFile(executable,args,{timeout:6000,windowsHide:true,encoding:'utf8'},(error,stdout,stderr)=>error?reject(new Error(stderr||error.message)):resolve(stdout)));
}
export async function findPython(custom: string,bridge: string): Promise<PythonCommand> {
  const candidates: [string,string[]][] = custom.trim()?[[custom.trim(),[]]] : process.platform==='win32'?
    [['python',[]],['py',['-3']],['python3',[]]]:
    [['/opt/homebrew/bin/python3',[]],['/usr/local/bin/python3',[]],['python3',[]],['/usr/bin/python3',[]]];
  const errors:string[]=[];
  for(const [executable,prefix] of candidates) {
    try { const result=JSON.parse(await probe(executable,[...prefix,...bridgeArgs(bridge),'--check']));
      if(!result.ok) throw new Error('检测失败');
      return {executable,prefix,description:`Python ${result.version} · ${result.backend} · ${result.python}`};
    } catch(error) { errors.push(`${executable}: ${(error as Error).message}`); }
  }
  throw new Error('找不到可用的 Python 3.9+。请到插件设置填写解释器路径。'+(process.platform==='win32'?' Windows 还需在该解释器安装 pywinpty。':'')+'\n'+errors.join('\n'));
}
