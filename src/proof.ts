import {readFileSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync} from 'node:fs';
export interface ProjectionTrust {has(hash:string):boolean;stage(hash:string):void;}
/** Durable pre-write provenance distinguishes our newer note from an actual user edit. */
export class ProjectionProof implements ProjectionTrust {
  private hashes:string[]=[];
  constructor(private path:string) {
    try {const stored:unknown=JSON.parse(readFileSync(path,'utf8'));if(Array.isArray(stored))this.hashes=stored.filter(h=>typeof h==='string'&&/^[0-9a-f]{64}$/.test(h));}catch{/* no trusted projection yet */}
  }
  has(hash:string):boolean{return this.hashes.includes(hash);}
  stage(hash:string):void {
    const hashes=[hash,...this.hashes.filter(h=>h!==hash)].slice(0,4);
    const temp=this.path+'.tmp',fd=openSync(temp,'w',0o600);
    try {writeFileSync(fd,JSON.stringify(hashes),'utf8');fsyncSync(fd);}finally{closeSync(fd);}
    renameSync(temp,this.path);this.hashes=hashes;
  }
}
