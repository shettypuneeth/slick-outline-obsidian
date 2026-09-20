import { useLayoutEffect, useRef } from 'react';
import type { OutlineHeading } from '../slick-outline/model';
import type { ProgressStore } from '../slick-outline/ProgressStore';
import { CollapsedOutline } from './CollapsedOutline';
import { ExpandedOutline } from './ExpandedOutline';
import { ProgressRing } from './ProgressRing';

export interface SlickOutlineProps {
  expanded: boolean;
  headings: readonly OutlineHeading[];
  minutes: number;
  active: number;
  progress: ProgressStore;
  bindTrigger: (element: HTMLButtonElement) => () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onNavigate: (heading: OutlineHeading) => void;
}

export function SlickOutlineApp(props: SlickOutlineProps) {
  const { expanded, headings, minutes, active, progress } = props;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    return trigger ? props.bindTrigger(trigger) : undefined;
  }, [props.bindTrigger]);

  useLayoutEffect(() => {
    if (expanded && triggerRef.current?.ownerDocument.activeElement === triggerRef.current) {
      closeRef.current?.focus({ preventScroll: true });
    }
  }, [expanded]);

  const collapse = () => {
    props.onCollapse();
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <div ref={shellRef} className="slick-outline-shell" data-expanded={expanded}>
        <CollapsedOutline
          ref={triggerRef}
          expanded={expanded}
          empty={headings.length === 0}
          progress={progress}
          onExpand={props.onExpand}
        />
        <ExpandedOutline
          expanded={expanded}
          headings={headings}
          minutes={minutes}
          active={active}
          shellRef={shellRef}
          closeRef={closeRef}
          onCollapse={collapse}
          onNavigate={props.onNavigate}
        />
      </div>
      <ProgressRing
        progress={progress}
        expanded={expanded}
        disabled={headings.length === 0}
      />
    </>
  );
}
