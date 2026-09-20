import { createRoot, type Root } from 'react-dom/client';
import type { ViewUpdate } from '@codemirror/view';
import { editorLivePreviewField, Notice, type MarkdownView } from 'obsidian';
import { SlickOutlineApp } from '@components/SlickOutlineApp';
import {
  CONTROL_SIZE, activeHeadingIndex, clamp, constrainPosition, customGeometry,
  overlayGeometry, positionBounds, readingProgress, relativePosition, resolvePosition, snapPosition,
  type OutlinePosition, type RelativePosition,
} from '../slick-outline/geometry';
import { buildOutline, type OutlineHeading, type OutlineSnapshot } from '../slick-outline/model';
import type { EditorBridge } from '../slick-outline/editorBridge';
import type { ReadingHeadings } from '../slick-outline/readingHeadings';
import { ProgressStore } from '../slick-outline/ProgressStore';
import { DEFAULT_READING_SPEED_WPM, readingMinutes } from '../slick-outline/readingTime';
import { HeadingNavigator } from '../slick-outline/HeadingNavigator';
import type { SlickOutlinePlacement, SlickOutlineSettings } from '../settings';
import { attachDraggable, type DragController, type DragPoint } from '../utils/draggable';

type OwnerWindow = Window & typeof globalThis;

interface PaneLayout {
  paneRect: DOMRect;
  scrollRect: DOMRect;
  scroller: HTMLElement;

  contentLeft: number;
  contentRight: number;
  top: number;
  bottomObstruction: number;
}

interface DragState {
  clientX: number;
  clientY: number;

  grabX: number;
  grabY: number;
}

/**
 * Owns one Markdown pane's overlay, translating editor state and pointer gestures
 * into layout updates while React renders the outline's contents.
 */
export class SlickOutlineView {
  private readonly host: HTMLDivElement;
  private readonly dropPreview: HTMLDivElement;
  private readonly root: Root;

  private readonly win: OwnerWindow;
  private readonly resizeObserver: ResizeObserver;
  private readonly mutationObserver: MutationObserver;

  private snapshot: OutlineSnapshot = { headings: [], wordCount: 0 };
  private readonly headingIndexByLine = new Map<number, number>();
  private readonly progress = new ProgressStore();
  private source = '';
  private readingSpeedWpm = DEFAULT_READING_SPEED_WPM;

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
  private readingDirty = true;

  private draggable: DragController | null = null;
  private drag: DragState | null = null;
  private pendingPosition: RelativePosition | null = null;
  private savingPosition = false;

  private placement: SlickOutlinePlacement = 'top-left';
  private directionLockedUntil = 0;

