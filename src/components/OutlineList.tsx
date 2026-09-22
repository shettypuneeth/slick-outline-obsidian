import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { OutlineHeading } from '../slick-outline/model';
import { ActiveRail } from './ActiveRail';

interface OutlineListProps {
  expanded: boolean;
  headings: readonly OutlineHeading[];
  active: number;
  shellRef: RefObject<HTMLDivElement>;
  onNavigate: (heading: OutlineHeading) => void;
}

export function OutlineList({ expanded, headings, active, shellRef, onNavigate }: OutlineListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const previouslyExpanded = useRef(false);

  useLayoutEffect(() => {

    // Reveal the initial active heading immediately rather than scrolling during expansion.
    const animateScroll = expanded && previouslyExpanded.current;
    previouslyExpanded.current = expanded;
    const revealActive = () => {
      const list = listRef.current;
      const activeItem = list?.querySelector<HTMLElement>('[aria-current="location"]');
      if (!list || !activeItem || !expanded) return;

      const listRect = list.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      const scrollDelta = itemRect.top < listRect.top
        ? itemRect.top - listRect.top
        : Math.max(0, itemRect.bottom - listRect.bottom);
      if (scrollDelta === 0) return;

      const reducedMotion = list.ownerDocument.defaultView
        ?.matchMedia('(prefers-reduced-motion: reduce)').matches;
      list.scrollTo({
        top: list.scrollTop + scrollDelta,
        behavior: animateScroll && !reducedMotion ? 'smooth' : 'instant',
      });
    };
    const shell = shellRef.current;
    const onTransitionEnd = (event: TransitionEvent) => {

      // Recheck visibility once the shell reaches its final size.
      if (event.target === shell && (event.propertyName === 'height' || event.propertyName === 'width')) {
        revealActive();
      }
    };
    revealActive();
    shell?.addEventListener('transitionend', onTransitionEnd);
    return () => shell?.removeEventListener('transitionend', onTransitionEnd);
  }, [active, expanded, headings, shellRef]);

  return (
    <div ref={listRef} className="slick-outline-list">
      <div className="slick-outline-list-content">
        <ol>
          {headings.map((heading, index) => (
            <li key={heading.id}>
              <button
                type="button"
                className="slick-outline-heading"
                data-level={heading.level}
                data-depth={heading.depth}
                aria-current={index === active ? 'location' : undefined}
                title={heading.label}
                tabIndex={expanded ? 0 : -1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onNavigate(heading)}
              >
                <span style={{ animationDelay: `${20 + Math.min(index, 10) * 35}ms` }}>
                  {heading.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <ActiveRail expanded={expanded} active={active} headings={headings} />
      </div>
    </div>
  );
}
