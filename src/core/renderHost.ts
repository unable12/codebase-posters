import type { RepoDataset } from './schema';
import type { AnyParams, Recipe } from './types';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './types';
import { hashString, makeNoise, makeRng } from './rng';

interface PrepareCache {
  key: string;
  value: unknown;
}

const prepareCaches = new WeakMap<Recipe, PrepareCache>();

function getPrepared(recipe: Recipe, data: RepoDataset, params: AnyParams, seed: number): unknown {
  if (!recipe.prepare) return undefined;
  const key = `${data.meta.headSha}|${JSON.stringify(params)}|${seed}`;
  const hit = prepareCaches.get(recipe);
  if (hit && hit.key === key) return hit.value;
  const value = recipe.prepare(data, params, seed);
  prepareCaches.set(recipe, { key, value });
  return value;
}

/**
 * Render one deterministic frame of a recipe onto a canvas.
 * The canvas pixel size can be anything with a 3:4 ratio; recipes always draw
 * in DESIGN_WIDTH x DESIGN_HEIGHT units.
 */
export function renderFrame(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  recipe: Recipe,
  data: RepoDataset,
  params: AnyParams,
  seed: number,
  t: number,
  opts: { quality?: number } = {},
): void {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const scale = canvas.width / DESIGN_WIDTH;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  const frame = {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    rng: makeRng(hashString(`${recipe.id}|${seed}`)),
    rngFor: (key: string) => makeRng(hashString(`${recipe.id}|${seed}|${key}`)),
    noise: makeNoise(hashString(`${recipe.id}|noise|${seed}`)),
    data,
    t,
    quality: opts.quality ?? 1,
  };
  recipe.render(ctx, frame, params, getPrepared(recipe, data, params, seed));
  ctx.restore();
}

/** Drives a play loop sweeping t over durationMs. Returns a stop function. */
export function playLoop(
  durationMs: number,
  onFrame: (t: number) => void,
  loop = true,
): () => void {
  let raf = 0;
  let start = performance.now();
  const tick = (now: number) => {
    let t = (now - start) / durationMs;
    if (t >= 1) {
      if (loop) {
        start = now;
        t = 0;
      } else {
        onFrame(1);
        return;
      }
    }
    onFrame(Math.min(1, t));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
