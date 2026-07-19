import { memo, useEffect, useRef } from 'react';
import type { RepoDataset } from '../core/schema';
import { sharedDefaultParams } from '../core/types';
import { recipes, roomOf } from '../core/registry';
import { RecipeCanvas } from './RecipeCanvas';

interface Props {
  data: RepoDataset;
  selected: number;
  onSelect: (i: number) => void;
}

// memo: the strip re-renders only when the repo or selection changes — not on
// every playback tick or slider drag in the detail view.
export const Filmstrip = memo(function Filmstrip({ data, selected, onSelect }: Props) {
  const stripRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const el = thumbRefs.current[selected];
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [selected]);

  return (
    <div
      className="filmstrip"
      ref={stripRef}
      onWheel={(e) => {
        const el = stripRef.current;
        if (!el) return;
        // Native scroll already consumes deltaX; only map vertical wheel → strip.
        el.scrollLeft += e.deltaY;
      }}
    >
      {recipes.map((r, i) => {
        const prev = i > 0 ? recipes[i - 1] : null;
        const showRoom = !prev || roomOf(prev) !== roomOf(r);
        return (
          <div key={r.id} className="filmstrip-item">
            {showRoom && (
              <span className="room-label">
                <span className="room-hairline" aria-hidden />
                {roomOf(r)}
              </span>
            )}
            <button
              type="button"
              ref={(el) => {
                thumbRefs.current[i] = el;
              }}
              className={`strip-thumb ${i === selected ? 'active' : ''}`}
              onClick={() => onSelect(i)}
              title={r.name}
            >
              <RecipeCanvas
                recipe={r}
                data={data}
                params={sharedDefaultParams(r.params)}
                seed={1}
                t={1}
                pixelWidth={180}
                queued
                quality={0.3}
              />
              <span className="strip-label">{r.name}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
});
