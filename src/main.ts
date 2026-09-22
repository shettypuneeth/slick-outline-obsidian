import { MarkdownView, Plugin, type WorkspaceLeaf } from 'obsidian';
import { EditorBridge } from './slick-outline/editorBridge';
import { SlickOutlineView } from '@views/SlickOutlineView';
import { ReadingHeadings } from './slick-outline/readingHeadings';
import {
  DEFAULT_SETTINGS, SlickOutlineSettingTab, readSettings, type SlickOutlinePlacement, type SlickOutlineSettings,
} from './settings';
import type { RelativePosition } from './slick-outline/geometry';
import { isReadingSpeedWpm } from './slick-outline/readingTime';

/**
 * Connects Obsidian's editor and workspace lifecycle to pane-owned outline views.
 * Enabled panes are session-local; placement settings are persisted and shared.
 */
export default class SlickOutlinePlugin extends Plugin {
  settings = { ...DEFAULT_SETTINGS };

  // Only panes explicitly enabled through the command own an overlay.
  private readonly panes = new Map<WorkspaceLeaf, SlickOutlineView>();

  // Shared adapters provide source positions for Live Preview and Reading View.
  private bridge!: EditorBridge;
  private readingHeadings!: ReadingHeadings;

  private unloading = false;

  private settingsWrite: Promise<void> = Promise.resolve();

  /** Loads preferences and registers editor adapters, settings, commands, and workspace listeners. */
  async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());

    this.readingHeadings = new ReadingHeadings(this.app);
    this.bridge = new EditorBridge((update) => {
      if (this.unloading) return;

      // Content updates remap heading anchors; adapter lifecycle changes require a full pane sync.
      for (const pane of this.panes.values()) {
        if (update) pane.editorUpdated(update);
        else pane.sync();
      }
    });

    this.registerEditorExtension(this.bridge.extension);
    this.registerMarkdownPostProcessor((element, context) => {
      this.readingHeadings.process(element, context);
    });

    this.addSettingTab(new SlickOutlineSettingTab(this));
    this.addCommand({
      id: 'show-outline',
      name: 'Show outline',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;

        const existingPane = this.panes.get(view.leaf);
        const isSupportedMode = view.getMode() === 'preview' ||
          view.contentEl.querySelector('.markdown-source-view.is-live-preview') !== null;

        // An existing overlay can still be disabled after switching to an unsupported mode.
        if (!existingPane && !isSupportedMode) return false;

        // Obsidian also calls this to check command availability; only execution may toggle a pane.
        if (!checking) {
          if (existingPane) {
            existingPane.destroy();
            this.panes.delete(view.leaf);
          } else {
            this.panes.set(view.leaf, new SlickOutlineView(
              view, this.bridge, this.readingHeadings, () => this.settings,
              (position) => this.savePosition(position),
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

  /** Persists one pane's dropped position as a relative preference shared by all enabled panes. */
  savePosition(position: RelativePosition): Promise<void> {
    return this.writeSettings({ customPosition: position });
  }

  /** Replaces a custom position with a corner preset, cancelling any unfinished gestures. */
  setPlacement(placement: SlickOutlinePlacement): Promise<void> {
    for (const pane of this.panes.values()) pane.cancelDrag();
    return this.writeSettings({ placement, customPosition: null });
  }

  /** Cancels active drags and restores default placement and reading speed across enabled panes. */
  resetSettings(): Promise<void> {
    for (const pane of this.panes.values()) pane.cancelDrag();
    return this.writeSettings({ ...DEFAULT_SETTINGS });
  }

  /** Updates estimates across enabled panes without refreshing their heading snapshots. */
  setReadingSpeedWpm(readingSpeedWpm: number): Promise<void> {
    if (!isReadingSpeedWpm(readingSpeedWpm)) {
      return Promise.reject(new RangeError('Reading speed must be a positive whole number of words per minute.'));
    }
    return this.writeSettings({ readingSpeedWpm });
  }

  /** Serializes disk writes and publishes successful settings to panes in the same order. */
  private writeSettings(changes: Partial<SlickOutlineSettings>): Promise<void> {
    const write = async () => {

      // Merge when this write runs so concurrent placement and speed changes cannot overwrite each other.
      const settings = { ...this.settings, ...changes };

      // Publish only persisted settings so every pane can recover from a failed save.
      await this.saveData(settings);
      if (this.unloading) return;
      this.settings = settings;
      this.syncPanes();
    };

    // Serialize writes without letting a failed save block a later reset or retry.
    this.settingsWrite = this.settingsWrite.then(write, write);
    return this.settingsWrite;
  }

  /**
   * Reconciles registered overlays with the workspace, disposing closed or replaced views.
   * New Markdown panes remain untouched until explicitly enabled through the command.
   */
  private syncPanes(): void {
    const liveLeaves = new Set(this.app.workspace.getLeavesOfType('markdown'));

    for (const [leaf, pane] of this.panes) {

      // Obsidian can reuse a leaf with a replacement view, leaving the old overlay stale.
      if (!liveLeaves.has(leaf) || leaf.view !== pane.view) {
        pane.destroy();
        this.panes.delete(leaf);
      } else {
        pane.sync();
      }
    }
  }

  /** Tears down pane-owned resources; Obsidian removes registered extensions and listeners. */
  onunload(): void {

    // Teardown can trigger editor callbacks, so block further pane updates before disposal.
    this.unloading = true;
    for (const pane of this.panes.values()) pane.destroy();
    this.panes.clear();
    this.bridge?.clear();
  }
}
