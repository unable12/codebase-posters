import type { CanvasRecipe } from '../core/types';
import type { FileStat, RepoDataset } from '../core/schema';
import { dataTexture, grain, hexToRgb, palette, PALETTE_NAMES, paper, rgba, typographyFooter } from '../core/draw';

// Painted treemap: each file a textured color field. Color mixes between the
// two palette colors by file age (recency), saturation-like weight by churn.
// Faint filenames on the tiles. Animation: tiles fade in by first-touch time.

interface Tile {
  file: FileStat;
  x: number;
  y: number;
  w: number;
  h: number;
}

function squarify(files: FileStat[], x: number, y: number, w: number, h: number): Tile[] {
  // simple slice-and-dice alternating direction — good enough texture for a fresco
  const tiles: Tile[] = [];
  const total = files.reduce((s, f) => s + Math.max(64, f.bytes), 0);
  const walk = (fs: FileStat[], x: number, y: number, w: number, h: number, horiz: boolean) => {
    if (fs.length === 0) return;
    if (fs.length === 1) {
      tiles.push({ file: fs[0], x, y, w, h });
      return;
    }
    const tot = fs.reduce((s, f) => s + Math.max(64, f.bytes), 0);
    let acc = 0;
    let i = 0;
    while (i < fs.length && acc < tot / 2) {
      acc += Math.max(64, fs[i].bytes);
      i++;
    }
    const frac = acc / tot;
    if (horiz) {
      walk(fs.slice(0, i), x, y, w * frac, h, !horiz);
      walk(fs.slice(i), x + w * frac, y, w * (1 - frac), h, !horiz);
    } else {
      walk(fs.slice(0, i), x, y, w, h * frac, !horiz);
      walk(fs.slice(i), x, y + h * frac, w, h * (1 - frac), !horiz);
    }
  };
  walk(
    files.slice().sort((a, b) => b.bytes - a.bytes),
    x,
    y,
    w,
    h,
    true,
  );
  void total;
  return tiles;
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    gap: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    roughness: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    filenames: { type: 'boolean'; label: string; default: boolean };
  },
  Tile[]
> = {
  engine: 'canvas2d',
  id: '07-treemap-fresco',
  name: 'Treemap Fresco',
  description: 'Every file a painted tile sized by bytes; color by recency, weight by churn, names as whispers.',
  family: 'structure',
  params: {
    palette: { type: 'select', label: 'Palette', default: 'ember-slate', options: PALETTE_NAMES },
    gap: { type: 'number', label: 'Tile gap', default: 6, min: 0, max: 24, step: 1 },
    roughness: { type: 'number', label: 'Edge roughness', default: 10, min: 0, max: 40, step: 1 },
    filenames: { type: 'boolean', label: 'Filenames', default: true },
  },
  prepare(data: RepoDataset) {
    const margin = 150;
    return squarify(
      data.files.filter((f) => f.bytes > 0),
      margin,
      margin,
      1500 - margin * 2,
      2000 - margin * 2 - 120,
    );
  },
  render(ctx, frame, params, tiles) {
    const pal = palette(params.palette);
    const { rng, noise, t } = frame;
    const [ra, ga, ba] = hexToRgb(pal.a);
    const [rb, gb, bb] = hexToRgb(pal.b);

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.05);

    const maxChurn = Math.max(...tiles.map((tl) => tl.file.churn), 1);

    for (const tile of tiles) {
      // fade in by first touch; untouched files treated as present from start
      const appear = tile.file.touches > 0 ? tile.file.firstT01 : 0;
      if (appear > t) continue;
      const fade = Math.min(1, (t - appear) * 8 + 0.15);

      const recency = tile.file.lastT01; // 0 old .. 1 fresh
      const mix = recency;
      const r = Math.round(rb + (ra - rb) * mix);
      const g = Math.round(gb + (ga - gb) * mix);
      const b = Math.round(bb + (ba - bb) * mix);
      const heat = Math.log1p(tile.file.churn) / Math.log1p(maxChurn);
      const alphaBase = (0.25 + heat * 0.5) * fade;

      const gx = params.gap / 2;
      const x = tile.x + gx;
      const y = tile.y + gx;
      const w = Math.max(2, tile.w - params.gap);
      const h = Math.max(2, tile.h - params.gap);

      // painted fill: several overlapping rough quads
      for (let layer = 0; layer < 4; layer++) {
        const j = params.roughness;
        ctx.fillStyle = `rgba(${r},${g},${b},${alphaBase * 0.32})`;
        ctx.beginPath();
        ctx.moveTo(x + rng.gauss() * j, y + rng.gauss() * j);
        ctx.lineTo(x + w + rng.gauss() * j, y + rng.gauss() * j);
        ctx.lineTo(x + w + rng.gauss() * j, y + h + rng.gauss() * j);
        ctx.lineTo(x + rng.gauss() * j, y + h + rng.gauss() * j);
        ctx.closePath();
        ctx.fill();
      }
      // texture speckle inside big tiles
      if (w * h > 6000) {
        const n = Math.floor((w * h) / 900);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.25 * fade})`;
        for (let i = 0; i < n; i++) {
          const px = x + rng.next() * w;
          const py = y + rng.next() * h;
          if (noise(px * 0.01, py * 0.01) > 0.1) ctx.fillRect(px, py, 1.6, 1.6);
        }
      }
      if (params.filenames && w > 90 && h > 26) {
        ctx.fillStyle = rgba(pal.ink, 0.55 * fade);
        ctx.font = '13px ui-monospace, Menlo, monospace';
        const name = tile.file.path.split('/').pop() ?? '';
        ctx.fillText(name.slice(0, Math.floor(w / 9)), x + 8, y + 20);
      }
    }

    grain(ctx, frame, rng, 4000);
    typographyFooter(ctx, frame, pal.ink, 7);
  },
};

export default recipe;
