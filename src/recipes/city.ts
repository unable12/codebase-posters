import type { CanvasRecipe } from '../core/types';
import type { FileStat } from '../core/schema';
import {
  dataTexture,
  grain,
  hexToRgb,
  palette,
  PALETTE_NAMES,
  paper,
  reveal,
  rgba,
  typographyFooter,
} from '../core/draw';

// The repo as an isometric city. Files are buildings; height is rebuild count;
// folders are districts. Axonometric projection only — no 3D engine.

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
const MAX_FILES = 400;

type Building = {
  gx: number;
  gy: number;
  w: number;
  d: number;
  h: number;
  file: FileStat;
  district: string;
  rank: number;
};

type DistrictLabel = { gx: number; gy: number; name: string };

type CityLayout = {
  buildings: Building[];
  labels: DistrictLabel[];
  dropped: number;
  minG: number;
  maxG: number;
};

function districtOf(path: string): string {
  const i = path.indexOf('/');
  return i < 0 ? '/' : path.slice(0, i);
}

function footprint(bytes: number): number {
  return Math.max(1, Math.min(3, Math.round(Math.sqrt(Math.max(1, bytes)) / 120)));
}

function shelfPack(
  files: FileStat[],
  originGx: number,
  originGy: number,
): { placed: { file: FileStat; gx: number; gy: number; w: number; d: number }[]; width: number; depth: number } {
  const items = files
    .map((f) => ({ file: f, s: footprint(f.bytes) }))
    .sort((a, b) => b.s - a.s || b.file.bytes - a.file.bytes);
  const totalCells = items.reduce((s, it) => s + it.s * it.s, 0);
  const blockW = Math.max(3, Math.ceil(Math.sqrt(totalCells * 1.6)));

  const placed: { file: FileStat; gx: number; gy: number; w: number; d: number }[] = [];
  let row = 0;
  let col = 0;
  let rowH = 0;
  let maxCol = 0;
  for (const it of items) {
    if (col + it.s > blockW) {
      row += rowH;
      col = 0;
      rowH = 0;
    }
    placed.push({ file: it.file, gx: originGx + col, gy: originGy + row, w: it.s, d: it.s });
    col += it.s;
    rowH = Math.max(rowH, it.s);
    maxCol = Math.max(maxCol, col);
  }
  return { placed, width: maxCol, depth: row + rowH };
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    scale: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    heightScale: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    labels: { type: 'boolean'; label: string; default: boolean };
    accent: { type: 'boolean'; label: string; default: boolean };
  },
  CityLayout
