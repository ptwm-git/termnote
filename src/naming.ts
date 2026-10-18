const DIGITS = '零一二三四五六七八九';
export function chineseNumber(n: number): string {
  if (!Number.isSafeInteger(n) || n<1) throw new Error('序号必须是正整数');
  if (n>=10000) return String(n);
  const units=['','十','百','千']; let result='', zero=false;
  for(let p=3;p>=0;p--) {
    const d=Math.floor(n/10**p)%10;
    if(d) { if(zero) result+='零'; result+=DIGITS[d]+units[p]; zero=false; }
    else if(result && n%10**p) zero=true;
  }
  return result.startsWith('一十') ? result.slice(1) : result;
}
export function fileName(n: number): string { return `终端页面${chineseNumber(n)}.md`; }
export function validateName(input: string): string {
  const name=input.trim().replace(/\.md$/i,'');
  if(!name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('名称为空或含 Windows/macOS 不支持的字符');
  if(name.length>180) throw new Error('文件名过长，请使用较短的名称');
  return name+'.md';
}
export function pathFor(folder: string,name: string): string { return folder ? folder+'/'+name : name; }
export function parentPath(path: string): string { return path.includes('/') ? path.slice(0,path.lastIndexOf('/')) : ''; }
