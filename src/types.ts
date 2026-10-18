export interface Profile { id: string; name: string; executable: string; args: string[]; cwd: string; adapter?: 'terminal'|'opencode'; model?:string; }
export interface NativeBinding { kind:'opencode'; version:string; api:'v1'|'v2'; sessionID:string; }
export interface Settings { python: string; fontSize: number; profiles: Profile[]; defaultProfile: string; }
export type RunState = 'idle' | 'starting' | 'running' | 'ended' | 'interrupted' | 'failed' | 'missing';
export interface RecordData {
  id: string; path: string; visible: boolean; profile: string; created: string;
  state: RunState; cwd: string; executable: string; args: string[]; lastHash?: string; journalError?: string;
  launch?:Profile; native?:NativeBinding;
}
export interface PluginData { settings: Settings; records: RecordData[]; counters: Record<string, number>; }
export interface BridgeEvent { type: 'start'|'output'|'resize'|'exit'|'error'; seq: number; time: string; data?: string; bytes?: string; cols?: number; rows?: number; code?: number; message?: string; }
export const DEFAULT_SETTINGS: Settings = {
  python: '', fontSize: 14, defaultProfile: 'opencode',
  profiles: [
    {id:'opencode',name:'OpenCode',executable:'opencode',args:[],cwd:'',adapter:'opencode',model:''},
    {id:'shell',name:'系统终端',executable:'',args:[],cwd:'',adapter:'terminal'},
  ],
};
export const STATE_LABEL: Record<RunState,string> = {idle:'待启动',starting:'启动中',running:'运行中',ended:'已结束',interrupted:'已中断',failed:'启动失败',missing:'文件已删除'};
