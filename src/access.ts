import { App,MarkdownView,TFile } from 'obsidian';
import type { NoteAccess } from './writer';
export class ObsidianNotes implements NoteAccess {
  constructor(private app:App) {}
  private file(path:string):TFile {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)) throw new Error('绑定笔记不存在，已保留原始日志');
    return file;
  }
  private editors(path:string):MarkdownView[] {
    return this.app.workspace.getLeavesOfType('markdown').map(leaf=>leaf.view)
      .filter(view=>view instanceof MarkdownView && view.file?.path===path) as MarkdownView[];
  }
  private consistent(views:MarkdownView[]):string{
    const text=views[0].editor.getValue();
    if(views.some(view=>view.editor.getValue()!==text))throw new Error('同一笔记的多个编辑器内容不一致，请先保存或关闭重复编辑器后重试同步');
    return text;
  }
  async read(path:string):Promise<string> {const views=this.editors(path);return views.length?this.consistent(views):this.app.vault.read(this.file(path));}
  async update(path:string,transform:(text:string)=>string):Promise<void> {
    const views=this.editors(path);
    if(views.length) {
      const text=this.consistent(views),next=transform(text);
      if(text===next) return;
      let from=0,suffix=0;
      while(from<text.length && from<next.length && text[from]===next[from]) from++;
      while(suffix<text.length-from && suffix<next.length-from && text[text.length-1-suffix]===next[next.length-1-suffix]) suffix++;
      for(const view of views)if(view.editor.getValue()!==next)view.editor.replaceRange(next.slice(from,next.length-suffix),view.editor.offsetToPos(from),view.editor.offsetToPos(text.length-suffix));
      // Persist the current editor value before acknowledging a saved note.
      const saved=await Promise.allSettled(views.map(view=>view.save())),failed=saved.find(result=>result.status==='rejected');
      if(failed?.status==='rejected'){
        const unchanged=views.every(view=>view.editor.getValue()===next);
        for(const view of views)if(view.editor.getValue()===next)view.editor.replaceRange(text,view.editor.offsetToPos(0),view.editor.offsetToPos(next.length));
        if(unchanged)await Promise.allSettled(views.map(view=>view.save()));
        throw new Error('笔记保存失败，未继续同步；原文或恢复前备份仍保留：'+String(failed.reason));
      }
    } else await this.app.vault.process(this.file(path),transform);
  }
}
