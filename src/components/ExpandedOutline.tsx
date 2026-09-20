import { useId, useLayoutEffect, useRef, type RefObject } from 'react';
import type { OutlineHeading } from '../slick-outline/model';
import { ObsidianIcon } from './ObsidianIcon';
import { OutlineList } from './OutlineList';

interface ExpandedOutlineProps {
  expanded: boolean;
  headings: readonly OutlineHeading[];
  minutes: number;
  active: number;
  shellRef: RefObject<HTMLDivElement>;
  closeRef: RefObject<HTMLButtonElement>;
  onCollapse: () => void;
  onNavigate: (heading: OutlineHeading) => void;
}

export function ExpandedOutline({
  expanded, headings, minutes, active, shellRef, closeRef, onCollapse, onNavigate,
}: ExpandedOutlineProps) {
  const panelRef = useRef<HTMLElement>(null);

  // aria-labelledby avoids Obsidian's automatic hover tooltip for aria-label.
  const labelId = useId();

  useLayoutEffect(() => {

    // Keep contents visible during collapse, but remove them from interaction immediately.
    panelRef.current?.toggleAttribute('inert', !expanded);
  }, [expanded]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const list = panel?.querySelector('.slick-outline-list-content');
    const header = panel?.querySelector('header');
    const win = panel?.ownerDocument.defaultView;
    if (!panel || !list || !header || !win) return;
    const resize = () => {
      const panelStyle = win.getComputedStyle(panel);
      const headerStyle = win.getComputedStyle(header);

      // Measure the full contents, not the animated shell; include its two 1px borders.
      const naturalHeight = list.getBoundingClientRect().height + header.getBoundingClientRect().height +
        parseFloat(panelStyle.paddingTop) + parseFloat(panelStyle.paddingBottom) +
        parseFloat(headerStyle.marginBottom) + 2;
      shellRef.current?.style.setProperty('--slick-outline-natural-height', `${naturalHeight}px`);
    };
    const observer = new win.ResizeObserver(resize);
    observer.observe(list);
    observer.observe(header);
    resize();
    return () => observer.disconnect();
  }, [shellRef]);

  return (
    <nav ref={panelRef} className="slick-outline-panel" aria-labelledby={labelId} aria-hidden={!expanded}>
      <span id={labelId} hidden>Document outline</span>
      <header className="slick-outline-header">
        <span className="slick-outline-reading-time">~{minutes} min read</span>
        <button
          ref={closeRef}
          type="button"
          className="slick-outline-close"
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
