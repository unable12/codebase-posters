import type { RepoDataset } from './schema';
import type { Rng } from './rng';

export type ParamDef =
  | { type: 'number'; label: string; default: number; min: number; max: number; step?: number }
  | { type: 'boolean'; label: string; default: boolean }
  | { type: 'select'; label: string; default: string; options: string[] }
  | { type: 'color'; label: string; default: string };

export type ParamSchema = Record<string, ParamDef>;

export type ParamValues<S extends ParamSchema> = {
  [K in keyof S]: S[K] extends { type: 'number' }
    ? number
    : S[K] extends { type: 'boolean' }
      ? boolean
      : string;
};

/** Loosely-typed param bag used by the app shell; recipes see ParamValues<S>. */
export type AnyParams = Record<string, number | boolean | string>;

export function defaultParams(schema: ParamSchema): AnyParams {
  const out: AnyParams = {};
  for (const [k, def] of Object.entries(schema)) out[k] = def.default;
  return out;
}

const defaultsCache = new WeakMap<ParamSchema, AnyParams>();

/**
 * Shared, identity-stable defaults for a schema. Params are only ever updated
 * by copy (spread), so the shared object is safe to pass around — and its
 * stable identity keeps memoized renders (thumbnails) from re-firing.
 */
export function sharedDefaultParams(schema: ParamSchema): AnyParams {
  let hit = defaultsCache.get(schema);
  if (!hit) {
    hit = defaultParams(schema);
    defaultsCache.set(schema, hit);
  }
  return hit;
}

/** Everything a recipe gets per render call. width/height are DESIGN units (host pre-scales). */
export interface Frame {
  width: number;
  height: number;
  rng: Rng;
  /**
   * Per-element deterministic stream. Key strokes by stable ids
   * (e.g. `${sha}:${path}:${i}`) so already-drawn elements stay
   * pixel-identical between animation frames as new ones appear.
   */
  rngFor: (key: string) => Rng;
  noise: (x: number, y: number, z?: number) => number;
  data: RepoDataset;
  /** Animation progress 0..1; t=1 is the finished poster. */
  t: number;
  /** Render quality 0..1; recipes scale stroke/dot counts by it. 1 = final, ~0.4 = playback draft. */
  quality: number;
}

export type RecipeFamily = 'flow' | 'structure' | 'timeline' | 'texture' | 'particles';

/** Presentation grouping for the filmstrip rooms. */
export type RecipeRoom = 'time' | 'structure' | 'people' | 'texture';

export interface CanvasRecipe<S extends ParamSchema = ParamSchema, P = unknown> {
  engine: 'canvas2d';
  id: string;
  name: string;
  description: string;
  family: RecipeFamily;
  /** Filmstrip room — presentation grouping, independent of `family`. */
  room: RecipeRoom;
  /** "How to read this" legend: what colors, shapes, and motion represent. */
  meaning: { label: string; text: string }[];
  params: S;
  /** Optional precompute, memoized on (data, params, seed). Keeps render a pure lookup. */
  prepare?(data: RepoDataset, params: ParamValues<S>, seed: number): P;
  render(ctx: CanvasRenderingContext2D, frame: Frame, params: ParamValues<S>, prepared: P): void;
}

export type Recipe = CanvasRecipe<any, any>;

export const DESIGN_WIDTH = 1500;
export const DESIGN_HEIGHT = 2000;
