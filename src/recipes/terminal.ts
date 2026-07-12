import type { CanvasRecipe } from '../core/types';
import { grain, palette, PALETTE_NAMES, paper, reveal, rgba, typographyFooter } from '../core/draw';

// The repo typeset as monospace glyphs — activity as character density.
// dataTexture omitted: the piece IS text.

const RAMPS: Record<string, string> = {
  classic: ' .:-=+*#%@',
  blocks: ' ░▒▓█',
  dots: ' ·•●',
};

type Cell = {
  i: number;
  col: number;
  row: number;
  x: number;
  y: number;
  value: number;
  addShare: number;
  glyph: string;
  isGoal: boolean;
  goalDate?: string;
};

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    glyphSize: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    ramp: { type: 'select'; label: string; default: string; options: string[] };
  },
  { cells: Cell[]; cols: number; rows: number; cell: number; margin: number }
> = {
  engine: 'canvas2d',
  id: '16-terminal',
  name: 'Terminal',
  description: 'The repository typed into existence: activity as a field of monospace glyphs.',
  family: 'texture',
  room: 'texture',
  meaning: [
    { label: 'The grid', text: 'Every cell is a moment in the project\'s life, left-to-right, top-to-bottom.' },
    { label: 'Dense glyphs', text: 'Heavier characters mean more work landed in that moment.' },
    { label: 'Blue vs green', text: 'Cells lean toward the palette\'s A color when additions dominate, B when deletions do.' },
    { label: 'Reversed dates', text: 'The biggest commits print their date as ink-on-paper blocks: the ASCII version of the dots.' },
    { label: 'Animation', text: 'The terminal types chronologically. A block cursor rides the frontier, then vanishes.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'ember-slate', options: PALETTE_NAMES },
    glyphSize: { type: 'number', label: 'Glyph size', default: 16, min: 10, max: 24, step: 1 },
    ramp: { type: 'select', label: 'Ramp', default: 'classic', options: Object.keys(RAMPS) },
  },
  prepare(data, params, seed) {
    const cell = params.glyphSize;
    const margin = 120;
    const cols = Math.floor((1500 - margin * 2) / cell);
    const rows = Math.floor((2000 - margin * 2 - 40) / cell);
    const n = cols * rows;
    const field = new Float64Array(n);
    const addField = new Float64Array(n);
    const delField = new Float64Array(n);

    const deposit = (t01: number, mag: number, add: number, del: number, halo: boolean) => {
      const idx = Math.min(n - 1, Math.max(0, Math.floor(t01 * n)));
      const radius = halo ? 1 : 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const col = (idx % cols) + dx;
          const row = Math.floor(idx / cols) + dy;
          if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
          const j = row * cols + col;
          const w = dx === 0 && dy === 0 ? 1 : 0.35;
          field[j] += mag * w;
          addField[j] += add * w;
          delField[j] += del * w;
        }
      }
    };

    for (const e of data.events) {
      if (e.kind !== 'file-change' && e.kind !== 'commit') continue;
      deposit(e.t01, e.magnitude || 0.02, e.additions, e.deletions, true);
    }

    let max = 1e-9;
    for (let i = 0; i < n; i++) if (field[i] > max) max = field[i];

    const ramp = RAMPS[params.ramp] ?? RAMPS.classic;
    const goals = data.events
      .filter((e) => e.isGoal)
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, 12);
    const goalAt = new Map<number, string>();
    for (const g of goals) {
      const idx = Math.min(n - 1, Math.floor(g.t01 * n));
      if (!goalAt.has(idx)) goalAt.set(idx, g.timestamp.slice(5, 10));
    }

    // deterministic jitter from seed
    let h = seed * 2654435761 >>> 0;
    const next = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return (h >>> 0) / 4294967296;
    };

    const cells: Cell[] = [];
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const v = field[i] / max;
      let step = Math.min(ramp.length - 1, Math.floor(v * (ramp.length - 1)));
      const jitter = next() > 0.7 ? (next() > 0.5 ? 1 : -1) : 0;
      step = Math.min(ramp.length - 1, Math.max(0, step + jitter));
      const add = addField[i];
      const del = delField[i];
      cells.push({
        i,
        col,
        row,
        x: margin + col * cell + cell * 0.15,
        y: margin + row * cell + cell * 0.78,
        value: v,
        addShare: add + del > 0 ? add / (add + del) : 0.5,
        glyph: ramp[step],
        isGoal: goalAt.has(i),
        goalDate: goalAt.get(i),
      });
    }
    return { cells, cols, rows, cell, margin };
  },
  render(ctx, frame, params, prepared) {
    const pal = palette(params.palette);
    const { cells, cols, rows, cell, margin } = prepared;
    paper(ctx, frame, pal.paper);

    const n = cols * rows;
    const frontier = Math.floor(frame.t * n);
    ctx.font = `${params.glyphSize * 0.92}px ui-monospace, Menlo, monospace`;

    for (const c of cells) {
      // draft: skip halo cells already baked; still draw all for simplicity at low quality skip empty
      if (frame.quality < 0.5 && c.value < 0.02 && !c.isGoal) continue;
      const appearAt = c.i / n;
      const a = reveal(frame.t, appearAt * 0.98, 0.02);
      if (a <= 0) continue;

      if (c.isGoal && c.goalDate) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = pal.ink;
        ctx.fillRect(margin + c.col * cell, margin + c.row * cell, cell * Math.min(4, c.goalDate.length * 0.7), cell);
        ctx.fillStyle = pal.paper;
        ctx.fillText(c.goalDate, c.x, c.y);
        ctx.restore();
        continue;
      }

      const color =
        c.value < 0.08
          ? rgba(pal.ink, 0.5)
          : c.addShare >= 0.5
            ? pal.a
            : pal.b;
      ctx.save();
      ctx.globalAlpha = a * (0.55 + c.value * 0.45);
      ctx.fillStyle = color;
      ctx.fillText(c.glyph, c.x, c.y);
      ctx.restore();
    }

    // block cursor at frontier while typing
    if (frame.t < 1 && frontier < n) {
      const col = frontier % cols;
      const row = Math.floor(frontier / cols);
      const pulse = 0.45 + 0.55 * Math.abs(Math.sin(frame.t * 40));
      ctx.fillStyle = rgba(pal.ink, pulse);
      ctx.fillRect(margin + col * cell, margin + row * cell + 2, cell * 0.7, cell * 0.85);
    }

    grain(ctx, frame, frame.rngFor('grain'), 1800 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 16);
  },
};

export default recipe;
