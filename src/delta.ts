/** Stable row identities for full-screen redraws. Missing rows are retained as
 * anchors: a clear/partial repaint must not re-append the previous viewport. */
export interface DeltaRow<T> {text:string;value?:T;ephemeral?:boolean;update:(text:string,index:number)=>boolean;}
export class ScreenDelta<T> {
  private rows:DeltaRow<T>[]=[];
  private frame:DeltaRow<T>[]=[];
  at(index:number):DeltaRow<T>|undefined{return this.frame[index];}
  existingKey(text:string):string|undefined{return [...this.frame,...this.rows].find(row=>!row.ephemeral&&row.text.replace(/^\u0000turn:\d+:/u,'')===text)?.text;}
  dropDrafts():void{this.rows=this.rows.filter(row=>!row.ephemeral);}
  scroll(indices:number[]):void{const removed=new Set(indices.map(index=>this.frame[index]));this.rows=this.rows.filter(row=>!removed.has(row));}
  update(texts:string[],create:(text:string,index:number)=>DeltaRow<T>):DeltaRow<T>[] {
    const old=this.rows,n=old.length,m=texts.length,frame:DeltaRow<T>[]=[];
    const table=Array.from({length:n+1},()=>new Uint16Array(m+1));
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)table[i][j]=old[i].text===texts[j]?1+table[i+1][j+1]:Math.max(table[i+1][j],table[i][j+1]);
    const anchors:[number,number][]=[];let i=0,j=0;
    while(i<n&&j<m){if(old[i].text===texts[j]){anchors.push([i++,j++]);}else if(table[i+1][j]>=table[i][j+1])i++;else j++;}
    const anchored=new Set(anchors.map(pair=>old[pair[0]])),used=new Set<DeltaRow<T>>(),assigned=new Set<DeltaRow<T>>(),moved=new Set<DeltaRow<T>>();
    const make=(text:string,index:number)=>{const reusable=old.find(row=>row.text===text&&!anchored.has(row)&&!assigned.has(row));const row=reusable??create(text,index);if(reusable){moved.add(row);const index=merged.indexOf(row);if(index>=0)merged.splice(index,1);}assigned.add(row);used.add(row);frame[index]=row;return row;};
    anchors.push([n,m]);const merged:DeltaRow<T>[]=[];let from=0,to=0;
    for(const [endOld,endNew]of anchors){
      const left=old.slice(from,endOld),right=texts.slice(to,endNew);
      const kept:DeltaRow<T>[]=[],added:DeltaRow<T>[]=[];
      for(let k=0;k<Math.max(left.length,right.length);k++){
        const candidate=left[k],previous=candidate&&!used.has(candidate)?candidate:undefined,text=right[k];
        if(text===undefined){if(previous)kept.push(previous);continue;}
        if(previous&&previous.update(text,to+k)){previous.text=text;kept.push(previous);assigned.add(previous);frame[to+k]=previous;}
        else {if(previous)kept.push(previous);added.push(make(text,to+k));}
      }
      for(const row of kept)if(!used.has(row)&&!moved.has(row)){merged.push(row);used.add(row);}merged.push(...added);
      if(endOld<n){merged.push(old[endOld]);used.add(old[endOld]);frame[endNew]=old[endOld];}from=endOld+1;to=endNew+1;
    }
    this.frame=frame;this.rows=merged.slice(-1000);return this.rows;
  }
}
