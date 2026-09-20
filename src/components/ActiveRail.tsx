import { useLayoutEffect, useRef } from 'react';
import type { OutlineHeading } from '../slick-outline/model';

interface ActiveRailProps {
  expanded: boolean;
  active: number;
  headings: readonly OutlineHeading[];
}

export function ActiveRail({ expanded, active, headings }: ActiveRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const hasPositionedRail = useRef(false);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const content = rail.closest<HTMLElement>('.slick-outline-list-content');
    const activeItem = content?.querySelector<HTMLElement>('[aria-current="location"]');
    const win = rail.ownerDocument.defaultView;
    if (!content || !activeItem || !win) {
      rail.hidden = true;
      hasPositionedRail.current = false;
      return;
    }
    if (!expanded) {
      hasPositionedRail.current = false;
      return;
    }

    const measure = () => {
      const itemRect = activeItem.getBoundingClientRect();
      if (itemRect.height === 0) return;

      // Content-relative coordinates stay stable while the outline itself scrolls.
      const top = itemRect.top - content.getBoundingClientRect().top;

      // Place the rail immediately on open; animate only subsequent heading changes.
      rail.dataset.animated = String(hasPositionedRail.current);
      rail.style.transform = `translateY(${top}px)`;
      rail.style.height = `${itemRect.height}px`;
      rail.hidden = false;
      hasPositionedRail.current = true;
    };

    measure();
    const observer = new win.ResizeObserver(measure);
    observer.observe(content);
    observer.observe(activeItem);
    return () => observer.disconnect();
  }, [expanded, active, headings]);

  return (
    <div className="slick-outline-rail-layer" aria-hidden="true">
      <div ref={railRef} className="slick-outline-active-rail" />
    </div>
  );
}