  constructor(
    readonly view: MarkdownView,
    private readonly bridge: EditorBridge,
    private readonly readingHeadings: ReadingHeadings,
    private readonly getSettings: () => Readonly<SlickOutlineSettings>,
    private readonly savePosition: (position: RelativePosition) => Promise<void>,
  ) {
    const ownerWindow = view.contentEl.ownerDocument.defaultView;
    if (!ownerWindow) throw new Error('SlickOutline requires an attached editor window.');
    this.win = ownerWindow;
    this.navigator = new HeadingNavigator(view, this.win, this.schedule);

    this.host = view.contentEl.createDiv({ cls: 'slick-outline-host' });
    this.dropPreview = view.contentEl.createDiv({ cls: 'slick-outline-drop-preview' });
    this.dropPreview.hidden = true;
    this.dropPreview.setAttribute('aria-hidden', 'true');
    view.contentEl.addClass('slick-outline-container');
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

  /**
   * Reconciles the current file, display mode, and scroll container after workspace changes.
   * Unsupported modes hide the overlay without discarding its pane registration.
   */
  sync(): void {
    if (this.disposed) return;

    // Recalculate time from the snapshot without refreshing reopen-only heading labels.
    const readingSpeedWpm = this.getSettings().readingSpeedWpm;
    if (readingSpeedWpm !== this.readingSpeedWpm) {
      this.readingSpeedWpm = readingSpeedWpm;
      this.dirtyRender = true;
    }

    const path = this.view.file?.path ?? null;
    const editorView = this.bridge.get(this.view.editor);
    const mode = this.view.getMode() === 'preview'
      ? 'preview'
      : editorView?.state.field(editorLivePreviewField, false) ? 'live' : 'unsupported';

    const fileChanged = path !== this.filePath;
    const modeChanged = mode !== this.mode;
    if (fileChanged || modeChanged) {
      this.cancelDrag();
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
      : editorView?.contentDOM ?? null;
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

  /**
   * Remaps heading anchors through editor changes while retaining labels until reopen.
   * Updates from other panes are ignored because the editor bridge is shared.
   */
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

  /** Rebuilds heading labels and the word count from the current document on open or mode change. */
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

  /** Transfers scroll listeners and resize observation when Obsidian replaces the editor surface. */
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

  /** Requests both layout and reading-state updates, coalesced into the next animation frame. */
  private readonly schedule = (): void => {
    this.readingDirty = true;
    this.schedulePosition();
  };

  private readonly schedulePosition = (): void => {
    if (this.disposed || this.frame !== null) return;

    // Coalesce pointer movement into one frame without recomputing reading progress.
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = null;

      // Modes and scroll containers can change without a workspace layout event.
      const editorView = this.bridge.get(this.view.editor);
      const isLivePreview = editorView?.state.field(editorLivePreviewField, false);
      const mode = this.view.getMode() === 'preview' ? 'preview' : isLivePreview ? 'live' : 'unsupported';
      const currentScroller = this.getScrollContainer();
      const currentContent = mode === 'preview'
        ? currentScroller?.querySelector<HTMLElement>('.markdown-preview-sizer') ?? currentScroller
        : editorView?.contentDOM;
      if (mode !== this.mode || (this.view.file?.path ?? null) !== this.filePath ||
        (mode !== 'unsupported' &&
          (currentScroller !== this.scroller || currentContent !== this.content))) {
        this.sync();
        return;
      }
      const updateReading = this.readingDirty;
      this.readingDirty = false;
      if (!this.host.hidden) this.measure(updateReading);
    });
  };

  /**
   * Reads pane bounds and obstacles without writing styles.
   * DOM rectangles use viewport coordinates; content edges and the top anchor are pane-relative.
   * Returns null when the pane cannot currently provide a usable layout.
   */
  private readLayout(): PaneLayout | null {
    const scroller = this.scroller;
    if (!scroller || !this.view.contentEl.isShown()) return null;

    const paneRect = this.view.contentEl.getBoundingClientRect();
    const scrollRect = scroller.getBoundingClientRect();
    const contentRect = this.content?.getBoundingClientRect() ?? scrollRect;
    if (paneRect.width < CONTROL_SIZE || paneRect.height < CONTROL_SIZE) return null;

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
    const bottomObstruction = Array.from(
      this.view.contentEl.ownerDocument.querySelectorAll('.status-bar'),
    ).reduce((overlap, statusBar) => {
      const rect = statusBar.getBoundingClientRect();
      return rect.height > 0 && rect.left < paneRect.right && rect.right > paneRect.left &&
        rect.top < paneRect.bottom && rect.bottom >= paneRect.bottom - 1
        ? Math.max(overlap, paneRect.bottom - rect.top) : overlap;
    }, 0);
    return {
      paneRect, scrollRect, scroller, top, bottomObstruction,
      contentLeft: contentLeft - paneRect.left,
      contentRight: contentRight - paneRect.left,
    };
  }

  /** Converts viewport pointer coordinates into a pane-relative circle position. */
  private dragPosition(layout: PaneLayout, drag: DragState): OutlinePosition {
    return {
      left: drag.clientX - layout.paneRect.left - drag.grabX,
      top: drag.clientY - layout.paneRect.top - drag.grabY,
    };
  }

  /**
   * Applies one measured layout to the overlay and, optionally, to reading indicators.
   * Position-only drag frames skip progress and active-heading calculations.
   */
  private measure(updateReading = true): void {
    const layout = this.readLayout();
    if (!layout) return;
    this.updatePosition(layout);
    if (updateReading) this.updateReadingState(layout);
  }

  /** Resolves drag, pending-save, custom, or preset positioning and owns the resulting style writes. */
  private updatePosition(layout: PaneLayout): void {
    const { paneRect, contentLeft, contentRight, top, bottomObstruction } = layout;
    const settings = this.getSettings();
    const bounds = positionBounds(paneRect.width, paneRect.height, bottomObstruction);

    // Keep a dropped position visible while its save is pending; presets are the fallback.
    const customPosition = this.pendingPosition ?? settings.customPosition;
    const point = this.drag
      ? constrainPosition(this.dragPosition(layout, this.drag), bounds)
      : customPosition ? resolvePosition(customPosition, bounds) : null;

    // Changing the anchor mid-animation would make the panel jump to the opposite side.
    const fixedPlacement = this.expanded || this.win.performance.now() < this.directionLockedUntil
      ? this.placement : undefined;
    const geometry = point
      ? customGeometry(point, bounds, contentLeft, contentRight, fixedPlacement)
      : {
        ...overlayGeometry(
          paneRect.width, paneRect.height, contentLeft, contentRight,
          top, settings.placement, bottomObstruction,
        ),
        placement: settings.placement,
      };
    this.placement = geometry.placement;
    this.host.dataset.placement = geometry.placement;
    this.host.style.left = `${geometry.left}px`;
    this.host.style.top = `${geometry.top}px`;
    this.host.style.setProperty('--slick-outline-width', `${geometry.width}px`);
    this.host.style.setProperty('--slick-outline-height', `${geometry.height}px`);
    if (this.drag && point) {

      // Preview the snap separately so the circle continues to follow the pointer.
      const target = snapPosition(point, bounds);
      this.dropPreview.hidden = target.left === point.left && target.top === point.top;
      this.dropPreview.style.left = `${target.left - 3}px`;
      this.dropPreview.style.top = `${target.top - 3}px`;
    } else {
      this.dropPreview.hidden = true;
    }
  }

  /** Updates progress independently of React, rendering headings only when their state changes. */
  private updateReadingState({ scroller, scrollRect }: PaneLayout): void {
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
    let activeIndex = -1;
    if (this.mode === 'live') {
      const editorView = this.bridge.get(this.view.editor);
      if (editorView) {
        const positions = this.snapshot.headings.map((heading) =>
          editorView.documentTop + editorView.lineBlockAt(clamp(heading.from, 0, editorView.state.doc.length)).top);
        activeIndex = activeHeadingIndex(positions, threshold, atBottom);
      }
    } else {
      const headings = this.snapshot.headings;

      // Source lines cover virtualized sections; visible headings refine the active index.
      activeIndex = activeHeadingIndex(headings.map((heading) => heading.line), this.view.previewMode.getScroll(), atBottom);
      if (!atBottom) {
        for (const entry of this.readingHeadings.entries(this.view)) {
          const index = this.headingIndexByLine.get(entry.line);
          if (index !== undefined && entry.element.getBoundingClientRect().top <= threshold) {
            activeIndex = Math.max(activeIndex, index);
          }
        }
      }
    }
    if (this.dirtyRender || activeIndex !== this.active) {
      this.active = activeIndex;
      this.render();
    }
  }

  /** Connects the mounted React button to pointer gestures and returns its unmount cleanup. */
  private readonly bindTrigger = (element: HTMLButtonElement): (() => void) => {
    this.draggable?.dispose();
    const controller = attachDraggable(element, {
      threshold: 6,
      canStart: () => {
        const shell = this.host.querySelector('.slick-outline-shell')?.getBoundingClientRect();

        // Wait for collapse to finish before measuring the circle's pointer grab offset.
        return !this.disposed && !this.expanded && !this.savingPosition && !this.host.hidden &&
          this.win.performance.now() >= this.directionLockedUntil &&
          !!shell && Math.abs(shell.width - CONTROL_SIZE) < 0.5 &&
          Math.abs(shell.height - CONTROL_SIZE) < 0.5;
      },
      onStart: (point) => {
        const rect = this.host.getBoundingClientRect();
        this.cancelNavigation();

        // Preserve where the pointer grabbed the circle instead of centering it on pickup.
        this.drag = {
          clientX: point.clientX, clientY: point.clientY,
          grabX: point.clientX - rect.left, grabY: point.clientY - rect.top,
        };
        this.host.dataset.dragging = 'true';
      },
      onMove: (point) => {
        if (!this.drag) return;
        this.drag.clientX = point.clientX;
        this.drag.clientY = point.clientY;
        this.schedulePosition();
      },
      onEnd: (point) => this.finishDrag(point),
      onCancel: () => this.restoreDrag(),
    });
    this.draggable = controller;
    return () => {
      controller.dispose();
      if (this.draggable === controller) this.draggable = null;
    };
  };

  /** Cancels an in-progress gesture without undoing a completed drop that is already saving. */
  cancelDrag(): void {
    this.draggable?.cancel();
    this.restoreDrag();
  }

  private restoreDrag(): void {
    this.drag = null;
    delete this.host.dataset.dragging;
    this.dropPreview.hidden = true;
    this.schedulePosition();
  }

  /**
   * Snaps and normalizes the final pointer position, then persists it once.
   * A pending preview prevents flicker during the save; failure restores the prior settings.
   */
  private finishDrag(point: DragPoint): void {
    const drag = this.drag;
    const layout = this.readLayout();
    if (!drag || !layout) {
      this.restoreDrag();
      return;
    }

    drag.clientX = point.clientX;
    drag.clientY = point.clientY;
    const bounds = positionBounds(layout.paneRect.width, layout.paneRect.height, layout.bottomObstruction);
    const position = relativePosition(
      snapPosition(this.dragPosition(layout, drag), bounds), bounds,
      this.getSettings().customPosition ?? undefined,
    );

    this.pendingPosition = position;
    this.savingPosition = true;
    this.restoreDrag();
    this.updatePosition(layout);

    const finishSave = () => {
      this.pendingPosition = null;
      this.savingPosition = false;
      this.schedulePosition();
    };
    void this.savePosition(position).then(finishSave, (error: unknown) => {
      console.error('SlickOutline could not save its dragged position.', error);
      new Notice('Could not save the outline position. The previous position has been restored.');
      finishSave();
    });
  }

  private render(): void {
    this.dirtyRender = false;
    this.root.render(
      <SlickOutlineApp
        expanded={this.expanded}
        headings={this.snapshot.headings}
        minutes={readingMinutes(this.snapshot.wordCount, this.readingSpeedWpm)}
        active={this.active}
        progress={this.progress}
        bindTrigger={this.bindTrigger}
        onExpand={() => {
          this.cancelDrag();
          this.refreshSnapshot();
          this.expanded = this.snapshot.headings.length > 0;
          this.schedule();
        }}
        onCollapse={() => {
          this.expanded = false;

          // Match the CSS collapse duration before allowing dragging or a new anchor.
          this.directionLockedUntil = this.win.performance.now() + 300;
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
    const editorView = this.mode === 'live' ? this.bridge.get(this.view.editor) : undefined;
    this.navigator.navigate(heading, scroller, editorView);
  }

  private readonly cancelNavigation = (): void => {
    this.navigator.cancel();
  };

  /** Releases pane-owned observers, gestures, animation work, and React/DOM resources. */
  destroy(): void {
    this.disposed = true;
    this.draggable?.dispose();
    this.draggable = null;
    this.cancelNavigation();
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    this.bindScroller(null, null);
    this.resizeObserver.disconnect();
    this.mutationObserver.disconnect();
    this.root.unmount();
    this.host.remove();
    this.dropPreview.remove();
    this.view.contentEl.removeClass('slick-outline-container');
  }
}
