import { useSyncExternalStore } from 'react';
import type { ProgressStore } from '../outliner/ProgressStore';

interface ProgressRingProps {
  progress: ProgressStore;
  expanded: boolean;
  disabled: boolean;
}

export function ProgressRing({ progress: store, expanded, disabled }: ProgressRingProps) {
  const progress = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return (
    <svg
      className="outliner-progress"
      viewBox="0 0 42 42"
      data-expanded={expanded}
      data-disabled={disabled}
      aria-hidden="true"
    >
      <circle className="outliner-progress__track" cx="21" cy="21" r="19.25" />
      <circle
        className="outliner-progress__fill"
        cx="21" cy="21" r="19.25"
        pathLength="100"
        strokeDasharray="100"
        strokeDashoffset={100 - progress * 100}
      />
    </svg>
  );
}
