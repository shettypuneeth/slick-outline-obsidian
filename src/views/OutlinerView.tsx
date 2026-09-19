import { createRoot, type Root } from 'react-dom/client';
import type { ViewUpdate } from '@codemirror/view';
import { editorLivePreviewField, Notice, type MarkdownView } from 'obsidian';
import { OutlinerApp } from '@components/OutlinerApp';
import { activeHeadingIndex, clamp, overlayGeometry, readingProgress } from '../outliner/geometry';
import { buildOutline, type OutlineHeading, type OutlineSnapshot } from '../outliner/model';
import type { EditorBridge } from '../outliner/editorBridge';
import type { ReadingHeadings } from '../outliner/readingHeadings';
import { ProgressStore } from '../outliner/ProgressStore';
import { HeadingNavigator } from '../outliner/HeadingNavigator';
import type { OutlinerPlacement } from '../settings';

type OwnerWindow = Window & typeof globalThis;

export class OutlinerView {
  private readonly host: HTMLDivElement;
  private readonly root: Root;
  private readonly win: OwnerWindow;
  private readonly resizeObserver: ResizeObserver;
  private readonly mutationObserver: MutationObserver;
  private snapshot: OutlineSnapshot = { headings: [], minutes: 1 };
  private readonly headingIndexByLine = new Map<number, number>();
  private readonly progress = new ProgressStore();
  private source = '';
  private filePath: string | null = null;
  private mode = '';
  private expanded = false;
  private disposed = false;
  private scroller: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private frame: number | null = null;
  private readonly navigator: HeadingNavigator;
  private active = -1;
  private dirtyRender = true;
  private refreshOnModeReady = false;

