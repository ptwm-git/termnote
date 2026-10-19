import type {Settings} from './types';
export type Area='terminal'|'record';
export const PALETTES={
  auto:{name:'跟随 Obsidian',background:'',foreground:''},
  black:{name:'黑色',background:'#000000',foreground:'#e5e5e5'},
  gray:{name:'灰色',background:'#2b2b2b',foreground:'#e5e5e5'},
  light:{name:'浅色',background:'#f7f7f7',foreground:'#202020'},
};
export type Palette=keyof typeof PALETTES;
export function paletteName(settings:Settings,area:Area):Palette|'custom' {
  const bg=area==='terminal'?settings.terminalBackground:settings.recordBackground;
  const fg=area==='terminal'?settings.terminalForeground:settings.recordForeground;
  return (Object.keys(PALETTES) as Palette[]).find(key=>PALETTES[key].background===bg&&PALETTES[key].foreground===fg)??'custom';
}
export function setPalette(settings:Settings,area:Area,key:Palette):void {
  const {background,foreground}=PALETTES[key];
  if(area==='terminal'){settings.terminalBackground=background;settings.terminalForeground=foreground;}
  else {settings.recordBackground=background;settings.recordForeground=foreground;}
}
export function applyAppearance(element:HTMLElement,settings:Settings):void {
  const values={
    '--ant-terminal-background':settings.terminalBackground||'var(--background-primary)',
    '--ant-terminal-foreground':settings.terminalForeground||'var(--text-normal)',
    '--ant-record-background':settings.recordBackground||'var(--background-primary)',
    '--ant-record-foreground':settings.recordForeground||'var(--text-normal)',
    '--ant-record-font-size':settings.recordFontSize+'px',
    '--ant-record-ratio':String(settings.recordRatio),
  };
  for(const [name,value]of Object.entries(values))element.style.setProperty(name,value);
}
