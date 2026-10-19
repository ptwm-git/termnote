export interface Profile { id: string; name: string; executable: string; args: string[]; cwd: string; adapter?: 'terminal'|'opencode'; model?:string; }
export interface NativeBinding { kind:'opencode'; version:string; api:'v1'|'v2'; sessionID:string; }
export interface Settings {
  python: string; fontSize: number; recordFontSize: number;
  profiles: Profile[]; defaultProfile: string; shellDefaultsVersion: 1;
  terminalBackground: string; terminalForeground: string;
  recordBackground: string; recordForeground: string; recordRatio: number;
}
export type RunState = 'idle' | 'starting' | 'running' | 'ended' | 'interrupted' | 'failed' | 'missing';
export interface RecordData {
  id: string; path: string; sourcePath?: string; visible: boolean; profile: string; created: string;
  state: RunState; cwd: string; executable: string; args: string[]; lastHash?: string; journalError?: string;
  launch?:Profile; native?:NativeBinding; transcriptVersion?:2; generated?:true; discarded?:true; sharedArchive?:true; syncEnabled?:boolean; recordingVersion?:1;
}
export interface PluginData { settings: Settings; records: RecordData[]; counters: Record<string, number>; }
export interface BridgeEvent { type: 'start'|'output'|'resize'|'exit'|'error'|'interaction'|'recording'; enabled?:boolean; request?:string; action?:'edit'|'submit'|'cancel'; inputLines?:number; inputKind?:'input'|'operation'; echo?:string; seq: number; time: string; data?: string; bytes?: string; cols?: number; rows?: number; code?: number; message?: string; }
export const SYSTEM_PROFILE_ID = 'termnote-system-shell';
export const DEFAULT_SETTINGS: Settings = {
  python: '', fontSize: 12, recordFontSize: 12,
  defaultProfile: SYSTEM_PROFILE_ID, shellDefaultsVersion: 1,
  terminalBackground: '#000000', terminalForeground: '#e5e5e5',
  recordBackground: '', recordForeground: '', recordRatio: 0.5,
  profiles: [{id:SYSTEM_PROFILE_ID,name:'系统终端',executable:'',args:[],cwd:'',adapter:'terminal'}],
};
export const STATE_LABEL: Record<RunState,string> = {idle:'待启动',starting:'启动中',running:'运行中',ended:'已结束',interrupted:'已中断',failed:'启动失败',missing:'文件已删除'};
