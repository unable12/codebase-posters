import type { CanvasRecipe } from '../core/types';
import { grain, palette, PALETTE_NAMES, paper, reveal, typographyFooter } from '../core/draw';

// Activity landscape as a two-ink risograph print — Atkinson-dithered hills.
// Identity IS the dither; not a finish applied to other posters.

const FW = 375;
const FH = 500;
const SCALE = 4; // design 1500×2000

function blurBox(src: Float64Array, w: number, h: number, radius: number): Float64Array {
  const out = new Float64Array(src.length);
  const tmp = new Float64Array(src.length);
  const r = Math.max(1, Math.round(radius));
  // horizontal
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / (r * 2 + 1);
      const leave = x - r;
      const enter = x + r + 1;
      if (leave >= 0) sum -= src[y * w + leave];
      else sum -= src[y * w];
      if (enter < w) sum += src[y * w + enter];
      else sum += src[y * w + (w - 1)];
    }
  }
  // vertical
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / (r * 2 + 1);
      const leave = y - r;
      const enter = y + r + 1;
      if (leave >= 0) sum -= tmp[leave * w + x];
      else sum -= tmp[x];
      if (enter < h) sum += tmp[enter * w + x];
      else sum += tmp[(h - 1) * w + x];
    }
  }
  return out;
}

/** Atkinson error diffusion — deterministic, no rng. Returns 0/1 bitmap. */
function atkinson(src: Float64Array, w: number, h: number, threshold: number): Uint8Array {
  const buf = Float64Array.from(src);
  const out = new Uint8Array(w * h);
  const disperse = (x: number, y: number, err: number) => {
    const targets: [number, number][] = [
      [x + 1, y],
      [x + 2, y],
      [x - 1, y + 1],
      [x, y + 1],
      [x + 1, y + 1],
      [x, y + 2],
    ];
    for (const [tx, ty] of targets) {
      if (tx < 0 || tx >= w || ty < 0 || ty >= h) continue;
      buf[ty * w + tx] += err / 8;
    }
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = buf[i];
      const v = old >= threshold ? 1 : 0;
      out[i] = v;
      disperse(x, y, old - v);
    }
  }
  return out;
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    inkDensity: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    misregistration: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    fieldScale: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  },
  { dotsA: Uint8Array; dotsB: Uint8Array }
