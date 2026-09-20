import { foldedRanges, unfoldEffect } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import type { MarkdownView } from 'obsidian';
import { clamp } from './geometry';
import type { OutlineHeading } from './model';

export class HeadingNavigator {
  private frame: number | null = null;

  constructor(
    private readonly view: MarkdownView,
    private readonly win: Window,
    private readonly onScroll: () => void,
  ) {}

  /**
   * Reveals a heading with a cancellable scroll, honoring reduced-motion preferences.
   * Live Preview unfolds and targets editor offsets; Reading View targets source lines.
   */
  navigate(heading: OutlineHeading, scroller: HTMLElement, editorView?: EditorView): void {
    this.cancel();
    if (editorView) {
      const position = clamp(heading.from, 0, editorView.state.doc.length);
      const unfoldEffects: ReturnType<typeof unfoldEffect.of>[] = [];

      // Unfold every enclosing range so a nested target can be measured and revealed.
      foldedRanges(editorView.state).between(0, editorView.state.doc.length, (from, to) => {
        if (from <= position && to >= position) unfoldEffects.push(unfoldEffect.of({ from, to }));
      });
      if (unfoldEffects.length) editorView.dispatch({ effects: unfoldEffects });
    }

    const offset = Math.min(48, scroller.clientHeight * 0.1);
    const startTop = scroller.scrollTop;
    const startLine = editorView ? 0 : this.view.previewMode.getScroll();

    const started = this.win.performance.now();
    const prefersReducedMotion = this.win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 0 : 260;

    const animate = (now: number) => {
      const fraction = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
      const easedFraction = 1 - Math.pow(1 - fraction, 3);
      if (editorView) {

        // Re-measure each frame because virtualized editor blocks can change height.
        const block = editorView.lineBlockAt(clamp(heading.from, 0, editorView.state.doc.length));
        const targetTop = block.top + editorView.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
        scroller.scrollTo({ top: startTop + (targetTop - startTop) * easedFraction, behavior: 'instant' });
      } else {

        // applyScroll accepts source lines and works even when Reading View virtualizes a section.
        this.view.previewMode.applyScroll(startLine + (heading.line - startLine) * easedFraction);
        if (fraction === 1) scroller.scrollTop = Math.max(0, scroller.scrollTop - offset);
      }
      this.onScroll();
      if (fraction < 1) this.frame = this.win.requestAnimationFrame(animate);
      else this.frame = null;
    };
    this.frame = this.win.requestAnimationFrame(animate);
  }

  /** Stops the pending scroll frame without changing the document's current scroll position. */
  cancel(): void {
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
