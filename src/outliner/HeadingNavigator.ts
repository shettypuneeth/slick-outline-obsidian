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

  navigate(heading: OutlineHeading, scroller: HTMLElement, cm?: EditorView): void {
    this.cancel();
    if (cm) {
      const position = clamp(heading.from, 0, cm.state.doc.length);
      const effects: ReturnType<typeof unfoldEffect.of>[] = [];
      foldedRanges(cm.state).between(0, cm.state.doc.length, (from, to) => {
        if (from <= position && to >= position) effects.push(unfoldEffect.of({ from, to }));
      });
      if (effects.length) cm.dispatch({ effects });
    }
    const offset = Math.min(48, scroller.clientHeight * 0.1);
    const startTop = scroller.scrollTop;
    const startLine = cm ? 0 : this.view.previewMode.getScroll();
    const started = this.win.performance.now();
    const reduced = this.win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 0 : 260;
    const animate = (now: number) => {
      const fraction = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - fraction, 3);
      if (cm) {
        const block = cm.lineBlockAt(clamp(heading.from, 0, cm.state.doc.length));
        const target = block.top + cm.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
        scroller.scrollTo({ top: startTop + (target - startTop) * eased, behavior: 'instant' });
      } else {
        // applyScroll accepts source lines and works even when Reading View virtualizes a section.
        this.view.previewMode.applyScroll(startLine + (heading.line - startLine) * eased);
        if (fraction === 1) scroller.scrollTop = Math.max(0, scroller.scrollTop - offset);
      }
      this.onScroll();
      if (fraction < 1) this.frame = this.win.requestAnimationFrame(animate);
      else this.frame = null;
    };
    this.frame = this.win.requestAnimationFrame(animate);
  }

  cancel(): void {
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
