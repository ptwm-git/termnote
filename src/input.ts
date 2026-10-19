/** Transient editing state only. Raw key data is never returned for journaling. */
export class InputDraft {
  private chars:string[]=[];private cursor=0;
  editing=false;unknown=false;navigation=false;paste=false;lineCount=1;
  reset():void{this.chars=[];this.cursor=0;this.editing=false;this.unknown=false;this.navigation=false;this.lineCount=1;this.paste=false;}
  private remove(from:number,count:number):void{for(const text of this.chars.splice(from,count))this.lineCount-=text.split('\n').length-1;}
  get text():string{return this.chars.join('');}
  tokens(data:string):string[]{return data.match(/\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x1bP[\s\S]*?\x1b\\|\x1b\[[0-?]*[ -/]*[@-~]|\x1bO.|\r\n|[\s\S]/gu)??[];}
  accept(token:string):'edit'|'submit'|'cancel'|'none'{
    if(token==='\x1b[200~'){this.paste=true;return 'none';}
    if(token==='\x1b[201~'){this.paste=false;return 'none';}
    if(/^\x1b(?:\[[?>]?[0-9;:]*[cRn]|\[[IO]|\]|P)/u.test(token))return 'none';
    if(!this.paste&&(token==='\r'||token==='\n'||token==='\r\n'||/^\x1b\[13(?:;1)?u$/.test(token)))return 'submit';
    if(token==='\x03'||token==='\x04'&&!this.chars.length){this.reset();return 'cancel';}
    if(token==='\x04'){this.unknown=true;return 'none';}
    if(token==='\x7f'||token==='\b'){if(this.cursor)this.remove(--this.cursor,1);return this.editing?'none':'edit';}
    if(token==='\x15'){this.remove(0,this.cursor);this.cursor=0;return 'none';}
    if(token==='\x17'){while(this.cursor&&/\s/u.test(this.chars[this.cursor-1]))this.remove(--this.cursor,1);while(this.cursor&&!/\s/u.test(this.chars[this.cursor-1]))this.remove(--this.cursor,1);return 'none';}
    if(token==='\x01'||token==='\x1b[H'){this.cursor=0;return 'none';}
    if(token==='\x05'||token==='\x1b[F'){this.cursor=this.chars.length;return 'none';}
    if(token==='\x1b[D'){this.cursor=Math.max(0,this.cursor-1);return 'none';}
    if(token==='\x1b[C'){this.cursor=Math.min(this.chars.length,this.cursor+1);return 'none';}
    if(token==='\x1b[3~'){this.remove(this.cursor,1);return 'none';}
    if(token.startsWith('\x1b')){this.unknown=true;this.navigation||=/^\x1b(?:\[|O)(?:[0-9;]*[AB]|[56]~)$/u.test(token);const start=!this.editing;this.editing=true;return start?'edit':'none';}
    if(token==='\t'){this.unknown=true;const start=!this.editing;this.editing=true;return start?'edit':'none';}
    if(token.charCodeAt(0)<32&&!this.paste)return 'none';
    const start=!this.editing;this.editing=true;this.chars.splice(this.cursor,0,token);this.lineCount+=token.split('\n').length-1;this.cursor++;return start?'edit':'none';
  }
}
