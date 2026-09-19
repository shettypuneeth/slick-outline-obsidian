import { MarkdownView, Plugin, type WorkspaceLeaf } from 'obsidian';
import { EditorBridge } from './outliner/editorBridge';
import { OutlinerView } from '@views/OutlinerView';
import { ReadingHeadings } from './outliner/readingHeadings';
import { DEFAULT_SETTINGS, OutlinerSettingTab, readSettings, type OutlinerPlacement } from './settings';

export default class OutlinerPlugin extends Plugin {
  settings = { ...DEFAULT_SETTINGS };
  private readonly panes = new Map<WorkspaceLeaf, OutlinerView>();
  private bridge!: EditorBridge;
  private readingHeadings!: ReadingHeadings;
  private unloading = false;

  async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.readingHeadings = new ReadingHeadings(this.app);
    this.bridge = new EditorBridge((update) => {
      if (this.unloading) return;
      for (const pane of this.panes.values()) {
        if (update) pane.editorUpdated(update);
        else pane.sync();
      }
    });
    this.registerEditorExtension(this.bridge.extension);
    this.registerMarkdownPostProcessor((element, context) => {
      this.readingHeadings.process(element, context);
    });
    this.addSettingTab(new OutlinerSettingTab(this));
    this.addCommand({
      id: 'show-outliner',
      name: 'Show outliner',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;
        const existing = this.panes.get(view.leaf);
        const supported = view.getMode() === 'preview' ||
          view.contentEl.querySelector('.markdown-source-view.is-live-preview') !== null;
        if (!existing && !supported) return false;
        if (!checking) {
          if (existing) {
            existing.destroy();
            this.panes.delete(view.leaf);
          } else {
            this.panes.set(view.leaf, new OutlinerView(
              view, this.bridge, this.readingHeadings, () => this.settings.placement,
            ));
          }
        }
        return true;
      },
    });
    this.registerEvent(this.app.workspace.on('layout-change', () => this.syncPanes()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.syncPanes()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.syncPanes()));
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      for (const pane of this.panes.values()) {
        if (pane.view.file === file) pane.metadataChanged();
      }
    }));
  }

  async setPlacement(placement: OutlinerPlacement): Promise<void> {
    const settings = { ...this.settings, placement };
    await this.saveData(settings);
    this.settings = settings;
    this.syncPanes();
  }

  private syncPanes(): void {
    const liveLeaves = new Set(this.app.workspace.getLeavesOfType('markdown'));
    for (const [leaf, pane] of this.panes) {
      if (!liveLeaves.has(leaf) || leaf.view !== pane.view) {
        pane.destroy();
        this.panes.delete(leaf);
      } else {
        pane.sync();
      }
    }
  }

  onunload(): void {
    this.unloading = true;
    for (const pane of this.panes.values()) pane.destroy();
    this.panes.clear();
    this.bridge?.clear();
  }
}
