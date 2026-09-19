import { useLayoutEffect, useRef } from 'react';
import type { OutlineHeading } from '../outliner/model';

interface ActiveRailProps {
  expanded: boolean;
  active: number;
  headings: readonly OutlineHeading[];
}

export function ActiveRail({ expanded, active, headings }: ActiveRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const content = rail.closest<HTMLElement>('.outliner-list-content');
    const item = content?.querySelector<HTMLElement>('[aria-current="location"]');
    const win = rail.ownerDocument.defaultView;
    if (!content || !item || !win) {
      rail.hidden = true;
      positioned.current = false;
      return;
    }
    if (!expanded) {
      positioned.current = false;
      return;
    }

    const measure = () => {
      const itemRect = item.getBoundingClientRect();
      if (itemRect.height === 0) return;
      // Content-relative coordinates stay stable while the outline itself scrolls.
      const top = itemRect.top - content.getBoundingClientRect().top;
      rail.dataset.animated = String(positioned.current);
      rail.style.transform = `translateY(${top}px)`;
      rail.style.height = `${itemRect.height}px`;
      rail.hidden = false;
      positioned.current = true;
    };

    measure();
    const observer = new win.ResizeObserver(measure);
    observer.observe(content);
    observer.observe(item);
    return () => observer.disconnect();
  }, [expanded, active, headings]);

  return (
    <div className="outliner-rail-layer" aria-hidden="true">
      <div ref={railRef} className="outliner-active-rail" />
    </div>
  );
}
