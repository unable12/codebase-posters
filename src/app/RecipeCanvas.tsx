import { memo, useEffect, useRef } from 'react';
import type { RepoDataset } from '../core/schema';
import type { AnyParams, Recipe } from '../core/types';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../core/types';
import { renderFrame } from '../core/renderHost';

// Global render queue: heavy poster renders run one per animation frame so
// switching repos never freezes the UI — posters fill in one by one.
type Job = () => void;
const queue: Job[] = [];
let pumping = false;

function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const job = queue.shift();
    if (job) job();
    if (queue.length > 0) {
      // rAF is throttled in hidden tabs; fall back to a timer so renders still happen
      if (document.hidden) setTimeout(step, 0);
      else requestAnimationFrame(step);
    } else {
      pumping = false;
    }
  };
  if (document.hidden) setTimeout(step, 0);
  else requestAnimationFrame(step);
}

interface Props {
  recipe: Recipe;
  data: RepoDataset;
  params: AnyParams;
  seed: number;
  t: number;
  /** Canvas pixel width (height follows 3:4). */
  pixelWidth: number;
  /** Queue the render (for gallery thumbs); false renders synchronously (detail view). */
  queued?: boolean;
  /** Playback mode: render smaller + lower quality for smooth fps. */
  draft?: boolean;
  /** Explicit quality override (0..1) without shrinking the canvas — used by thumbnails. */
  quality?: number;
  onClick?: () => void;
}

export const RecipeCanvas = memo(function RecipeCanvas({ recipe, data, params, seed, t, pixelWidth, queued, draft, quality: qualityProp, onClick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const jobRef = useRef<Job | null>(null);
  const width = draft ? Math.round(pixelWidth / 2) : pixelWidth;
  const quality = draft ? 0.4 : (qualityProp ?? 1);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!queued) {
      if (quality < 1) {
        renderFrame(canvas, recipe, data, params, seed, t, { quality });
        return;
      }
      // Progressive detail render: paint a cheap preview right away so the
      // click/scrub stays responsive, and run the expensive full-quality pass
      // only once the interaction settles. Rapid changes (scrubbing t, poster
      // hopping) keep cancelling the pending pass, so only previews render
      // until the user pauses.
      renderFrame(canvas, recipe, data, params, seed, t, { quality: 0.35 });
      const id = window.setTimeout(() => {
        if (ref.current) renderFrame(ref.current, recipe, data, params, seed, t, { quality: 1 });
      }, 120);
      return () => window.clearTimeout(id);
    }
    // replace any not-yet-run job for this canvas instead of stacking stale ones
    if (jobRef.current) {
      const idx = queue.indexOf(jobRef.current);
      if (idx >= 0) queue.splice(idx, 1);
    }
    const job: Job = () => {
      jobRef.current = null;
      if (ref.current) {
        renderFrame(ref.current, recipe, data, params, seed, t, { quality });
        ref.current.dataset.painted = 'true';
      }
    };
    jobRef.current = job;
    queue.push(job);
    pump();
    return () => {
      if (jobRef.current) {
        const idx = queue.indexOf(jobRef.current);
        if (idx >= 0) queue.splice(idx, 1);
        jobRef.current = null;
      }
    };
  }, [recipe, data, params, seed, t, pixelWidth, queued, quality]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={(width * DESIGN_HEIGHT) / DESIGN_WIDTH}
      onClick={onClick}
    />
  );
});
