import type { CanvasRecipe, Frame } from '../core/types';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, reveal, rgba, sprayStroke, typographyFooter } from '../core/draw';
import type { RepoEvent } from '../core/schema';

// Repo lifetime on a chrono-grid, additions vs deletions as two forces.
// Events emit flow-field strokes; addition-dominant events flow left in
// color A, deletion-dominant flow right in color B. The biggest commits
// are gravity wells that bend nearby strokes.

const GRID_COLS = 8;
const GRID_ROWS = 11;

interface GridPos {
  x: number;
  y: number;
}

function gridPos(t01: number, frame: Frame, margin: number): GridPos {
  const innerW = frame.width - margin * 2;
  const innerH = frame.height - margin * 2;
  const cell = Math.min(1 - 1e-9, Math.max(0, t01)) * GRID_COLS * GRID_ROWS;
  const row = Math.floor(cell / GRID_COLS);
  const col = cell % GRID_COLS;
  return {
    x: margin + (col / GRID_COLS) * innerW,
    y: margin + ((row + 0.5) / GRID_ROWS) * innerH,
  };
}

const recipe: CanvasRecipe<{
  palette: { type: 'select'; label: string; default: string; options: string[] };
  timeAxis: { type: 'select'; label: string; default: string; options: string[] };
  strokesPerEvent: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  strokeLength: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  gravity: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  noiseScale: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  showGrid: { type: 'boolean'; label: string; default: boolean };
}> = {
  engine: 'canvas2d',
  id: '01-chrono-grid',
  name: 'Chrono-Grid Confrontation',
  description: 'The life of the repo as weather: growth and cleanup as two winds pushing against each other.',
  family: 'flow',
  room: 'time',
  meaning: [
    { label: 'The grid', text: 'Time reads like a page: left to right, top to bottom. The top-left is the first commit, the bottom-right is today. Every file change lands where it happened in that timeline.' },
    { label: 'Blue-ish strokes (color A)', text: 'Changes that mostly ADDED code. They blow leftward — the force of growth.' },
    { label: 'Green-ish strokes (color B)', text: 'Changes that mostly DELETED code. They blow rightward — the force of cleanup and rewriting.' },
    { label: 'Stroke size & density', text: 'How big the change was (lines touched, log-scaled). Dense storms = heavy working sessions.' },
    { label: 'Dots with dates', text: 'The top 10% biggest commits. They act as gravity: nearby strokes bend toward them, so a huge commit visibly warps its neighborhood.' },
    { label: 'Faint background text', text: 'The raw statistics of this repo — commit counts, +/- totals, author shares — tiled like a watermark. The data the painting is made of.' },
    { label: 'Animation', text: 'Replays history in commit order: you watch the project get built, storm by storm.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'cobalt-mint', options: PALETTE_NAMES },
    timeAxis: { type: 'select', label: 'Time axis', default: 's01', options: ['s01', 't01'] },
    strokesPerEvent: { type: 'number', label: 'Strokes / event', default: 6, min: 1, max: 24, step: 1 },
    strokeLength: { type: 'number', label: 'Stroke length', default: 340, min: 60, max: 900, step: 10 },
    gravity: { type: 'number', label: 'Goal gravity', default: 0.55, min: 0, max: 1.5, step: 0.05 },
    noiseScale: { type: 'number', label: 'Noise scale', default: 0.0021, min: 0.0005, max: 0.008, step: 0.0001 },
    showGrid: { type: 'boolean', label: 'Show grid', default: false },
  },
  render(ctx, frame, params) {
    const pal = palette(params.palette);
    const { data, rng, noise, t } = frame;
    const margin = 150;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.07);

    const axis = params.timeAxis as 's01' | 't01';
    const goals = data.events.filter((e) => e.isGoal).map((e) => ({ e, p: gridPos(e[axis], frame, margin) }));
    const fileEvents = data.events.filter((e) => e.kind === 'file-change');
    const drama = (t01: number) => {
      const b = data.buckets[Math.min(data.buckets.length - 1, Math.floor(t01 * data.buckets.length))];
      return b ? b.intensity : 0;
    };

    if (params.showGrid) {
      ctx.save();
      ctx.strokeStyle = rgba(pal.ink, 0.25);
      ctx.lineWidth = 1;
      const innerW = frame.width - margin * 2;
      const innerH = frame.height - margin * 2;
      for (let c = 0; c <= GRID_COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(margin + (c / GRID_COLS) * innerW, margin);
        ctx.lineTo(margin + (c / GRID_COLS) * innerW, frame.height - margin);
        ctx.stroke();
      }
      for (let r = 0; r <= GRID_ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(margin, margin + (r / GRID_ROWS) * innerH);
        ctx.lineTo(frame.width - margin, margin + (r / GRID_ROWS) * innerH);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Strokes for revealed events (soft grow-in; per-event rng keeps
    // already-drawn strokes pixel-stable between animation frames).
    for (const e of fileEvents) {
      const rv = reveal(t, e[axis]);
      if (rv <= 0) continue;
      const origin = gridPos(e[axis], frame, margin);
      const additionSide = e.additions >= e.deletions;
      const color = additionSide ? pal.a : pal.b;
      const dir = additionSide ? -1 : 1; // additions flow left, deletions right
      const intensity = 0.35 + drama(e.t01) * 0.65;
      const nStrokes = Math.max(
        1,
        Math.round(params.strokesPerEvent * (0.4 + e.magnitude) * intensity * frame.quality),
      );
      const len = params.strokeLength * (0.35 + e.magnitude * 0.9);

      for (let s = 0; s < nStrokes; s++) {
        const srng = frame.rngFor(`${e.sha}:${e.path}:${s}`);
        let x = origin.x + srng.gauss() * 26;
        let y = origin.y + srng.gauss() * 26;
        const pts = [{ x, y }];
        const steps = 22;
        for (let k = 0; k < steps; k++) {
          const n = noise(x * params.noiseScale, y * params.noiseScale, e.t01 * 3);
          let angle = n * Math.PI * (1 + drama(e.t01)) + (dir < 0 ? Math.PI : 0);
          let vx = Math.cos(angle);
          let vy = Math.sin(angle) * 0.6;
          // gravity toward goals
          for (const g of goals) {
            const gdx = g.p.x - x;
            const gdy = g.p.y - y;
            const d2 = gdx * gdx + gdy * gdy;
            const pull = (params.gravity * 90000 * g.e.magnitude) / (d2 + 22000);
            vx += (gdx / Math.sqrt(d2 + 1)) * pull * 0.01;
            vy += (gdy / Math.sqrt(d2 + 1)) * pull * 0.01;
          }
          const vlen = Math.hypot(vx, vy) || 1;
          x += (vx / vlen) * (len / steps);
          y += (vy / vlen) * (len / steps);
          pts.push({ x, y });
        }
        // the brush travels: draw only the part of the path covered so far
        sprayStroke(ctx, pts.slice(0, Math.max(2, Math.ceil(pts.length * rv))), color, srng, {
          width: 5 + e.magnitude * 8,
          density: 1.6 * frame.quality,
          alpha: (0.05 + e.magnitude * 0.04) * (0.5 + 0.5 * rv),
        });
      }
    }

    // Goal markers: dots for all gravity wells, date labels only for the
    // biggest few so dense repos don't drown in text
    const labeled = new Set(
      goals
        .slice()
        .sort((a, b) => b.e.magnitude - a.e.magnitude)
        .slice(0, 12)
        .map((g) => g.e.sha),
    );
    ctx.save();
    ctx.font = '600 20px ui-monospace, Menlo, monospace';
    for (const g of goals) {
      const rv = reveal(t, g.e[axis]);
      if (rv <= 0) continue;
      ctx.globalAlpha = rv;
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.arc(g.p.x, g.p.y, (labeled.has(g.e.sha) ? 6 : 3.5) * rv, 0, Math.PI * 2);
      ctx.fill();
      if (labeled.has(g.e.sha)) ctx.fillText(g.e.timestamp.slice(5, 10), g.p.x + 14, g.p.y + 6);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    grain(ctx, frame, frame.rngFor('grain'), 3000 * frame.quality);
    typographyFooter(ctx, frame, pal.ink);
  },
};

export default recipe;
