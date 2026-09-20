import { useEffect, useRef } from 'react';
import { setIcon } from 'obsidian';

export function ObsidianIcon({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current) setIcon(ref.current, name);
  }, [name]);

  return <span ref={ref} className="slick-outline-icon" aria-hidden="true" />;
}
