import { binding,hash,patchNote,region } from './note';
import type {ProjectionTrust} from './proof';
export interface NoteAccess { read(path:string):Promise<string>; update(path:string,transform:(text:string)=>string):Promise<void>; }
export class NoteWriter {
  private expected:string|null=null;
  private initialized=false;
  constructor(readonly access:NoteAccess,readonly id:string,public path:string,private lastHash?:string,private proof?:ProjectionTrust) {}
  async init(): Promise<void> {
    const existing=region(await this.access.read(this.path),this.id);
    this.expected=existing?.text??null;
    if(this.lastHash && (!existing || (hash(existing.text)!==this.lastHash && !this.proof?.has(hash(existing.text))))) throw new Error('会话区域在上次保存后被修改或删除，请使用“恢复记录”');
    this.initialized=true;
  }
  async save(body:string): Promise<string> {
    if(!this.initialized) await this.init();
    let next:string|null=null;
    await this.access.update(this.path,text=>{
      const patched=patchNote(text,this.id,body,this.expected);
      next=region(patched,this.id)!.text;
      this.proof?.stage(hash(next));
      return patched;
    });
    this.expected=next;
    this.lastHash=hash(next!);
    return this.lastHash;
  }
  async recover(body:string,document:string):Promise<string> {
    let next:string|null=null;
    await this.access.update(this.path,text=>{
      if(text!==document)throw new Error('备份后笔记又发生变化，已保留原文，请重新恢复');
      if(binding(text)!==this.id)throw new Error('文件会话绑定已变化，拒绝覆盖');
      const old=region(text,this.id);if(!old)throw new Error('找不到完整会话区域，已保留原文，请检查开始和结束标记');
      const patched=patchNote(text,this.id,body,old.text);
      next=region(patched,this.id)!.text;this.proof?.stage(hash(next));return patched;
    });
    this.expected=next;this.lastHash=hash(next!);this.initialized=true;return this.lastHash;
  }
  reset(): void { this.expected=null;this.lastHash=undefined;this.initialized=false; }
}
