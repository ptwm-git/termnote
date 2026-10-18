import {execFile} from 'node:child_process';
import {homedir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import type {Profile} from './types';
export const PRESETS:Record<string,Omit<Profile,'id'>>={
  opencode:{name:'OpenCode',executable:'opencode',args:[],cwd:'',adapter:'opencode',model:''},
  codex:{name:'Codex（通用终端）',executable:'codex',args:[],cwd:'',adapter:'terminal'},
  claude:{name:'Claude Code（通用终端）',executable:'claude',args:[],cwd:'',adapter:'terminal'},
  custom:{name:'自定义 Agent',executable:'',args:[],cwd:'',adapter:'terminal'},
};
export function commandOutput(executable:string,args:string[],cwd?:string):Promise<string> {
  return new Promise((resolve,reject)=>execFile(executable,args,{cwd,timeout:10000,maxBuffer:1024*1024,encoding:'utf8',windowsHide:true},(error,out,err)=>error?reject(new Error(`${executable}：${err||error.message}`)):resolve(out.trim())));
}
export async function detectProfile(profile:Profile):Promise<{executable:string;version:string;api?:'v1'|'v2'}> {
  const name=profile.executable.trim();
  if(!name)throw new Error('请先填写程序路径；系统终端无需检测 Agent 版本');
  const candidates=[name];
  if(!isAbsolute(name)&&name==='opencode'&&process.platform!=='win32')candidates.push(join(homedir(),'.opencode/bin/opencode'),join(homedir(),'.local/bin/opencode'),'/opt/homebrew/bin/opencode','/usr/local/bin/opencode');
  let last:unknown;
  for(const executable of candidates)try {
    const version=await commandOutput(executable,['--version']);
    if(profile.adapter!=='opencode')return {executable,version:version.slice(0,500)};
    const major=Number(/(?:^|\s)v?(\d+)\.\d+\.\d+/.exec(version)?.[1]);
    if(major!==1&&major!==2)throw new Error(`OpenCode ${version} 尚未验证增强接口；请使用“通用终端”模式`);
    return {executable,version,api:major===2?'v2':'v1'};
  }catch(error){last=error;}
  throw last;
}
export function validateOpenCodeArgs(args:string[]):void {
  if(args.some(arg=>/^(--(?:session|server|continue|standalone|prompt|fork|dir)|-[sc])(?:=|$)/.test(arg)))throw new Error('OpenCode 会话与服务参数由插件管理，请移除 --session、--continue、--server 等参数；需要完全自定义时使用通用终端模式');
}