> = {
  engine: 'canvas2d',
  id: '08-city',
  name: 'The City',
  description: 'Files as buildings on an isometric skyline: height is how many times you came back to rebuild them.',
  family: 'structure',
  room: 'structure',
  meaning: [
    { label: 'Buildings', text: 'Each building is one file that still exists at HEAD.' },
    { label: 'Footprint', text: 'Larger files take a wider plot on the ground.' },
    { label: 'Height', text: 'Towers are the files you kept coming back to: height rises with how many times a file was touched.' },
    { label: 'Districts', text: 'Top-level folders are neighborhoods; street labels name them.' },
    { label: 'Tone', text: 'Roofs darken with recency: old town stays pale, the live edge goes dark. An optional accent outline marks files touched in the final stretch of history.' },
    { label: 'Animation', text: 'The city assembles in creation order. Founding files extrude first; later arrivals rise after.' },
    { label: 'No goal dots', text: 'This piece is structural, not temporal. The biggest commits live in the timeline room.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'ember-slate', options: PALETTE_NAMES },
    scale: { type: 'number', label: 'Scale', default: 1, min: 0.7, max: 1.5, step: 0.05 },
    heightScale: { type: 'number', label: 'Height scale', default: 1, min: 0.5, max: 2, step: 0.05 },
    labels: { type: 'boolean', label: 'District labels', default: true },
    accent: { type: 'boolean', label: 'Live-edge accent', default: true },
  },
  prepare(data, params) {
    const eligible = data.files.filter((f) => f.bytes > 0).sort((a, b) => b.bytes - a.bytes);
    const kept = eligible.slice(0, MAX_FILES);
    const dropped = Math.max(0, eligible.length - kept.length);

    const byDist = new Map<string, FileStat[]>();
    for (const f of kept) {
      const d = districtOf(f.path);
      const list = byDist.get(d) ?? [];
      list.push(f);
      byDist.set(d, list);
    }
    const districts = [...byDist.entries()]
      .map(([name, files]) => ({ name, files, bytes: files.reduce((s, f) => s + f.bytes, 0) }))
      .sort((a, b) => b.bytes - a.bytes);

    // spiral of block origins around center
    const buildings: Building[] = [];
    const labels: DistrictLabel[] = [];
    let cursorGx = 0;
    let cursorGy = 0;
    let leg = 0;
    let legLen = 1;
    let dir = 0; // 0 E, 1 S, 2 W, 3 N
    const dirs = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];

    // place first district at origin, then spiral
    for (let di = 0; di < districts.length; di++) {
      const dist = districts[di];
      const pack = shelfPack(dist.files, cursorGx, cursorGy);
      labels.push({ gx: cursorGx, gy: cursorGy + pack.depth + 0.5, name: dist.name });
      for (const p of pack.placed) {
        const h = Math.min(10, 1 + Math.log1p(p.file.touches) * params.heightScale * 1.8);
        buildings.push({
          gx: p.gx,
          gy: p.gy,
          w: p.w,
          d: p.d,
          h,
          file: p.file,
          district: dist.name,
          rank: 0,
        });
      }

      // advance spiral by roughly block size + street
      const step = Math.max(pack.width, pack.depth) + 2;
      for (let s = 0; s < step; s++) {
        cursorGx += dirs[dir][0];
        cursorGy += dirs[dir][1];
      }
      leg++;
      if (leg >= legLen) {
        leg = 0;
        dir = (dir + 1) % 4;
        if (dir % 2 === 0) legLen++;
      }
    }

    // creation order ranks for animation
    const byFirst = [...buildings].sort((a, b) => a.file.firstT01 - b.file.firstT01);
    byFirst.forEach((b, i) => {
      b.rank = i;
    });

    let minG = Infinity;
    let maxG = -Infinity;
    for (const b of buildings) {
      minG = Math.min(minG, b.gx, b.gy);
      maxG = Math.max(maxG, b.gx + b.w, b.gy + b.d);
    }
    if (!Number.isFinite(minG)) {
      minG = 0;
      maxG = 1;
    }

    return { buildings, labels, dropped, minG, maxG };
  },
  render(ctx, frame, params, prepared) {
    const pal = palette(params.palette);
    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.04);

    const { buildings, labels, dropped, minG, maxG } = prepared;
    const margin = 150;
    const footerBand = 160;
    const innerW = frame.width - margin * 2;
    const innerH = frame.height - margin - footerBand;
    const span = Math.max(1, maxG - minG);

    // fit unit so city spans ~78% of inner width (iso width ≈ span * u * 2 * cos30)
    const baseU = (14 + params.scale * 8);
    let u = baseU;
    const isoW = span * u * 2 * COS30;
    if (isoW > 0) u = Math.min(u, (innerW * 0.78) / (span * 2 * COS30));

    const project = (gx: number, gy: number, h = 0) => {
      const X = (gx - gy) * u * COS30;
      const Y = (gx + gy) * u * SIN30 - h * u;
      return { x: X, y: Y };
    };

    // center
    const corners = [
      project(minG, minG),
      project(maxG, minG),
      project(minG, maxG),
      project(maxG, maxG),
      project(minG, minG, 10),
      project(maxG, maxG, 10),
    ];
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const ox = margin + innerW / 2 - (minX + maxX) / 2;
    const oy = margin + innerH / 2 - (minY + maxY) / 2 + 40;

    const toScreen = (gx: number, gy: number, h = 0) => {
      const p = project(gx, gy, h);
      return { x: ox + p.x, y: oy + p.y };
    };

    // ground grid (streets)
    ctx.strokeStyle = rgba(pal.ink, 0.08);
    ctx.lineWidth = 0.75;
    for (let g = Math.floor(minG) - 1; g <= Math.ceil(maxG) + 1; g++) {
      const a = toScreen(g, minG - 1);
      const b = toScreen(g, maxG + 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const c = toScreen(minG - 1, g);
      const d = toScreen(maxG + 1, g);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }

    const sorted = [...buildings].sort((a, b) => a.gx + a.gy - (b.gx + b.gy) || a.gy - b.gy);
    const n = Math.max(1, buildings.length - 1);
    const [pr, pg, pb] = hexToRgb(pal.paper);
    const [ir, ig, ib] = hexToRgb(pal.ink);

    // Ink-wash city: tone only (paper→ink). Old files pale, fresh files dark.
    const mixInk = (amt: number): [number, number, number] => [
      Math.round(pr + (ir - pr) * amt),
      Math.round(pg + (ig - pg) * amt),
      Math.round(pb + (ib - pb) * amt),
    ];
    const rgb = (c: [number, number, number], a = 0.9) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    for (const b of sorted) {
      const appearAt = (b.rank / n) * 0.94;
      const rev = reveal(frame.t, appearAt, 0.06);
      if (rev <= 0) continue;
      const hh = b.h * rev;
      if (hh < 0.05) continue;

      const tone = 0.12 + 0.42 * b.file.lastT01;
      const roof = mixInk(tone);
      const left = mixInk(Math.min(1, tone + 0.14));
      const right = mixInk(Math.min(1, tone + 0.28));

      const p000 = toScreen(b.gx, b.gy, 0);
      const p100 = toScreen(b.gx + b.w, b.gy, 0);
      const p010 = toScreen(b.gx, b.gy + b.d, 0);
      const p110 = toScreen(b.gx + b.w, b.gy + b.d, 0);
      const p001 = toScreen(b.gx, b.gy, hh);
      const p101 = toScreen(b.gx + b.w, b.gy, hh);
      const p011 = toScreen(b.gx, b.gy + b.d, hh);
      const p111 = toScreen(b.gx + b.w, b.gy + b.d, hh);

      const quad = (pts: { x: number; y: number }[], fill: string) => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (frame.quality >= 0.5) {
          ctx.strokeStyle = rgba(pal.ink, 0.35);
          ctx.lineWidth = 0.75;
          ctx.stroke();
        }
      };

      // left face (toward -gy), right face (toward +gx), then top
      quad([p010, p110, p111, p011], rgb(left, 1));
      quad([p100, p110, p111, p101], rgb(right, 1));
      quad([p001, p101, p111, p011], rgb(roof, 0.9));

      // live-edge accent: thin roof outline in palette A (no fill)
      if (params.accent && b.file.lastT01 > 0.9 && frame.quality >= 0.5) {
        ctx.beginPath();
        ctx.moveTo(p001.x, p001.y);
        ctx.lineTo(p101.x, p101.y);
        ctx.lineTo(p111.x, p111.y);
        ctx.lineTo(p011.x, p011.y);
        ctx.closePath();
        ctx.strokeStyle = rgba(pal.a, 0.55);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      void p000;
    }

    if (params.labels) {
      ctx.font = '14px ui-monospace, Menlo, monospace';
      ctx.fillStyle = rgba(pal.ink, 0.55);
      for (const L of labels) {
        const p = toScreen(L.gx, L.gy, 0);
        const name = L.name === '/' ? '/' : L.name.slice(0, 18);
        // horizontal labels — iso skew read poorly in preview trials
        ctx.fillText(name, p.x - 4, p.y + 12);
      }
    }

    if (dropped > 0) {
      ctx.fillStyle = rgba(pal.ink, 0.45);
      ctx.font = '13px ui-monospace, Menlo, monospace';
      ctx.fillText(`+${dropped} smaller buildings beyond the ring road`, margin, frame.height - 120);
    }

    grain(ctx, frame, frame.rngFor('grain'), 2800 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 8);
  },
};

export default recipe;
