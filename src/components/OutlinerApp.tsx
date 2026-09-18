import { useLayoutEffect, useRef } from 'react';
import type { OutlineHeading } from '../outliner/model';
import type { ProgressStore } from '../outliner/ProgressStore';
import { CollapsedOutliner } from './CollapsedOutliner';
import { ExpandedOutliner } from './ExpandedOutliner';
import { ProgressRing } from './ProgressRing';

export interface OutlinerProps {
  expanded: boolean;
  headings: readonly OutlineHeading[];
  minutes: number;
  active: number;
  progress: ProgressStore;
  onExpand: () => void;
  onCollapse: () => void;
  onNavigate: (heading: OutlineHeading) => void;
}

export function OutlinerApp(props: OutlinerProps) {
  const { expanded, headings, minutes, active, progress } = props;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
      <div ref={shellRef} className="outliner-shell" data-expanded={expanded}>
        <CollapsedOutliner
          ref={triggerRef}
          expanded={expanded}
          empty={headings.length === 0}
          progress={progress}
          onExpand={props.onExpand}
        />
        <ExpandedOutliner
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