  constructor(
    readonly view: MarkdownView,
    private readonly bridge: EditorBridge,
    private readonly readingHeadings: ReadingHeadings,
    private readonly getPlacement: () => OutlinerPlacement,
  ) {
    const ownerWindow = view.contentEl.ownerDocument.defaultView;
    if (!ownerWindow) throw new Error('Outliner requires an attached editor window.');
    this.win = ownerWindow;
    this.navigator = new HeadingNavigator(view, this.win, this.schedule);
    this.host = view.contentEl.createDiv({ cls: 'outliner-host' });
    view.contentEl.addClass('outliner-container');
    this.root = createRoot(this.host);
    this.resizeObserver = new this.win.ResizeObserver(this.schedule);
    this.resizeObserver.observe(view.contentEl);
    view.contentEl.ownerDocument.querySelectorAll('.status-bar').forEach((statusBar) => {
      this.resizeObserver.observe(statusBar);
    });
    this.mutationObserver = new this.win.MutationObserver((records) => {
      if (records.some((record) => !this.host.contains(record.target))) this.schedule();
    });
    this.mutationObserver.observe(view.contentEl, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class'],
    });
    this.sync();
  }

  sync(): void {
    if (this.disposed) return;
    const path = this.view.file?.path ?? null;
    const cm = this.bridge.get(this.view.editor);
    const mode = this.view.getMode() === 'preview'
      ? 'preview'
      : cm?.state.field(editorLivePreviewField, false) ? 'live' : 'unsupported';
    const fileChanged = path !== this.filePath;
    const modeChanged = mode !== this.mode;
    if (fileChanged || modeChanged) {
      this.cancelNavigation();
      this.filePath = path;
      this.mode = mode;
      if (fileChanged) this.expanded = false;
      this.refreshOnModeReady = mode !== 'unsupported';
      this.dirtyRender = true;
    }
    this.host.hidden = !path || mode === 'unsupported';
    if (this.host.hidden) {
      this.bindScroller(null, null);
      return;
    }
    const scroller = this.getScrollContainer();
    const content = mode === 'preview'
      ? scroller?.querySelector<HTMLElement>('.markdown-preview-sizer') ?? scroller
      : cm?.contentDOM ?? null;
    this.bindScroller(scroller, content);
    if (this.refreshOnModeReady) {
      this.refreshOnModeReady = false;
      this.refreshSnapshot();
      if (mode === 'preview') {
        // Existing rendered sections predate our postprocessor when the plugin is enabled.
        this.view.previewMode.rerender(true);
      }
    }
    this.schedule();
  }

  editorUpdated(update: ViewUpdate): void {
    if (this.bridge.get(this.view.editor) !== update.view) return;
    if (this.view.file?.path !== this.filePath) {
      this.schedule();
      return;
    }
    if (update.docChanged && this.mode === 'live') {
      this.cancelNavigation();
      // Keep navigation anchors correct while labels remain a deliberate reopen-only snapshot.
      this.snapshot.headings = this.snapshot.headings.flatMap((heading) => {
        const from = update.changes.mapPos(heading.from, 1);
        const to = update.changes.mapPos(heading.to, -1);
        if (to <= from) return [];
        return [{
          ...heading, from, to,
          line: update.state.doc.lineAt(from).number - 1,
        }];
      });
      this.indexHeadings();
      this.dirtyRender = true;
    }
    this.schedule();
  }

  metadataChanged(): void {
    this.schedule();
  }

  private refreshSnapshot(): void {
    this.source = this.mode === 'live'
      ? this.bridge.get(this.view.editor)?.state.doc.toString() ?? this.view.getViewData()
      : this.view.getViewData();
    this.snapshot = buildOutline(this.source);
    this.indexHeadings();
    this.active = -1;
    this.dirtyRender = true;
  }

  private indexHeadings(): void {
    this.headingIndexByLine.clear();
    this.snapshot.headings.forEach((heading, index) => {
      this.headingIndexByLine.set(heading.line, index);
    });
  }

  private getScrollContainer(): HTMLElement | null {
    if (this.view.getMode() === 'preview') {
      const container = this.view.previewMode.containerEl;
      // Reading View's public container wraps the element that actually scrolls.
      return container.matches('.markdown-preview-view')
        ? container
        : container.querySelector<HTMLElement>(':scope > .markdown-preview-view');
    }
    return this.bridge.get(this.view.editor)?.scrollDOM ?? null;
  }

  private bindScroller(scroller: HTMLElement | null, content: HTMLElement | null): void {
    if (scroller === this.scroller && content === this.content) return;
    this.scroller?.removeEventListener('scroll', this.schedule);
    this.scroller?.removeEventListener('wheel', this.cancelNavigation);
    this.scroller?.removeEventListener('touchstart', this.cancelNavigation);
    this.scroller?.removeEventListener('keydown', this.cancelNavigation);
    if (this.scroller) this.resizeObserver.unobserve(this.scroller);
    if (this.content) this.resizeObserver.unobserve(this.content);
    this.scroller = scroller;
    this.content = content;
    scroller?.addEventListener('scroll', this.schedule, { passive: true });
    scroller?.addEventListener('wheel', this.cancelNavigation, { passive: true });
    scroller?.addEventListener('touchstart', this.cancelNavigation, { passive: true });
    scroller?.addEventListener('keydown', this.cancelNavigation);
    if (scroller) this.resizeObserver.observe(scroller);
    if (content) this.resizeObserver.observe(content);
  }

  private readonly schedule = (): void => {
    if (this.disposed || this.frame !== null) return;
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = null;
      // Modes and scroll containers can change without a workspace layout event.
      const cm = this.bridge.get(this.view.editor);
      const live = cm?.state.field(editorLivePreviewField, false);
      const mode = this.view.getMode() === 'preview' ? 'preview' : live ? 'live' : 'unsupported';
      const currentScroller = this.getScrollContainer();
      const currentContent = mode === 'preview'
        ? currentScroller?.querySelector<HTMLElement>('.markdown-preview-sizer') ?? currentScroller
        : cm?.contentDOM;
      if (mode !== this.mode || (this.view.file?.path ?? null) !== this.filePath ||
        (mode !== 'unsupported' &&
          (currentScroller !== this.scroller || currentContent !== this.content))) {
        this.sync();
        return;
      }
      if (!this.host.hidden) this.measure();
    });
  };

  private measure(): void {
    const scroller = this.scroller;
    if (!scroller || !this.view.contentEl.isShown()) return;
    const paneRect = this.view.contentEl.getBoundingClientRect();
    const scrollRect = scroller.getBoundingClientRect();
    const contentRect = this.content?.getBoundingClientRect() ?? scrollRect;
    if (paneRect.width < 36 || paneRect.height < 36) return;
    const properties = scroller.querySelector<HTMLElement>('.metadata-container');
    const propertiesRect = properties?.getBoundingClientRect();
    const titleRect = scroller.querySelector<HTMLElement>('.inline-title')?.getBoundingClientRect();
    const anchorRect = propertiesRect && propertiesRect.height > 0
      ? propertiesRect
      : titleRect && titleRect.height > 0 ? titleRect : null;
    // Undo document scrolling so the Properties/title anchor stays fixed in the pane.
    const top = anchorRect
      ? anchorRect.top + scroller.scrollTop - paneRect.top
      : scrollRect.top - paneRect.top + 16;
    const contentLeft = Math.min(contentRect.left, anchorRect?.left ?? contentRect.left);
    const contentRight = Math.max(contentRect.right, anchorRect?.right ?? contentRect.right);
    const placement = this.getPlacement();
    const bottomObstruction = Array.from(
      this.view.contentEl.ownerDocument.querySelectorAll('.status-bar'),
    ).reduce((overlap, statusBar) => {
      const rect = statusBar.getBoundingClientRect();
      return rect.height > 0 && rect.left < paneRect.right && rect.right > paneRect.left &&
        rect.top < paneRect.bottom && rect.bottom >= paneRect.bottom - 1
        ? Math.max(overlap, paneRect.bottom - rect.top) : overlap;
    }, 0);
    const geometry = overlayGeometry(
      paneRect.width, paneRect.height,
      contentLeft - paneRect.left, contentRight - paneRect.left, top, placement, bottomObstruction,
    );
    this.host.dataset.placement = placement;
    this.host.style.left = `${geometry.left}px`;
    this.host.style.top = `${geometry.top}px`;
    this.host.style.setProperty('--outliner-width', `${geometry.width}px`);
    this.host.style.setProperty('--outliner-height', `${geometry.height}px`);
    const progress = Math.round(readingProgress(
      scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight,
    ) * 1000) / 1000;
    this.progress.set(progress);
    if (!this.expanded) {
      if (this.dirtyRender) this.render();
      return;
    }
    const distance = scroller.scrollHeight - scroller.clientHeight;
    const atBottom = distance > 1 && distance - scroller.scrollTop <= 1;
    const threshold = scrollRect.top + scroller.clientHeight * 0.35;
    let active = -1;
    if (this.mode === 'live') {
      const cm = this.bridge.get(this.view.editor);
      if (cm) {
        const positions = this.snapshot.headings.map((heading) =>
          cm.documentTop + cm.lineBlockAt(clamp(heading.from, 0, cm.state.doc.length)).top);
        active = activeHeadingIndex(positions, threshold, atBottom);
      }
    } else {
      const headings = this.snapshot.headings;
      active = activeHeadingIndex(headings.map((heading) => heading.line), this.view.previewMode.getScroll(), atBottom);
      if (!atBottom) {
        for (const entry of this.readingHeadings.entries(this.view)) {
          const index = this.headingIndexByLine.get(entry.line);
          if (index !== undefined && entry.element.getBoundingClientRect().top <= threshold) {
            active = Math.max(active, index);
          }
        }
      }
    }
    if (this.dirtyRender || active !== this.active) {
      this.active = active;
      this.render();
    }
  }

  private render(): void {
    this.dirtyRender = false;
    this.root.render(
      <OutlinerApp
        expanded={this.expanded}
        headings={this.snapshot.headings}
        minutes={this.snapshot.minutes}
        active={this.active}
        progress={this.progress}
        onExpand={() => {
          this.refreshSnapshot();
          this.expanded = this.snapshot.headings.length > 0;
          this.schedule();
        }}
        onCollapse={() => {
          this.expanded = false;
          this.render();
        }}
        onNavigate={(heading) => this.navigate(heading)}
      />,
    );
  }

  private navigate(heading: OutlineHeading): void {
    this.cancelNavigation();
    const scroller = this.scroller;
    if (!scroller) return;
    if (this.mode === 'preview' && this.source !== this.view.getViewData()) {
      this.refreshSnapshot();
      this.schedule();
      new Notice('This note changed. The outline has been refreshed; select the heading again.');
      return;
    }
    const cm = this.mode === 'live' ? this.bridge.get(this.view.editor) : undefined;
    this.navigator.navigate(heading, scroller, cm);
  }

  private readonly cancelNavigation = (): void => {
    this.navigator.cancel();
  };

  destroy(): void {
    this.disposed = true;
    this.cancelNavigation();
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    this.bindScroller(null, null);
    this.resizeObserver.disconnect();
    this.mutationObserver.disconnect();
    this.root.unmount();
    this.host.remove();
    this.view.contentEl.removeClass('outliner-container');
  }
}
