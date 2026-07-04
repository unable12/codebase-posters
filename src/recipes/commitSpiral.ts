import type { CanvasRecipe } from '../core/types';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, rgba, sprayStroke, typographyFooter } from '../core/draw';

// Time as an inward spiral. Events are marks along the curve, sized by churn;
// addition-dominant events spray outward (color A), deletion-dominant inward (color B).

const recipe: CanvasRecipe<{
  palette: { type: 'select'; label: string; default: string; options: string[] };
  turns: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  timeAxis: { type: 'select'; label: string; default: string; options: string[] };
  sprayLength: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  wobble: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
}> = {
  engine: 'canvas2d',
  id: '02-commit-spiral',
  name: 'Commit Spiral',
  description: 'The repo lifetime as an inward spiral; events spray outward or inward by add/delete balance.',
  family: 'timeline',
  params: {
    palette: { type: 'select', label: 'Palette', default: 'clay-sea', options: PALETTE_NAMES },
    turns: { type: 'number', label: 'Spiral turns', default: 5, min: 2, max: 12, step: 0.5 },
    timeAxis: { type: 'select', label: 'Time axis', default: 's01', options: ['t01', 's01'] },
    sprayLength: { type: 'number', label: 'Spray length', default: 170, min: 30, max: 500, step: 10 },
    wobble: { type: 'number', label: 'Wobble', default: 0.35, min: 0, max: 1.5, step: 0.05 },
  },
  render(ctx, frame, params) {
    const pal = palette(params.palette);
    const { data, rng, noise, t } = frame;
    const cx = frame.width / 2;
    const cy = frame.height / 2 - 60;
    const rMax = Math.min(frame.width, frame.height) / 2 - 180;
    const rMin = 40;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.06);

    const pos = (u: number) => {
      const angle = u * params.turns * Math.PI * 2 - Math.PI / 2;
      const r = rMax - (rMax - rMin) * u;
      const w = noise(Math.cos(angle) * 2 + 5, Math.sin(angle) * 2 + 5, u * 4) * params.wobble * 60;
      return {
        x: cx + Math.cos(angle) * (r + w),
        y: cy + Math.sin(angle) * (r + w) * 0.92,
        angle,
      };
    };

    // faint guide spiral up to t
    ctx.save();
    ctx.strokeStyle = rgba(pal.ink, 0.18);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= 600 * t; i++) {
      const p = pos(i / 600);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();

    const axis = params.timeAxis as 't01' | 's01';
    for (const e of data.events) {
      if (e.kind !== 'file-change') continue;
      const u = e[axis];
      if (u > t) continue;
      const p = pos(u);
      const outward = e.additions >= e.deletions;
      const color = outward ? pal.a : pal.b;
      const dir = outward ? 1 : -1;
      const len = params.sprayLength * (0.25 + e.magnitude);
      const nx = Math.cos(p.angle) * dir;
      const ny = Math.sin(p.angle) * dir;
      const pts = [];
      const steps = 12;
      for (let k = 0; k <= steps; k++) {
        const v = k / steps;
        const bend = noise(p.x * 0.004, p.y * 0.004, u * 6) * 60 * v;
        pts.push({
          x: p.x + nx * len * v + Math.cos(p.angle + Math.PI / 2) * bend,
          y: p.y + ny * len * v + Math.sin(p.angle + Math.PI / 2) * bend,
        });
      }
      sprayStroke(ctx, pts, color, rng, {
        width: 3 + e.magnitude * 7,
        density: 2.4,
        alpha: 0.08 + e.magnitude * 0.06,
      });
    }

    // goals as dots + date labels on the spiral
    ctx.save();
    ctx.font = '600 19px ui-monospace, Menlo, monospace';
    for (const e of data.events) {
      if (!e.isGoal || e[axis] > t) continue;
      const p = pos(e[axis]);
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(e.timestamp.slice(5, 10), p.x + 12, p.y - 8);
    }
    ctx.restore();

    grain(ctx, frame, rng);
    typographyFooter(ctx, frame, pal.ink, 2);
  },
};

export default recipe;
