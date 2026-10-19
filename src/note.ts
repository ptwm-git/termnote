import { createHash } from 'node:crypto';
export function hash(text: string): string { return createHash('sha256').update(text).digest('hex'); }
export function markers(id: string) { return {start:`<!-- ant:${id}:start -->`,end:`<!-- ant:${id}:end -->`,binding:`<!-- ant-session:${id} -->`}; }
function controlLines(text:string):{line:string;offset:number}[] {
  const result:{line:string;offset:number}[]=[];
  let offset=0,codeChar='',codeLength=0;
  for(const raw of text.split('\n')) {
    const line=raw.replace(/\r$/,'');
    const fenced=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if(fenced) {
      if(!codeChar){codeChar=fenced[1][0];codeLength=fenced[1].length;}
      else if(fenced[1][0]===codeChar && fenced[1].length>=codeLength && !fenced[2].trim()){codeChar='';codeLength=0;}
    } else if(!codeChar)result.push({line,offset});
    offset+=raw.length+1;
  }
  return result;
}
export function binding(text: string): string|undefined {
  for(const {line} of controlLines(text)) {const match=/^<!-- ant-session:([0-9a-f-]{36}) -->$/.exec(line);if(match)return match[1];}
  return undefined;
}
export function region(text: string,id: string): {text:string;from:number;to:number}|null {
  const m=markers(id),lines=controlLines(text),starts=lines.filter(x=>x.line===m.start),ends=lines.filter(x=>x.line===m.end);
  if(!starts.length && !ends.length)return null;
  const a=starts[0]?.offset??-1,b=ends[0]?.offset??-1;
  if(starts.length!==1 || ends.length!==1 || b<a)throw new Error('会话记录边界已被修改，请使用“恢复记录”');
  return {text:text.slice(a,b+m.end.length),from:a,to:b+m.end.length};
}
export function fence(text: string): string {
  const longest=Math.max(2,...Array.from(text.matchAll(/`+/g),x=>x[0].length));
  const ticks='`'.repeat(longest+1);
  return ticks+'text\n'+text+'\n'+ticks;
}
export function patchNote(text: string,id: string,body: string,expected: string|null): string {
  const m=markers(id), old=region(text,id), next=m.start+'\n'+body+'\n'+m.end;
  if((old?.text??null)!==expected) throw new Error('笔记会话区域发生变化，已暂停写入以保护原文；点击同步开关备份并恢复');
  if(old) return text.slice(0,old.from)+next+text.slice(old.to);
  if(expected!==null) throw new Error('会话记录区域被删除，请先恢复记录');
  const hasBinding=binding(text)===id;
  return text+(!text.endsWith('\n')?'\n':'')+'\n'+(!hasBinding?m.binding+'\n':'')+next+'\n';
}
export function detachCopiedBinding(text: string,id: string): string {
  const m=markers(id);
  // Keep copied content readable, but remove control markers so a new record can be added.
  const replacements:Record<string,string>={[m.binding]:'',[m.start]:'<!-- 复制的历史记录开始 -->',[m.end]:'<!-- 复制的历史记录结束 -->'};
  let result=text;
  for(const {line,offset} of controlLines(text).reverse())if(Object.hasOwn(replacements,line))result=result.slice(0,offset)+replacements[line]+result.slice(offset+line.length);
  return result;
}
