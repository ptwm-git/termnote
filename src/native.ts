import {open,readFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fence,hash} from './note';
import type {NativeBinding,Profile} from './types';
type Data=Record<string,any>;
export interface NativeSnapshot {schema:1;binding:NativeBinding;profile:Profile;cwd:string;messages:Data[];}
export async function atomicJSON(path:string,value:unknown):Promise<void> {
  const temp=path+'.'+randomUUID()+'.tmp';
  try {
    const file=await open(temp,'wx',0o600);
    try {await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
    await rename(temp,path);
  } finally {await unlink(temp).catch(()=>{});}
}
function obj(value:unknown):Data {if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('OpenCode 原生记录格式不匹配');return value as Data;}
function messageID(value:Data):string {return String(value.id??value.info?.id??'');}
function uniqueParts(value:Data):Data {
  const next={...value};
  for(const key of ['parts','content'])if(Array.isArray(next[key])) {
    const seen=new Set<string>();next[key]=next[key].filter((p:Data)=>!p.id||(!seen.has(p.id)&&!!seen.add(p.id)));
  }
  return next;
}
export class NativeArchive {
  snapshot?:NativeSnapshot;
  private digest='';
  constructor(readonly path:string){}
  async load(expected?:NativeBinding):Promise<void> {
    let text:string;
    try{text=await readFile(this.path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
    const value=obj(JSON.parse(text));
    if(value.schema!==1||!/^ses[A-Za-z0-9_-]+$/.test(value.binding?.sessionID)||!['v1','v2'].includes(value.binding.api)||!Array.isArray(value.messages)||!value.profile||typeof value.cwd!=='string')throw new Error('原生归档损坏，已保留文件并停止自动覆盖');
    if(expected&&expected.sessionID!==value.binding.sessionID)throw new Error('原生归档会话 ID 与笔记绑定不一致');
    this.snapshot=value as NativeSnapshot;this.digest=hash(JSON.stringify(this.snapshot));
  }
  async merge(binding:NativeBinding,profile:Profile,cwd:string,exported:unknown):Promise<boolean> {
    const data=obj(exported),info=obj(data.info);
    if(info.id!==binding.sessionID)throw new Error('OpenCode 返回了其他会话，已拒绝归档');
    if(this.snapshot&&this.snapshot.binding.sessionID!==binding.sessionID)throw new Error('不能替换已有原生会话绑定');
    if(!Array.isArray(data.messages))throw new Error('OpenCode 未返回完整消息列表');
    const messages=new Map<string,Data>((this.snapshot?.messages??[]).map(m=>[messageID(m),m]));
    const seen=new Set<string>();
    for(const raw of data.messages) {
      const m=obj(raw),id=messageID(m);
      if(!/^msg[A-Za-z0-9_-]+$/.test(id)||seen.has(id))throw new Error('OpenCode 消息标识缺失或重复，已保留上次成功记录');
      if(m.info?.sessionID&&m.info.sessionID!==binding.sessionID)throw new Error('OpenCode 消息来自其他会话');
      seen.add(id);messages.set(id,uniqueParts(m));
    }
    const next:NativeSnapshot={schema:1,binding,profile:structuredClone(profile),cwd,messages:[...messages.values()]};
    const digest=hash(JSON.stringify(next));if(digest===this.digest)return false;
    await atomicJSON(this.path,next);this.snapshot=next;this.digest=digest;return true;
  }
  render():string {
    if(!this.snapshot)return '';
    const lines=['## OpenCode 对话记录','',`> [!info]- 原生会话信息\n> 会话 ID：\`${this.snapshot.binding.sessionID}\`\n> 按原生消息归档；终端操作另存原始日志。`,''];
    if(!this.snapshot.messages.length)lines.push('尚无原生消息。','');
    for(const message of this.snapshot.messages) {
      const info=message.info??message,type=info.role??info.type??'unknown',id=messageID(message);
      const labels:Record<string,string>={user:'用户输入',assistant:'Agent 回答',shell:'命令执行','model-switched':'模型切换','agent-switched':'Agent 切换',system:'系统消息',compaction:'上下文整理'};
      lines.push(`<!-- opencode-message: ${id} -->`,'');
      if(!['user','assistant','shell'].includes(type)) {
        lines.push(`> [!info]- ${labels[type]??'OpenCode 状态事件'}`,fence(JSON.stringify(message,null,2)).split('\n').map(line=>'> '+line).join('\n'),'');continue;
      }
      lines.push(`### ${labels[type]}`,'');
      const model=info.model??(info.modelID?{providerID:info.providerID,id:info.modelID}:undefined);
      if(model)lines.push('模型：'+JSON.stringify(model).replace(/\n/g,' '),'');
      if(typeof message.text==='string')lines.push(fence(message.text),'');
      for(const key of ['files','agents','skills'])if(Array.isArray(message[key])&&message[key].length)lines.push('**关联内容**',fence(JSON.stringify({[key]:message[key]},null,2)),'');
      const parts=message.parts??message.content;
      if(Array.isArray(parts))for(const p of parts) {
        if(p.type==='text'||p.type==='reasoning')lines.push(p.type==='reasoning'?'**推理内容（Agent 已公开输出）**\n':'',fence(String(p.text??'')),'');
        else if(p.type==='tool') {
          const title=String(p.tool??p.name??'工具').replace(/[\r\n]/g,' '),body=fence(JSON.stringify(p.state??p,null,2));
          lines.push(`> [!example]- 工具执行：${title}`,body.split('\n').map(line=>'> '+line).join('\n'),'');
        }else lines.push(fence(JSON.stringify(p,null,2)),'');
      }
      if(info.error)lines.push('**Agent 错误**',fence(JSON.stringify(info.error,null,2)),'');
      if(!Array.isArray(parts)&&typeof message.text!=='string')lines.push(fence(JSON.stringify(message,null,2)),'');
    }
    return lines.join('\n');
  }
}
