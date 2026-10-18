import { App,MarkdownView,TFile } from 'obsidian';
import type { NoteAccess } from './writer';
export class ObsidianNotes implements NoteAccess {
  constructor(private app:App) {}
  private file(path:string):TFile {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)) throw new Error('绑定笔记不存在，已保留原始日志');
    return file;
  }
  private editor(path:string) {
    return this.app.workspace.getLeavesOfType('markdown').map(leaf=>leaf.view)
      .find(view=>view instanceof MarkdownView && view.file?.path===path) as MarkdownView|undefined;
  }
  async read(path:string):Promise<string> {return this.editor(path)?.editor.getValue()??this.app.vault.read(this.file(path));}
  async update(path:string,transform:(text:string)=>string):Promise<void> {
    const view=this.editor(path);
    if(view) {
      const text=view.editor.getValue(),next=transform(text);
      if(text===next) return;
      let from=0,suffix=0;
      while(from<text.length && from<next.length && text[from]===next[from]) from++;
      while(suffix<text.length-from && suffix<next.length-from && text[text.length-1-suffix]===next[next.length-1-suffix]) suffix++;
      view.editor.replaceRange(next.slice(from,next.length-suffix),view.editor.offsetToPos(from),view.editor.offsetToPos(text.length-suffix));
      // Persist the current editor value before acknowledging a saved note.
      await view.save();
    } else await this.app.vault.process(this.file(path),transform);
  }
}