> = {
  engine: 'canvas2d',
  id: '17-riso',
  name: 'Riso',
  description: 'The activity landscape as a two-ink risograph: soft hills, hard dots, a whisper of mis-registration.',
  family: 'texture',
  room: 'texture',
  meaning: [
    { label: 'The medium', text: 'Atkinson dither turned into a risograph print: only paper and two solid inks.' },
    { label: 'Two passes', text: 'Channel A (additions) prints first; channel B (deletions) follows, slightly offset like a second drum.' },
    { label: 'Mis-registration', text: 'The offset between inks is the machine\'s signature. Pure overlap reads darker.' },
    { label: 'The hills', text: 'Soft peaks are where work clustered over the project\'s life.' },
    { label: 'Animation', text: 'A squeegee sweep: ink A top-to-bottom, then ink B, the way a real riso lays down color.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'rose-forest', options: PALETTE_NAMES },
    inkDensity: { type: 'number', label: 'Ink density', default: 1, min: 0.5, max: 1.5, step: 0.05 },
    misregistration: { type: 'number', label: 'Mis-registration', default: 2, min: 0, max: 6, step: 1 },
    fieldScale: { type: 'number', label: 'Field scale', default: 1, min: 0.5, max: 2, step: 0.05 },
  },
  prepare(data, params) {
    const add = new Float64Array(FW * FH);
    const del = new Float64Array(FW * FH);
    for (const e of data.events) {
      if (e.kind !== 'file-change' && e.kind !== 'commit') continue;
      const x = Math.min(FW - 1, Math.floor(e.t01 * FW));
      // map magnitude onto a vertical band that drifts with path hash-ish
      const band = 0.2 + (e.magnitude || 0) * 0.55 * params.fieldScale;
      const cy = Math.floor(FH * (0.35 + ((e.additions + e.deletions) % 97) / 97 * 0.4));
      const rad = Math.max(3, Math.floor(8 + e.magnitude * 28 * params.fieldScale));
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const xx = x + dx;
          const yy = cy + dy;
          if (xx < 0 || xx >= FW || yy < 0 || yy >= FH) continue;
          const d = Math.hypot(dx / rad, dy / rad);
          if (d > 1) continue;
          const w = (1 - d) * (1 - d) * (e.magnitude || 0.05) * band;
          const i = yy * FW + xx;
          add[i] += w * (e.additions + 1);
          del[i] += w * (e.deletions + 1);
        }
      }
    }

    let aBlur = blurBox(add, FW, FH, 10);
    let bBlur = blurBox(del, FW, FH, 10);
    aBlur = blurBox(aBlur, FW, FH, 6);
    bBlur = blurBox(bBlur, FW, FH, 6);

    // radial vignette — composed center
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const nx = (x - FW / 2) / (FW / 2);
        const ny = (y - FH / 2) / (FH / 2);
        const vig = Math.max(0, 1 - Math.hypot(nx, ny) * 0.85);
        const i = y * FW + x;
        aBlur[i] *= 0.35 + vig * 0.65;
        bBlur[i] *= 0.35 + vig * 0.65;
      }
    }

    let maxA = 1e-9;
    let maxB = 1e-9;
    for (let i = 0; i < aBlur.length; i++) {
      if (aBlur[i] > maxA) maxA = aBlur[i];
      if (bBlur[i] > maxB) maxB = bBlur[i];
    }
    for (let i = 0; i < aBlur.length; i++) {
      aBlur[i] = (aBlur[i] / maxA) * params.inkDensity;
      bBlur[i] = (bBlur[i] / maxB) * params.inkDensity;
    }

    const threshold = 0.5;
    return {
      dotsA: atkinson(aBlur, FW, FH, threshold),
      dotsB: atkinson(bBlur, FW, FH, threshold),
    };
  },
  render(ctx, frame, params, prepared) {
    const pal = palette(params.palette);
    paper(ctx, frame, pal.paper);
    const { dotsA, dotsB } = prepared;
    const mis = params.misregistration;
    const draftStep = frame.quality < 0.5 ? 2 : 1;

    // channel A — first 60% of timeline
    for (let y = 0; y < FH; y += draftStep) {
      const rowT = y / FH;
      // ragged frontier: noise-offset per column baked as simple hash
      for (let x = 0; x < FW; x += draftStep) {
        const frontier = rowT + ((((x * 1103515245) >>> 0) % 1000) / 1000 - 0.5) * 0.04;
        const a = reveal(frame.t, frontier * 0.6, 0.05);
        if (a <= 0) continue;
        if (!dotsA[y * FW + x]) continue;
        ctx.globalAlpha = 0.85 * a;
        ctx.fillStyle = pal.a;
        ctx.fillRect(x * SCALE, y * SCALE, SCALE * draftStep - 0.5, SCALE * draftStep - 0.5);
      }
    }

    // channel B — 40%→100%, offset like second drum
    for (let y = 0; y < FH; y += draftStep) {
      const rowT = y / FH;
      for (let x = 0; x < FW; x += draftStep) {
        const frontier = 0.4 + rowT * 0.6 + ((((x * 2654435761) >>> 0) % 1000) / 1000 - 0.5) * 0.04;
        const a = reveal(frame.t, frontier, 0.05);
        if (a <= 0) continue;
        if (!dotsB[y * FW + x]) continue;
        ctx.globalAlpha = 0.85 * a;
        ctx.fillStyle = pal.b;
        ctx.fillRect(x * SCALE + mis, y * SCALE + mis, SCALE * draftStep - 0.5, SCALE * draftStep - 0.5);
      }
    }
    ctx.globalAlpha = 1;

    grain(ctx, frame, frame.rngFor('grain'), 2500 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 17);
  },
};

export default recipe;
