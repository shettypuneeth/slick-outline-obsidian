import { forwardRef, useSyncExternalStore } from 'react';
import type { ProgressStore } from '../outliner/ProgressStore';
import { ObsidianIcon } from './ObsidianIcon';

interface CollapsedOutlinerProps {
  expanded: boolean;
  empty: boolean;
  progress: ProgressStore;
  onExpand: () => void;
}

export const CollapsedOutliner = forwardRef<HTMLButtonElement, CollapsedOutlinerProps>(
  function CollapsedOutliner({ expanded, empty, progress: store, onExpand }, ref) {
    const progress = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const percentage = Math.round(progress * 100);

    // Keep the button enabled for dragging even when an empty outline cannot expand.
    return (
      <button
        ref={ref}
        className="outliner-trigger"
        type="button"
        aria-label={empty ? 'No H1 or H2 headings' : 'Open document outline'}
        aria-description={`${percentage}% through document. Drag to reposition.`}
        aria-disabled={empty}
        aria-expanded={expanded}
        aria-hidden={expanded}
        tabIndex={expanded ? -1 : 0}
        onClick={() => { if (!empty) onExpand(); }}
      >
        <ObsidianIcon name="list" />
      </button>
    );
  },
);
