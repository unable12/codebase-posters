import type { CanvasRecipe, Frame } from '../core/types';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, rgba, sprayStroke, typographyFooter } from '../core/draw';
import type { RepoEvent } from '../core/schema';

// The GenCup homage: repo lifetime on a chrono-grid, additions vs deletions
// as two forces. Events emit flow-field strokes; addition-dominant events flow
// left in color A, deletion-dominant flow right in color B. Big commits
// ("goals") are gravity wells that bend nearby strokes.

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
  strokesPerEvent: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  strokeLength: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  gravity: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  noiseScale: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  showGrid: { type: 'boolean'; label: string; default: boolean };
}> = {
  engine: 'canvas2d',
  id: '01-chrono-grid',
  name: 'Chrono-Grid Confrontation',
  description: 'Repo lifetime on a grid; additions and deletions push against each other. The GenCup homage.',
  family: 'flow',
  params: {
    palette: { type: 'select', label: 'Palette', default: 'france-senegal', options: PALETTE_NAMES },
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

    const goals = data.events.filter((e) => e.isGoal).map((e) => ({ e, p: gridPos(e.t01, frame, margin) }));
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

    // Strokes for events with t01 <= t (this is the animation).
    for (const e of fileEvents) {
      if (e.t01 > t) continue;
      const origin = gridPos(e.t01, frame, margin);
      const additionSide = e.additions >= e.deletions;
      const color = additionSide ? pal.a : pal.b;
      const dir = additionSide ? -1 : 1; // additions flow left, deletions right
      const intensity = 0.35 + drama(e.t01) * 0.65;
      const nStrokes = Math.max(1, Math.round(params.strokesPerEvent * (0.4 + e.magnitude) * intensity));
      const len = params.strokeLength * (0.35 + e.magnitude * 0.9);

      for (let s = 0; s < nStrokes; s++) {
        let x = origin.x + rng.gauss() * 26;
        let y = origin.y + rng.gauss() * 26;
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
        sprayStroke(ctx, pts, color, rng, {
          width: 5 + e.magnitude * 8,
          density: 1.6,
          alpha: 0.05 + e.magnitude * 0.04,
        });
      }
    }

    // Goal markers: minute-style labels (date) at gravity wells
    ctx.save();
    ctx.font = '600 20px ui-monospace, Menlo, monospace';
    for (const g of goals) {
      if (g.e.t01 > t) continue;
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.arc(g.p.x, g.p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(g.e.timestamp.slice(5, 10), g.p.x + 14, g.p.y + 6);
    }
    ctx.restore();

    grain(ctx, frame, rng);
    typographyFooter(ctx, frame, pal.ink);
  },
};

export default recipe;
