import type { CanvasRecipe } from '../core/types';
import type { FileStat, RepoDataset } from '../core/schema';
import { dataTexture, grain, hexToRgb, palette, PALETTE_NAMES, paper, reveal, rgba, typographyFooter } from '../core/draw';

// Painted treemap: each file a textured color field. Color mixes between the
// two palette colors by file age (recency), saturation-like weight by churn.
// Faint filenames on the tiles. Animation: tiles fade in by first-touch time.

interface Tile {
  file: FileStat;
  x: number;
  y: number;
  w: number;
  h: number;
  /** When this tile gets painted, as a fraction of the timeline (sequence-ranked). */
  appearAt: number;
}

function squarify(files: FileStat[], x: number, y: number, w: number, h: number): Tile[] {
  // simple slice-and-dice alternating direction — good enough texture for a fresco
  const tiles: Tile[] = [];
  const total = files.reduce((s, f) => s + Math.max(64, f.bytes), 0);
  const walk = (fs: FileStat[], x: number, y: number, w: number, h: number, horiz: boolean) => {
    if (fs.length === 0) return;
    if (fs.length === 1) {
      tiles.push({ file: fs[0], x, y, w, h, appearAt: 0 });
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
  // paint order: creation sequence (ties broken by wall position) spread
  // evenly across the timeline — young repos paint tile-by-tile instead of
  // every tile popping at t=0
  const order = tiles
    .map((tile, i) => ({ tile, i }))
    .sort((a, b) => a.tile.file.firstT01 - b.tile.file.firstT01 || a.i - b.i);
  order.forEach(({ tile }, rank) => {
    tile.appearAt = order.length > 1 ? (rank / (order.length - 1)) * 0.92 : 0;
  });
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
  description: 'The repo as a wall of painted tiles — every file gets the space it takes up.',
  family: 'structure',
  meaning: [
    { label: 'Tiles', text: 'One tile per file. Its area is the file’s size in bytes — big tiles are big files.' },
    { label: 'Color blend', text: 'Recency. Tiles shift toward color A when recently edited, toward color B when untouched for long. You can see at a glance where the live edge of the project is.' },
    { label: 'Opacity / weight', text: 'Churn — how much this file has been rewritten over its life. Bold tiles are battlegrounds; pale ones were written once and left alone.' },
    { label: 'Rough painted edges', text: 'Intentional imperfection — each tile is brushed, not drawn, so the wall reads as a fresco rather than a chart.' },
    { label: 'Animation', text: 'The wall is painted tile by tile in the order the files were created — each tile built up in coats of paint, its name written last.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'ember-slate', options: PALETTE_NAMES },
    gap: { type: 'number', label: 'Tile gap', default: 12, min: 0, max: 24, step: 1 },
    roughness: { type: 'number', label: 'Edge roughness', default: 18, min: 0, max: 40, step: 1 },
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
      const fade = reveal(t, tile.appearAt, 0.08);
      if (fade <= 0) continue;
      const trng = frame.rngFor(`tile:${tile.file.path}`);

      const recency = tile.file.lastT01; // 0 old .. 1 fresh
      const mix = recency;
      const r = Math.round(rb + (ra - rb) * mix);
      const g = Math.round(gb + (ga - gb) * mix);
      const b = Math.round(bb + (ba - bb) * mix);
      const heat = Math.log1p(tile.file.churn) / Math.log1p(maxChurn);
      // paint arrives at full strength — the brush lays it down, nothing fades in
      const alphaBase = 0.25 + heat * 0.5;

      const gx = params.gap / 2;
      const x = tile.x + gx;
      const y = tile.y + gx;
      const w = Math.max(2, tile.w - params.gap);
      const h = Math.max(2, tile.h - params.gap);

      // painted fill: each coat is brushed across the tile — a wobbly wet
      // edge sweeps along the long axis, alternating direction per coat
      for (let layer = 0; layer < 4; layer++) {
        const coat = Math.max(0, Math.min(1, (fade - layer * 0.22) / 0.3));
        const j = params.roughness;
        // fixed rng draws per layer keep later coats frame-stable
        const corners = [
          trng.gauss() * j, trng.gauss() * j,
          trng.gauss() * j, trng.gauss() * j,
          trng.gauss() * j, trng.gauss() * j,
          trng.gauss() * j, trng.gauss() * j,
        ];
        if (coat <= 0) continue;

        // the tile's rough quad is the wall area this coat may cover
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + corners[0], y + corners[1]);
        ctx.lineTo(x + w + corners[2], y + corners[3]);
        ctx.lineTo(x + w + corners[4], y + h + corners[5]);
        ctx.lineTo(x + corners[6], y + h + corners[7]);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = `rgba(${r},${g},${b},${alphaBase * 0.32})`;

        if (coat >= 1) {
          ctx.fillRect(x - j * 2, y - j * 2, w + j * 4, h + j * 4);
        } else {
          const dir = layer % 2 === 0 ? 1 : -1; // brush goes back and forth
          const horiz = w >= h; // sweep along the long axis
          const wob = j * 1.2 + 6;
          const nseed = x * 0.013 + y * 0.007 + layer * 3.71;
          ctx.beginPath();
          if (horiz) {
            const span = w + j * 4 + wob * 2;
            const fx = dir > 0 ? x - j * 2 + span * coat : x + w + j * 2 - span * coat;
            const backX = dir > 0 ? x - j * 2 : x + w + j * 2;
            ctx.moveTo(backX, y - j * 2);
            for (let s = 0; s <= 8; s++) {
              const yy = y - j * 2 + ((h + j * 4) * s) / 8;
              ctx.lineTo(fx + noise(yy * 0.015, nseed) * wob, yy);
            }
            ctx.lineTo(backX, y + h + j * 2);
          } else {
            const span = h + j * 4 + wob * 2;
            const fy = dir > 0 ? y - j * 2 + span * coat : y + h + j * 2 - span * coat;
            const backY = dir > 0 ? y - j * 2 : y + h + j * 2;
            ctx.moveTo(x - j * 2, backY);
            for (let s = 0; s <= 8; s++) {
              const xx = x - j * 2 + ((w + j * 4) * s) / 8;
              ctx.lineTo(xx, fy + noise(xx * 0.015, nseed) * wob);
            }
            ctx.lineTo(x + w + j * 2, backY);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      // texture speckle inside big tiles
      if (w * h > 6000) {
        const n = Math.floor(((w * h) / 900) * frame.quality);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.25 * fade})`;
        for (let i = 0; i < n; i++) {
          const px = x + trng.next() * w;
          const py = y + trng.next() * h;
          if (noise(px * 0.01, py * 0.01) > 0.1) ctx.fillRect(px, py, 1.6, 1.6);
        }
      }
      // the name is written last, once the paint is down
      if (params.filenames && w > 90 && h > 26 && fade >= 1) {
        ctx.fillStyle = rgba(pal.ink, 0.55);
        ctx.font = '13px ui-monospace, Menlo, monospace';
        const name = tile.file.path.split('/').pop() ?? '';
        ctx.fillText(name.slice(0, Math.floor(w / 9)), x + 8, y + 20);
      }
    }

    grain(ctx, frame, frame.rngFor('grain'), 4000 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 7);
  },
};

export default recipe;
