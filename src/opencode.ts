import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {request} from 'node:http';
import {randomBytes} from 'node:crypto';
import {bridgeArgs,type PythonCommand} from './runtime';
import {detectProfile,validateOpenCodeArgs} from './profiles';
import type {NativeBinding,Profile} from './types';
interface Host {python():Promise<PythonCommand>;bridge:string;}
export class OpenCodeServer {
  private child?:ChildProcessWithoutNullStreams;
  private closed?:Promise<void>;
  private url='';private password=randomBytes(32).toString('hex');
  private api!:'v1'|'v2';private cwd='';
  version='';executable='';
  get environment():Record<string,string> {return {OPENCODE_SERVER_PASSWORD:this.password,OPENCODE_SERVER_USERNAME:'opencode'};}
  async start(host:Host,profile:Profile,cwd:string):Promise<void> {
    validateOpenCodeArgs(profile.args);
    const detected=await detectProfile(profile);this.api=detected.api!;this.version=detected.version;this.executable=detected.executable;this.cwd=cwd;
    const python=await host.python();
    const child=spawn(python.executable,[...python.prefix,...bridgeArgs(host.bridge),'--service'],{stdio:'pipe',windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});this.child=child;
    this.closed=new Promise(resolve=>child.once('close',()=>{this.child=undefined;resolve();}));
    child.stdin.on('error',()=>{});
    const ready=new Promise<void>((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('OpenCode 本地服务启动超时，请检查安装和原生配置')),20000);
      const handle=(chunk:Buffer)=>{
        output=(output+chunk.toString('utf8')).slice(-16000);
        const url=output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0],password=output.match(/server password (\S+)/)?.[1];
        if(url) {this.url=url;if(password)this.password=password;clearTimeout(timer);resolve();}
      };
      child.stdout.on('data',handle);child.stderr.on('data',handle);
      child.once('error',()=>{clearTimeout(timer);reject(new Error('无法启动 OpenCode 服务监护进程'));});
      child.once('close',()=>{clearTimeout(timer);reject(new Error('OpenCode 服务已退出，请在系统终端检查其配置'));});
    });
    child.stdin.write(JSON.stringify({executable:this.executable,args:['serve','--hostname','127.0.0.1','--port','0'],cwd,env:this.environment})+'\n');
    try {
      await ready;
      const doc=await this.call(this.api==='v2'?'/openapi.json':'/doc');
      if(!doc?.paths?.[this.api==='v2'?'/api/session':'/session']?.post)throw new Error('此 OpenCode 版本接口不匹配；请改用通用终端模式');
    }catch(error){await this.stop();throw error;}
  }
  private call(path:string,method='GET',body?:unknown):Promise<any> {
    const url=new URL(path,this.url);
    if(this.api==='v1'&&path!=='/doc')url.searchParams.set('directory',this.cwd);
    return new Promise((resolve,reject)=>{
      const data=body===undefined?undefined:JSON.stringify(body);
      const req=request(url,{method,headers:{Authorization:'Basic '+Buffer.from('opencode:'+this.password).toString('base64'),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},response=>{
        const chunks:Buffer[]=[];let length=0;
        response.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>128*1024*1024){req.destroy(new Error('原生记录超过单次同步限制，保留原始日志与上次归档'));return;}chunks.push(chunk);});
        response.on('end',()=>{
          if(!response.statusCode||response.statusCode>=300){reject(new Error(response.statusCode===404?'OpenCode 原生会话不存在；不会自动创建替代会话':`OpenCode 同步失败（HTTP ${response.statusCode}）`));return;}
          if(response.statusCode===204){resolve(undefined);return;}
          try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new Error('OpenCode 返回非 JSON 数据，保留上次归档'));}
        });response.on('error',reject);
      });
      req.setTimeout(15000,()=>req.destroy(new Error('OpenCode 原生记录同步超时')));req.on('error',reject);req.end(data);
    });
  }
  private base(id?:string):string {return (this.api==='v2'?'/api/session':'/session')+(id?'/'+encodeURIComponent(id):'');}
  async bind(profile:Profile,existing?:NativeBinding):Promise<NativeBinding> {
    if(existing) {
      if(existing.api!==this.api)throw new Error('OpenCode 主版本发生变化，不能直接继续旧会话；请保留记录并使用原版本或新建笔记');
      const result=await this.call(this.base(existing.sessionID)),info=this.api==='v2'?result.data:result;
      if(info?.id!==existing.sessionID)throw new Error('OpenCode 会话绑定校验失败');
      return existing;
    }
    const payload:any={title:'TermNote 会话'};
    if(this.api==='v2') {
      payload.location={directory:this.cwd};
      if(profile.model?.trim()) {
        const [providerID,...rest]=profile.model.trim().split('/');if(!providerID||!rest.join('/'))throw new Error('模型格式应为 provider/model');
        payload.model={providerID,id:rest.join('/')};
      }
    }
    const result=await this.call(this.base(),'POST',payload),info=this.api==='v2'?result.data:result;
    if(!/^ses[A-Za-z0-9_-]+$/.test(info?.id))throw new Error('OpenCode 未返回有效原生会话 ID');
    return {kind:'opencode',version:this.version,api:this.api,sessionID:info.id};
  }
  async export(binding:NativeBinding):Promise<unknown> {
    if(this.api==='v2')return (await this.call(`/api/experimental/session/${encodeURIComponent(binding.sessionID)}/export`)).data;
    const info=await this.call(this.base(binding.sessionID));
    const messages=await this.call(this.base(binding.sessionID)+'/message');
    if(!Array.isArray(messages))throw new Error('OpenCode 消息列表接口不匹配');
    return {info,messages};
  }
  terminalArgs(binding:NativeBinding,profile:Profile):string[] {
    if(this.api==='v2')return [...profile.args,'--server',this.url,'--session',binding.sessionID];
    if(profile.model?.trim())throw new Error('OpenCode 1.x 的增强模式请在原生界面选择模型；或使用通用终端模式传入模型参数');
    return ['attach',this.url,'--dir',this.cwd,'--session',binding.sessionID,...profile.args];
  }
  async stop():Promise<void> {
    const child=this.child;if(!child)return;
    child.stdin.end();
    const timer=setTimeout(()=>child.kill(),5000);
    await this.closed;clearTimeout(timer);
  }
}
