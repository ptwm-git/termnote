import { build } from 'esbuild';
import { builtinModules } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const notices=(await readFile('LICENSE','utf8'))+'\n'+(await readFile('THIRD-PARTY-NOTICES.txt','utf8'));
await build({entryPoints:['src/main.ts'],outfile:'main.js',bundle:true,format:'cjs',platform:'node',target:'es2022',banner:{js:'/*\n'+notices.replaceAll('*/','* /')+'\n*/'},define:{BRIDGE_SOURCE:JSON.stringify(await readFile('bridge.py','utf8'))},external:['obsidian','electron',...builtinModules,...builtinModules.map(x=>`node:${x}`)],minify:false});
await writeFile('styles.css', (await readFile('node_modules/@xterm/xterm/css/xterm.css','utf8'))+'\n'+(await readFile('src/styles.css','utf8')));
