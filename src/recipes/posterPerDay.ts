import type { CanvasRecipe } from '../core/types';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, reveal, rgba, sprayStroke, typographyFooter } from '../core/draw';
import type { DaySlice } from '../core/schema';

// A calendar diary: EVERY day in the repo's date range gets a cell — active
// days become small storm cards, silent days stay as faint ghost outlines.
// Cell size adapts to the span so 12 days reads as a contact sheet and 271
// days as dense confetti; the grid block is centered on the paper.

const MAX_CELL = 260;

interface CalDay {
  date: string;
  slice?: DaySlice;
  index: number;
}

function daysInRange(first: string, last: string): string[] {
  const out: string[] = [];
  const d = new Date(first.slice(0, 10) + 'T00:00:00Z');
  const end = new Date(last.slice(0, 10) + 'T00:00:00Z');
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const recipe: CanvasRecipe<{
  palette: { type: 'select'; label: string; default: string; options: string[] };
  energy: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  dates: { type: 'boolean'; label: string; default: boolean };
}> = {
  engine: 'canvas2d',
  id: '11-poster-per-day',
  name: 'One Poster Per Day',
  description: 'Every day of the repo’s life gets a cell — storms on working days, silence on the rest.',
  family: 'timeline',
  meaning: [
    { label: 'Cells', text: 'One cell per calendar day, first commit to last, reading like text. Days you worked become small storm cards; days you didn’t stay as faint empty outlines — the silence is part of the diary.' },
    { label: 'Rising strokes (color A)', text: 'Additions — code growing upward from the ground of the card.' },
    { label: 'Falling strokes (color B)', text: 'Deletions — code raining away from the top.' },
    { label: 'Wildness', text: 'The day’s drama: bursty, high-churn days storm harder. Calm days stay sparse and quiet.' },
    { label: 'Scale', text: 'Cell size adapts to the repo’s lifespan — a young repo is a small centered contact sheet, a long-lived one becomes dense calendar confetti.' },
    { label: 'Animation', text: 'Days wash in chronologically — flipping through the diary.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'rose-forest', options: PALETTE_NAMES },
    energy: { type: 'number', label: 'Energy', default: 1, min: 0.2, max: 3, step: 0.1 },
    dates: { type: 'boolean', label: 'Date labels', default: true },
  },
  render(ctx, frame, params) {
    const pal = palette(params.palette);
    const { data, noise, t } = frame;
    const margin = 130;
    const innerW = frame.width - margin * 2;
    const innerH = frame.height - margin * 2 - 140;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.05);

    const allDates = daysInRange(data.meta.firstCommit, data.meta.lastCommit);
    const sliceByDate = new Map(data.days.map((d) => [d.date, d]));
    const days: CalDay[] = allDates.map((date, index) => ({ date, slice: sliceByDate.get(date), index }));
    const total = days.length;

    // pick the column count that maximizes cell size, capped to [MIN, MAX]
    let cols = 1;
    let cell = 0;
    for (let c = 1; c <= 40; c++) {
      const size = Math.min(innerW / c, innerH / Math.ceil(total / c));
      if (size > cell) {
        cell = size;
        cols = c;
      }
    }
    cell = Math.min(cell, MAX_CELL);
    const rows = Math.ceil(total / cols);
    const blockW = cols * cell;
    const blockH = rows * cell;
    const x0 = margin + (innerW - blockW) / 2;
    const y0 = margin + (innerH - blockH) / 2;

    const maxChurn = Math.max(...data.days.map((d) => d.additions + d.deletions), 1);
    const pad = Math.max(3, cell * 0.06);
    const showLabels = params.dates && cell >= 110;

    for (const day of days) {
      const appear = total > 1 ? day.index / (total - 1) : 0;
      const rv = reveal(t, appear * 0.96, 0.04);
      if (rv <= 0) continue;
      const col = day.index % cols;
      const row = Math.floor(day.index / cols);
      const cx = x0 + col * cell + pad;
      const cy = y0 + row * cell + pad;
      const w = cell - pad * 2;
      const h = cell - pad * 2;
      const drng = frame.rngFor(`day:${day.date}`);

      if (!day.slice) {
        // silent day: faint ghost outline with a resting dot
        ctx.strokeStyle = rgba(pal.ink, 0.16 * rv);
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, w, h);
        ctx.fillStyle = rgba(pal.ink, 0.14 * rv);
        ctx.beginPath();
        ctx.arc(cx + w / 2, cy + h / 2, Math.max(1.5, cell * 0.015), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const d = day.slice;
      // card
      ctx.globalAlpha = rv;
      ctx.fillStyle = rgba(pal.ink, 0.05);
      ctx.fillRect(cx + 3, cy + 3, w, h);
      ctx.fillStyle = pal.paper;
      ctx.fillRect(cx, cy, w, h);
      ctx.strokeStyle = rgba(pal.ink, 0.4);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx, cy, w, h);
      ctx.globalAlpha = 1;

      const churn = d.additions + d.deletions;
      const weight = Math.log1p(churn) / Math.log1p(maxChurn);
      const addFrac = churn ? d.additions / churn : 0.5;
      const strokes = Math.max(
        2,
        Math.round((3 + weight * 14) * params.energy * (0.5 + d.drama) * frame.quality),
      );

      for (let s = 0; s < strokes; s++) {
        const srng = frame.rngFor(`storm:${day.date}:${s}`);
        const fromA = srng.next() < addFrac;
        const color = fromA ? pal.a : pal.b;
        let sx = cx + w * (0.15 + srng.next() * 0.7);
        let sy = fromA ? cy + h * (0.55 + srng.next() * 0.35) : cy + h * (0.1 + srng.next() * 0.3);
        const dir = fromA ? -1 : 1;
        const pts = [{ x: sx, y: sy }];
        const steps = 8;
        const len = h * (0.25 + weight * 0.4) * (0.5 + d.drama) * (0.4 + 0.6 * rv);
        for (let k = 0; k < steps; k++) {
          const n = noise(sx * 0.012, sy * 0.012, day.index * 0.7);
          sx += n * 9 * (1 + d.drama * 1.5);
          sy += (dir * len) / steps;
          sx = Math.max(cx + 2, Math.min(cx + w - 2, sx));
          sy = Math.max(cy + 2, Math.min(cy + h - 2, sy));
          pts.push({ x: sx, y: sy });
        }
        sprayStroke(ctx, pts, color, srng, {
          width: Math.max(1.5, cell * 0.018) + weight * 3,
          density: 1.8 * frame.quality,
          alpha: (0.05 + weight * 0.05) * rv,
        });
      }

      if (showLabels) {
        ctx.globalAlpha = rv;
        ctx.fillStyle = pal.ink;
        ctx.font = `600 ${Math.max(11, cell * 0.09)}px ui-monospace, Menlo, monospace`;
        ctx.fillText(d.date.slice(5), cx + 6, cy + h - 7);
        ctx.globalAlpha = 1;
      }
    }

    grain(ctx, frame, frame.rngFor('grain'), 3000 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 11);
  },
};

export default recipe;
