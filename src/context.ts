import {FileView,type App,type TFile} from 'obsidian';

export function currentFile(app:App):TFile|null {
  const leaf=app.workspace.getMostRecentLeaf();
  return leaf?.view instanceof FileView?leaf.view.file:null;
}
