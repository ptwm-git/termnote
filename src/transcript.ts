import { Terminal } from '@xterm/headless';
import { fence } from './note';
type Piece = {kind:'line'|'frame';text:string};
/** Parse every output chunk. Completed lines live outside xterm's bounded scrollback. */
export class Transcript {
  readonly terminal: Terminal;
  private pieces: Piece[]=[];
  private lastFrame='';
  private redraw=false;
  private tail='';
  private wrappedPrefix='';
  private queue: Promise<void>=Promise.resolve();
  constructor(cols=100,rows=30) {
    this.terminal=new Terminal({cols,rows,scrollback:10000,allowProposedApi:true});
    this.terminal.onScroll(()=>{
      const b=this.terminal.buffer.active,y=b.baseY+b.cursorY;
      // Archive each soft-wrap as it scrolls, before bounded scrollback can trim it.
      if(b.type==='normal' && b.getLine(y)?.isWrapped && y>0) {
        this.wrappedPrefix+=this.wrappedPrefix?(b.getLine(y-1)?.translateToString(false)??''):this.logicalLine(y-1,false);
      }
    });
    this.terminal.onLineFeed(()=> {
      const b=this.terminal.buffer.active;
      if(b.type==='alternate') return;
      const y=b.baseY+b.cursorY-1;
      if(y>=0) this.pieces.push({kind:'line',text:this.wrappedPrefix?this.wrappedPrefix+(b.getLine(y)?.translateToString(true)??''):this.logicalLine(y)});
      this.wrappedPrefix='';
    });
    this.terminal.parser.registerCsiHandler({final:'J'},p=>{
      if(p[0]===2 || p[0]===3) this.captureFrame();
      return false;
    });
    this.terminal.parser.registerCsiHandler({prefix:'?',final:'l'},p=>{
      if(p.includes(1049)||p.includes(1047)||p.includes(47)) this.captureFrame();
      return false;
    });
  }
  private logicalLine(y: number,trim=true): string {
    const b=this.terminal.buffer.active;
    let from=y;
    while(from>0 && b.getLine(from)?.isWrapped) from--;
    let result='';
    for(let i=from;i<=y;i++) result+=b.getLine(i)?.translateToString(trim && i===y)??'';
    return result;
  }
  private screen(): string {
    const b=this.terminal.buffer.active, lines:string[]=[];
    for(let y=0;y<this.terminal.rows;y++) lines.push(b.getLine(b.baseY+y)?.translateToString(true)??'');
    return lines.join('\n').trimEnd();
  }
  private captureFrame(): void {
    const text=this.screen();
    if(text && text!==this.lastFrame) { this.pieces.push({kind:'frame',text}); this.lastFrame=text; }
  }
  feed(data: string): Promise<void> {
    this.queue=this.queue.then(()=>new Promise<void>(resolve=> {
      if(/\x1b\[[\d;?]*[HFAK]/.test(data)) this.redraw=true;
      this.terminal.write(data,()=>{
        const b=this.terminal.buffer.active;
        this.tail=b.type==='normal'?(this.wrappedPrefix?this.wrappedPrefix+(b.getLine(b.baseY+b.cursorY)?.translateToString(true)??''):this.logicalLine(b.baseY+b.cursorY)):'';
        resolve();
      });
    }));
    return this.queue;
  }
  resize(cols: number,rows: number): void { this.terminal.resize(cols,rows); }
  async render(): Promise<string> {
    await this.queue;
    if(this.terminal.buffer.active.type==='alternate' || this.redraw) { this.captureFrame(); this.redraw=false; }
    let result='', lines:string[]=[];
    const flush=()=>{if(lines.length) {result+=fence(lines.join('\n'))+'\n\n';lines=[];}};
    for(const p of this.pieces) {
      if(p.kind==='line') lines.push(p.text);
      else { flush(); result+='**终端界面快照**\n\n'+fence(p.text)+'\n\n'; }
    }
    if(this.tail) lines.push(this.tail);
    flush();
    return result || '_等待终端输出。_\n';
  }
  dispose(): void { this.terminal.dispose(); }
}
