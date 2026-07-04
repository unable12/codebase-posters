import type { CanvasRecipe } from '../core/types';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, reveal, rgba, sprayStroke, typographyFooter } from '../core/draw';

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
  description: 'The whole life of the repo coiled into one spiral — a tree ring of your work.',
  family: 'timeline',
  meaning: [
    { label: 'The spiral', text: 'Time coils inward: the outer rim is the first commit, the center is now. Like a tree ring read backwards.' },
    { label: 'Outward sprays (color A)', text: 'File changes that mostly added code — they radiate out, the project expanding.' },
    { label: 'Inward sprays (color B)', text: 'Changes that mostly deleted — they point toward the center, the project contracting.' },
    { label: 'Spray length', text: 'Size of the change. Long bursts are big edits.' },
    { label: 'Dots with dates', text: 'The biggest commits, pinned to the moment they happened on the coil.' },
    { label: 'Animation', text: 'The spiral draws itself from the outside in — history spinning toward the present.' },
  ],
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
      const rv = reveal(t, u);
      if (rv <= 0) continue;
      const p = pos(u);
      const outward = e.additions >= e.deletions;
      const color = outward ? pal.a : pal.b;
      const dir = outward ? 1 : -1;
      const len = params.sprayLength * (0.25 + e.magnitude) * (0.4 + 0.6 * rv);
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
      sprayStroke(ctx, pts, color, frame.rngFor(`${e.sha}:${e.path}`), {
        width: 3 + e.magnitude * 7,
        density: 2.4 * frame.quality,
        alpha: (0.08 + e.magnitude * 0.06) * rv,
      });
    }

    // goals as dots on the spiral; date labels only for the biggest few
    const goals = data.events.filter((e) => e.isGoal);
    const labeled = new Set(
      goals.slice().sort((a, b) => b.magnitude - a.magnitude).slice(0, 12).map((e) => e.sha),
    );
    ctx.save();
    ctx.font = '600 19px ui-monospace, Menlo, monospace';
    for (const e of goals) {
      const rv = reveal(t, e[axis]);
      if (rv <= 0) continue;
      const p = pos(e[axis]);
      ctx.globalAlpha = rv;
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (labeled.has(e.sha) ? 5.5 : 3) * rv, 0, Math.PI * 2);
      ctx.fill();
      if (labeled.has(e.sha)) ctx.fillText(e.timestamp.slice(5, 10), p.x + 12, p.y - 8);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    grain(ctx, frame, frame.rngFor('grain'), 3000 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 2);
  },
};

export default recipe;
