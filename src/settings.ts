import {win32} from 'node:path';
import {DEFAULT_SETTINGS,SYSTEM_PROFILE_ID,type Settings,type Profile} from './types';

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const size=(value:unknown,fallback:number,max=24):number=>typeof value==='number'&&Number.isFinite(value)?Math.max(10,Math.min(max,Math.round(value))):fallback;
export const color=(value:unknown,fallback:string):string=>typeof value==='string'&&(value===''||/^#[0-9a-f]{6}$/i.test(value))?value.toLowerCase():fallback;
export const ratio=(value:unknown):number=>typeof value==='number'&&Number.isFinite(value)?Math.max(0.2,Math.min(0.8,value)):0.5;

export function normalizeSettings(value:unknown):Settings {
  const old=object(value),defaults=structuredClone(DEFAULT_SETTINGS);
  const profiles:Profile[]=[];
  if(Array.isArray(old.profiles))for(const item of old.profiles) {
    const p=object(item);
    if(typeof p.id!=='string'||typeof p.name!=='string'||typeof p.executable!=='string'||typeof p.cwd!=='string'||!Array.isArray(p.args)||!p.args.every((arg):arg is string=>typeof arg==='string'))continue;
    profiles.push({id:p.id,name:p.name,executable:p.executable,cwd:p.cwd,args:[...p.args],adapter:p.adapter==='opencode'?'opencode':'terminal',...(typeof p.model==='string'?{model:p.model}:{})});
  }
  // Keep old configurations for explicit history restore. New sessions always use
  // their own system-shell profile and never inherit an old Agent default.
  let shell=profiles.find(p=>p.id===SYSTEM_PROFILE_ID);
  if(!shell) {shell=defaults.profiles[0];profiles.push(shell);}
  shell.adapter='terminal';
  const migrated=old.shellDefaultsVersion===1;
  return {
    ...defaults,python:typeof old.python==='string'?old.python:'',profiles,
    defaultProfile:SYSTEM_PROFILE_ID,shellDefaultsVersion:1,
    fontSize:size(!migrated&&old.fontSize===14?12:old.fontSize,12),
    recordFontSize:size(old.recordFontSize,12,20),
    terminalBackground:color(old.terminalBackground,defaults.terminalBackground),
    terminalForeground:color(old.terminalForeground,defaults.terminalForeground),
    recordBackground:color(old.recordBackground,''),recordForeground:color(old.recordForeground,''),
    recordRatio:ratio(old.recordRatio),
  };
}

export function defaultShell(platform:NodeJS.Platform,env:NodeJS.ProcessEnv):{executable:string;args:string[]} {
  return platform==='win32'
    ?{executable:env.SystemRoot?win32.join(env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'):'powershell.exe',args:['-NoLogo']}
    :{executable:env.SHELL||'/bin/zsh',args:['-l']};
}
