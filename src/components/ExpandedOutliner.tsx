import { useId, useLayoutEffect, useRef, type RefObject } from 'react';
import type { OutlineHeading } from '../outliner/model';
import { ObsidianIcon } from './ObsidianIcon';
import { OutlineList } from './OutlineList';

interface ExpandedOutlinerProps {
  expanded: boolean;
  headings: readonly OutlineHeading[];
  minutes: number;
  active: number;
  shellRef: RefObject<HTMLDivElement>;
  closeRef: RefObject<HTMLButtonElement>;
  onCollapse: () => void;
  onNavigate: (heading: OutlineHeading) => void;
}

export function ExpandedOutliner({
  expanded, headings, minutes, active, shellRef, closeRef, onCollapse, onNavigate,
}: ExpandedOutlinerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const labelId = useId();

  useLayoutEffect(() => {
    panelRef.current?.toggleAttribute('inert', !expanded);
  }, [expanded]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const list = panel?.querySelector('.outliner-list-content');
    const header = panel?.querySelector('header');
    const win = panel?.ownerDocument.defaultView;
    if (!panel || !list || !header || !win) return;
    const resize = () => {
      const style = win.getComputedStyle(panel);
      const headerStyle = win.getComputedStyle(header);
      const height = list.getBoundingClientRect().height + header.getBoundingClientRect().height +
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
        parseFloat(headerStyle.marginBottom) + 2;
      shellRef.current?.style.setProperty('--outliner-natural-height', `${height}px`);
    };
    const observer = new win.ResizeObserver(resize);
    observer.observe(list);
    observer.observe(header);
    resize();
    return () => observer.disconnect();
  }, [shellRef]);

  return (
    <nav ref={panelRef} className="outliner-panel" aria-labelledby={labelId} aria-hidden={!expanded}>
      <span id={labelId} hidden>Document outline</span>
      <header className="outliner-header">
        <span className="outliner-reading-time">~{minutes} min read</span>
        <button
          ref={closeRef}
          type="button"
          className="outliner-close"
          aria-label="Collapse document outline"
          tabIndex={expanded ? 0 : -1}
          onClick={onCollapse}
        >
          <ObsidianIcon name="x" />
        </button>
      </header>
      <OutlineList
        expanded={expanded}
        headings={headings}
        active={active}
        shellRef={shellRef}
        onNavigate={onNavigate}
      />
    </nav>
  );
}
