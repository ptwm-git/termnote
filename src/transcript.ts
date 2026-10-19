import {Terminal} from '@xterm/headless';
import {fence} from './note';
import {ScreenDelta,type DeltaRow} from './delta';
import type {BridgeEvent} from './types';
type Line={text:string;sealed:boolean};
type Block={kind:'input'|'output'|'operation';lines:Line[]};
const compact=(text:string)=>text.replace(/\s+/gu,'').normalize('NFC');
const prompt=(text:string)=>/^(?:[#$%❯›>]\s*|[^\s]+@[^\s]+[^\r\n]*[#$%>]\s*|PS [^\r\n]*>\s*)$/u.test(text);
const animated=(text:string)=>/^\s*[\u2800-\u28ff]/u.test(text);
const clean=(text:string)=>text.trim().replace(/^[│┃]\s*/u,'').replace(/\s*[│┃]$/u,'').replace(/^[❯›▶\u2800-\u28ff]\s*/u,'').trim();
const decoration=(text:string)=>!text||/^[\s─━═│┃┌┐└┘├┤┬┴┼╭╮╰╯╪╫╔╗╚╝╠╣╦╩╬▀╹]+$/u.test(text);
export class Transcript {
  readonly terminal:Terminal;
  private blocks:Block[]=[];private output?:Block;private tail?:Line;
  private queue:Promise<void>=Promise.resolve();private wrappedPrefix='';
  private editing=false;private inputPrefix='';private inputLine='';private echo='';private submitted='';
  private delta=new ScreenDelta<Line>();private screenMode=false;private inputRow=0;private inputStart=0;private frameRows:{text:string;raw:string;start:number;end:number}[]=[];
  private inputLines=1;private draftLines:string[]=[];private completedDraftLines=0;
  private roundCleared=false;private awaitingAnswer=false;private confirmedInputs=new Set<string>();
  private synchronized=false;
  private turns:string[][]=[];private plainTurn=0;private cancelling=false;private cancelEcho='';
  private pendingEdit=false;private echoIndices=new Set<number>();
  constructor(cols=100,rows=30){
    this.terminal=new Terminal({cols,rows,scrollback:10000,allowProposedApi:true});
    this.terminal.onScroll(()=>{
      const b=this.terminal.buffer.active,y=b.baseY+b.cursorY;
      if(this.fullScreen&&b.cursorY===this.terminal.rows-1){
        this.delta.scroll(this.frameRows.flatMap((row,index)=>row.start===0?[index]:[]));
        if(this.editing)this.inputRow=Math.max(0,this.inputRow-1);
        this.capture();
      }
      if(b.type==='normal'&&b.getLine(y)?.isWrapped&&y>0)this.wrappedPrefix+=this.wrappedPrefix?(b.getLine(y-1)?.translateToString(false)??''):this.logicalLine(y-1,false);
    });
    this.terminal.onLineFeed(()=>{
      const b=this.terminal.buffer.active,y=b.baseY+b.cursorY-1;
      if(this.editing&&this.completedDraftLines<this.inputLines-1&&!b.getLine(y+1)?.isWrapped){this.draftLines.push(b.getLine(y)?.translateToString(true)??'');this.completedDraftLines++;if(this.fullScreen)this.capture();return;}
      if(b.type!=='normal'||this.screenMode){this.capture();return;}if(y<0||b.getLine(y+1)?.isWrapped)return;
      const text=this.wrappedPrefix?this.wrappedPrefix+(b.getLine(y)?.translateToString(true)??''):this.logicalLine(y);this.wrappedPrefix='';
      if(this.cancelling){this.cancelling=false;this.editing=this.pendingEdit;this.pendingEdit=false;this.inputStart=b.baseY+b.cursorY;this.inputRow=b.cursorY;this.completedDraftLines=0;this.draftLines=[];return;}
      if(this.editing&&this.inputPrefix&&text.startsWith(this.inputPrefix))return;
      const submittedEcho=this.submitted&&text.trimEnd().endsWith(this.submitted)&&prompt(text.trimEnd().slice(0,-this.submitted.length));
      if(this.echo&&(text.trimEnd()===this.echo.trimEnd()||submittedEcho)){this.echo='';this.tail=undefined;return;}
      if(text.trim()){if(this.tail&&!this.tail.sealed)this.tail.text=text;else this.line(text);this.tail=undefined;}
    });
    for(const final of ['H','f','A','F'])this.terminal.parser.registerCsiHandler({final},()=>{if(!this.screenMode){this.delta.update(this.viewport().map(text=>'\u0000turn:0:'+text),text=>({text,update:()=>false}));this.screenMode=true;}return false;});
    this.terminal.parser.registerCsiHandler({prefix:'?',final:'h'},params=>{if(params.some(p=>p===2026))this.synchronized=true;return false;});
    this.terminal.parser.registerCsiHandler({final:'J'},params=>{if(params[0]===2||params[0]===3){this.capture();if(!this.editing){this.delta.dropDrafts();if(this.awaitingAnswer)this.roundCleared=true;}}return false;});
    this.terminal.parser.registerCsiHandler({prefix:'?',final:'l'},params=>{if(params.some(p=>p===2026)){this.synchronized=false;this.capture(true);}if(params.some(p=>p===1049||p===1047||p===47)){this.capture();this.seal();this.screenMode=false;this.delta=new ScreenDelta<Line>();}return false;});
  }
  private logicalLine(y:number,trim=true):string{
    const b=this.terminal.buffer.active;let from=y;while(from>0&&b.getLine(from)?.isWrapped)from--;
    let text='';for(let i=from;i<=y;i++)text+=b.getLine(i)?.translateToString(trim&&i===y)??'';return text;
  }
  private cursorLine():string{const b=this.terminal.buffer.active;return this.logicalLine(b.baseY+b.cursorY);}
  private viewportRows():{text:string;raw:string;start:number;end:number}[]{
    const b=this.terminal.buffer.active,lines:{text:string;raw:string;start:number;end:number}[]=[];
    for(let y=0;y<this.terminal.rows;y++){
      const line=b.getLine(b.baseY+y),text=line?.translateToString(true)??'';
      if(line?.isWrapped&&lines.length){const last=lines[lines.length-1];last.raw+=text;last.end=y;}
      else lines.push({text:'',raw:text,start:y,end:y});
    }
    return lines.map(line=>({...line,text:clean(line.raw)})).filter(line=>!decoration(line.text));
  }
  private viewport():string[]{return this.viewportRows().map(line=>line.text);}
  private currentOutput():Block{
    if(!this.output){this.output={kind:'output',lines:[]};this.blocks.push(this.output);}return this.output;
  }
  private line(text:string):Line{const line={text,sealed:false};this.currentOutput().lines.push(line);return line;}
  private seal():void{for(const block of this.blocks)for(const line of block.lines)line.sealed=true;this.output=undefined;this.tail=undefined;}
  get fullScreen():boolean{return this.screenMode||this.terminal.buffer.active.type==='alternate';}
  private inputBounds():[number,number]{
    const b=this.terminal.buffer.active,bordered=(y:number)=>y>=0&&y<this.terminal.rows&&/^\s*[│┃]/u.test(b.getLine(b.baseY+y)?.translateToString(true)??'');
    let from=this.inputRow,to=Math.max(from,b.cursorY);if(bordered(from)){while(bordered(from-1))from--;while(bordered(to+1))to++;}return [from,to];
  }
  private draftRow(index:number):boolean{const row=this.frameRows[index],[from,to]=this.inputBounds();return !!(this.editing&&row&&row.start<=to&&row.end>=from);}
  private echoRow(index:number):boolean{return this.echoIndices.has(index);}
  private capture(final=false):void{
    if(this.synchronized)return;
    if(this.terminal.buffer.active.type==='normal'&&!this.screenMode)return;
    const previousRows=this.frameRows,rows=this.viewportRows();this.frameRows=rows;if(!rows.length)return;
    this.echoIndices=new Set<number>();const boundaryCandidates=new Set<number>();
    // ConPTY can redraw an ordinary prompt using cursor addressing. Only an
    // exact submitted line with its non-empty prompt prefix counts as this echo.
    if(clean(this.inputPrefix)&&this.submitted){const index=rows.findIndex(row=>compact(row.text)===compact(clean(this.inputPrefix+this.submitted))||this.echo&&compact(row.text)===compact(clean(this.echo)));if(index>=0)this.echoIndices.add(index);}
    for(const text of this.confirmedInputs){
      const positions=rows.flatMap((row,index)=>compact(row.text)===text&&/^\s*(?:[│┃]|[❯›>])/u.test(row.raw)?[index]:[]),budget=this.turns.filter(parts=>parts.includes(text)).length;
      for(let n=0;n<Math.min(budget,positions.length);n++){
        const index=positions[Math.floor(n*positions.length/Math.min(budget,positions.length))],row=rows[index],b=this.terminal.buffer.active;
        const box=[row.start-1,row.end+1].some(y=>{const raw=b.getLine(b.baseY+y)?.translateToString(true)??'';return /^\s*[│┃]/u.test(raw)&&!clean(raw);});
        boundaryCandidates.add(index);
        // An unknown application's bare vertical border does not identify a
        // role. Retain ambiguous same-text output rather than deleting answers.
        if(box||/^\s*[❯›>]/u.test(row.raw))this.echoIndices.add(index);
      }
    }
    const draft=(index:number)=>this.draftRow(index);
    const echo=(index:number)=>this.echoRow(index);
    for(let index=0;index<rows.length;index++)if(echo(index)){
      const prior=previousRows.findIndex(row=>row.start===rows[index].start&&row.text===rows[index].text),old=this.delta.at(prior);
      if(old?.value&&!old.value.sealed){old.value.text='';old.value=undefined;old.ephemeral=true;}
    }
    // Scope answer identities to visible message boundaries. Match repeated user
    // messages from the bottom so old history and a new identical answer coexist.
    const boundaries=new Map<number,number>();
    for(const text of this.confirmedInputs){
      const positions=rows.flatMap((row,index)=>boundaryCandidates.has(index)&&compact(row.text)===text?[index]:[]),turns=this.turns.flatMap((parts,index)=>parts.includes(text)?[index+1]:[]);
      for(let i=positions.length-1,j=turns.length-1;i>=0;i--,j--)boundaries.set(positions[i],turns[Math.max(0,j)]??0);
    }
    if(final&&this.roundCleared&&rows.length&&!boundaries.size){this.plainTurn=this.turns.length;this.roundCleared=false;}
    let scope=this.plainTurn;const scopes=rows.map((_,index)=>{scope=boundaries.get(index)??scope;return scope;});
    const firstBoundary=boundaries.size?Math.min(...boundaries.keys()):rows.length;
    const keys=rows.map((row,index)=>draft(index)||echo(index)?'\u0000input:'+row.text:(index<firstBoundary&&(!this.plainTurn||boundaries.size)?this.delta.existingKey(row.text):undefined)??'\u0000turn:'+scopes[index]+':'+row.text);
    const ordered=this.delta.update(keys,(key,index)=>{
      const text=rows[index].text,ephemeral=draft(index)||echo(index)||this.terminal.buffer.active.type==='normal'&&prompt(rows[index].raw);
      const line=ephemeral?undefined:this.line(text);let spinner=animated(rows[index].raw);
      const row:DeltaRow<Line>={text:key,value:line,ephemeral,update:(next,target)=>{
        const text=this.frameRows[target]?.text??'';
        if(line&&!line.sealed&&(draft(target)||echo(target))){line.text='';row.value=undefined;row.ephemeral=true;return true;}
        if(line&&!line.sealed&&!draft(target)&&(spinner||text.startsWith(line.text)||line.text.startsWith(text))){if(spinner||text.length>=line.text.length)line.text=text;spinner=animated(this.frameRows[target]?.raw??'');return true;}
        return !line&&draft(target);
      }};return row;
    });
    if(this.output){const lines=new Set(this.output.lines),mapped=ordered.flatMap(row=>row.value&&lines.has(row.value)?[row.value]:[]),known=new Set(mapped);this.output.lines=[...this.output.lines.filter(line=>!known.has(line)),...mapped];}
  }

  async feed(data:string):Promise<void>{
    this.queue=this.queue.then(()=>new Promise<void>(resolve=>{
      this.terminal.write(data,()=>{
        if(this.terminal.buffer.active.type==='alternate'||this.screenMode)this.capture(true);
        else if(!this.editing){
          const text=this.wrappedPrefix?this.wrappedPrefix+(this.terminal.buffer.active.getLine(this.terminal.buffer.active.baseY+this.terminal.buffer.active.cursorY)?.translateToString(true)??''):this.cursorLine();
          if(text.trim()&&!prompt(text)&&text!==this.echo){
            if(this.tail&&!this.tail.sealed)this.tail.text=text;else this.tail=this.line(text);
          }else if(this.tail&&!this.tail.sealed){this.tail.text='';this.tail=undefined;}
        }
        if(this.cancelling&&this.fullScreen&&!this.viewportRows().some(row=>row.raw.includes(this.cancelEcho.trim()))){this.cancelling=false;this.editing=this.pendingEdit;this.pendingEdit=false;}
        resolve();
      });
    }));return this.queue;
  }
  async interaction(event:BridgeEvent):Promise<void>{
    await this.queue;
    if(event.action==='edit'){
      this.inputLines=event.inputLines??this.inputLines;
      if(this.cancelling){this.pendingEdit=true;return;}
      if(this.editing)return;
      const b=this.terminal.buffer.active,y=b.baseY+b.cursorY;this.inputLine=this.logicalLine(y);this.inputPrefix=this.inputLine;this.inputRow=b.cursorY;this.inputStart=y;while(this.inputStart>0&&b.getLine(this.inputStart)?.isWrapped)this.inputStart--;
      if(b.type==='normal'&&prompt(this.inputLine))this.screenMode=false;
      if(this.tail&&!this.tail.sealed&&this.tail.text===this.inputLine&&prompt(this.inputLine)){this.tail.text='';this.tail=undefined;}
      this.draftLines=[];this.completedDraftLines=0;this.seal();this.editing=true;return;
    }
    if(event.action==='cancel'){this.cancelling=this.editing;this.cancelEcho=this.cursorLine();this.inputLines=1;this.seal();return;}
    if(event.action==='submit'){
      this.capture();this.echo=event.echo??'';this.submitted=event.data??'';this.editing=false;this.seal();
      this.inputLines=1;this.awaitingAnswer=true;this.roundCleared=false;if(event.data&&event.inputKind!=='operation')for(const text of [event.data,...event.data.split('\n')])if(text.trim())this.confirmedInputs.add(compact(text));
      if(event.data&&event.inputKind!=='operation')this.turns.push([event.data,...event.data.split('\n')].filter(text=>text.trim()).map(compact));
      if(event.data)this.blocks.push({kind:event.inputKind==='operation'?'operation':'input',lines:[{text:event.data,sealed:true}]});
    }
  }
  /** Only characters present in the input area may become a durable input event. */
  async visibleInput(expected:string,unknown=false):Promise<{text:string;echo:string}>{
    await this.queue;const b=this.terminal.buffer.active,line=this.cursorLine();
    let area='';const y=b.baseY+b.cursorY;
    if(y>=this.inputStart&&y-this.inputStart<10000){
      for(let row=this.inputStart;row<=y;row++){const current=b.getLine(row);if(row>this.inputStart&&!current?.isWrapped)area+='\n';area+=current?.translateToString(!b.getLine(row+1)?.isWrapped)??'';}
    }
    if(b.type==='alternate'&&this.draftLines.length)area=[...this.draftLines,line].join('\n');
    const raw=area.startsWith(this.inputPrefix)?area.slice(this.inputPrefix.length).trim():line.startsWith(this.inputPrefix)?line.slice(this.inputPrefix.length).trim():'';
    let candidate=this.fullScreen?raw.split('\n').map(clean).filter(value=>!decoration(value)).join('\n'):raw;
    if(this.fullScreen&&expected.trim()&&compact(clean(line))===compact(expected))candidate=expected.trim();
    if(this.fullScreen&&expected.trim()&&compact(candidate)!==compact(expected)){
      const [from,to]=this.inputBounds(),box=[];
      for(let row=from;row<=to;row++){const value=b.getLine(b.baseY+row)?.translateToString(true)??'';if(/^\s*[│┃]/u.test(value))box.push(clean(value));}
      const text=box.filter(value=>!decoration(value)).join('\n');if(compact(text)===compact(expected))candidate=expected.trim();
    }
    if(/^[*•●·\s]+$/u.test(candidate))return {text:'',echo:line};
    if(expected.trim()){
      if(compact(candidate)===compact(expected))candidate=expected.trim();
      else if(!unknown)candidate='';
    }
    if(!candidate||/^[*•●·\s]+$/u.test(candidate))return {text:'',echo:line};
    return {text:candidate,echo:line};
  }
  resize(cols:number,rows:number):void{this.terminal.resize(cols,rows);}
  async render():Promise<string>{
    await this.queue;
    return this.blocks.map(block=>{
      const text=block.lines.map(line=>line.text).filter(Boolean).join('\n');
      return text?`### ${block.kind==='input'?'我':block.kind==='operation'?'操作':'终端'}\n\n${fence(text)}\n\n`:'';
    }).join('')||'_等待终端输出。_\n';
  }
  dispose():void{this.terminal.dispose();}
}
