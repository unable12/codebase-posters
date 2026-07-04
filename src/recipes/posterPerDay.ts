import type { CanvasRecipe } from '../core/types';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, rgba, sprayStroke, typographyFooter } from '../core/draw';

// A series-of-matches view: every active day is a mini-poster cell in a
// calendar grid, drawn in one shared visual language. Days with more drama
// get wilder strokes. Animation: days appear chronologically.

const recipe: CanvasRecipe<{
  palette: { type: 'select'; label: string; default: string; options: string[] };
  columns: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  energy: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  dates: { type: 'boolean'; label: string; default: boolean };
}> = {
  engine: 'canvas2d',
  id: '11-poster-per-day',
  name: 'One Poster Per Day',
  description: 'Each active day is a mini-poster; the series is the artwork. Storms on dramatic days.',
  family: 'timeline',
  params: {
    palette: { type: 'select', label: 'Palette', default: 'rose-forest', options: PALETTE_NAMES },
    columns: { type: 'number', label: 'Columns', default: 3, min: 2, max: 6, step: 1 },
    energy: { type: 'number', label: 'Energy', default: 1, min: 0.2, max: 3, step: 0.1 },
    dates: { type: 'boolean', label: 'Date labels', default: true },
  },
  render(ctx, frame, params) {
    const pal = palette(params.palette);
    const { data, rng, noise, t } = frame;
    const margin = 130;
    const days = data.days;
    const cols = Math.round(params.columns);
    const rows = Math.ceil(days.length / cols);
    const cellW = (frame.width - margin * 2) / cols;
    const cellH = Math.min((frame.height - margin * 2 - 140) / rows, cellW * 1.33);

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.05);

    const maxChurn = Math.max(...days.map((d) => d.additions + d.deletions), 1);

    days.forEach((day, i) => {
      const appear = (i + 1) / days.length;
      if (appear > t + 1e-9) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x0 = margin + col * cellW + 14;
      const y0 = margin + row * cellH + 14;
      const w = cellW - 28;
      const h = cellH - 28;

      // mini paper card
      ctx.fillStyle = rgba(pal.ink, 0.04);
      ctx.fillRect(x0 + 4, y0 + 4, w, h);
      ctx.fillStyle = pal.paper;
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = rgba(pal.ink, 0.35);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x0, y0, w, h);

      const churn = day.additions + day.deletions;
      const weight = Math.log1p(churn) / Math.log1p(maxChurn);
      const addFrac = churn ? day.additions / churn : 0.5;
      const strokes = Math.round((4 + weight * 26) * params.energy * (0.5 + day.drama));

      for (let s = 0; s < strokes; s++) {
        const fromA = rng.next() < addFrac;
        const color = fromA ? pal.a : pal.b;
        // additions rise from the bottom, deletions fall from the top
        let x = x0 + w * (0.15 + rng.next() * 0.7);
        let y = fromA ? y0 + h * (0.6 + rng.next() * 0.3) : y0 + h * (0.1 + rng.next() * 0.3);
        const dir = fromA ? -1 : 1;
        const pts = [{ x, y }];
        const steps = 10;
        const len = h * (0.25 + weight * 0.45) * (0.6 + day.drama);
        for (let k = 0; k < steps; k++) {
          const n = noise(x * 0.01, y * 0.01, i * 0.7);
          x += n * 14 * (1 + day.drama * 2);
          y += (dir * len) / steps;
          x = Math.max(x0 + 4, Math.min(x0 + w - 4, x));
          y = Math.max(y0 + 4, Math.min(y0 + h - 4, y));
          pts.push({ x, y });
        }
        sprayStroke(ctx, pts, color, rng, {
          width: 2.5 + weight * 4,
          density: 2,
          alpha: 0.06 + weight * 0.05,
        });
      }

      if (params.dates) {
        ctx.fillStyle = pal.ink;
        ctx.font = '600 15px ui-monospace, Menlo, monospace';
        ctx.fillText(day.date.slice(5), x0 + 8, y0 + h - 10);
        ctx.font = '13px ui-monospace, Menlo, monospace';
        ctx.fillStyle = rgba(pal.ink, 0.6);
        ctx.fillText(`${day.commits}c +${day.additions} -${day.deletions}`, x0 + 70, y0 + h - 10);
      }
    });

    grain(ctx, frame, rng);
    typographyFooter(ctx, frame, pal.ink, 11);
  },
};

export default recipe;
