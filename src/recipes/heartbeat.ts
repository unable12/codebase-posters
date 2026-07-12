import type { CanvasRecipe } from '../core/types';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, reveal, rgba, sprayStroke, typographyFooter } from '../core/draw';

// The repo's pulse: one continuous line across the poster. Calm stretches
// stay flat; intense weeks lift the trace; the biggest commits spike sharply,
// labeled with their dates. Animation draws it like an EKG monitor.

const SAMPLES = 700;

const recipe: CanvasRecipe<{
  palette: { type: 'select'; label: string; default: string; options: string[] };
  amplitude: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  spikes: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  tremor: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
}> = {
  engine: 'canvas2d',
  id: '02b-heartbeat',
  name: 'Heartbeat',
  description: 'The project’s pulse, drawn as one continuous line — calm, effort, and the spikes that mattered.',
  family: 'timeline',
  meaning: [
    { label: 'The line', text: 'One unbroken trace, left to right, first commit to last. Its height at any point is how hard the project was being worked on right then — churn, commit rate, burstiness combined.' },
    { label: 'Flat stretches', text: 'Silence. Days or weeks where nothing happened. As much a part of the story as the peaks.' },
    { label: 'Sharp spikes', text: 'The biggest commits — sudden jolts of work, labeled with their dates.' },
    { label: 'Animation', text: 'The trace draws itself like a hospital monitor, a bright dot riding the tip.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'coral-teal', options: PALETTE_NAMES },
    amplitude: { type: 'number', label: 'Amplitude', default: 260, min: 60, max: 600, step: 10 },
    spikes: { type: 'number', label: 'Spike height', default: 1, min: 0, max: 2.5, step: 0.1 },
    tremor: { type: 'number', label: 'Tremor', default: 0.4, min: 0, max: 1.5, step: 0.05 },
  },
  render(ctx, frame, params) {
    const pal = palette(params.palette);
    const { data, noise, t } = frame;
    const margin = 150;
    const innerW = frame.width - margin * 2;
    const baseY = frame.height / 2 - 40;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.05);

    // dense repos have hundreds of top-decile commits — only the biggest
    // few get spikes, and fewer still get labels, or the trace drowns
    const goals = data.events
      .filter((e) => e.isGoal)
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, 14);
    const labeled = new Set(goals.slice(0, 8).map((e) => e.sha));
    const intensityAt = (u: number) => {
      const pos = u * (data.buckets.length - 1);
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = data.buckets[i]?.intensity ?? 0;
      const b = data.buckets[Math.min(i + 1, data.buckets.length - 1)]?.intensity ?? 0;
      return a + (b - a) * frac;
    };

    // sample the full trace
    const pts: { x: number; y: number; u: number }[] = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const u = s / SAMPLES;
      let y = baseY - intensityAt(u) * params.amplitude;
      // fine tremor so the line feels hand-drawn
      y += noise(u * 40, 7) * params.tremor * 26 * (0.3 + intensityAt(u));
      // sharp spikes at the biggest commits
      for (const g of goals) {
        const d = Math.abs(u - g.t01);
        const w = 0.006;
        if (d < w) {
          const tent = 1 - d / w;
          y -= tent * tent * g.magnitude * params.spikes * 330;
        }
      }
      pts.push({ x: margin + u * innerW, y, u });
    }

    // faint baseline
    ctx.strokeStyle = rgba(pal.ink, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, baseY);
    ctx.lineTo(margin + innerW, baseY);
    ctx.stroke();

    // drawn prefix
    const drawn = pts.filter((p) => p.u <= t);
    if (drawn.length >= 2) {
      // brushed line in segments so each segment's spray is frame-stable
      const seg = 24;
      for (let i = 0; i + 1 < drawn.length; i += seg) {
        const slice = drawn.slice(i, Math.min(i + seg + 1, drawn.length));
        sprayStroke(ctx, slice, pal.a, frame.rngFor(`seg:${i}`), {
          width: 3.4,
          density: 2.6 * frame.quality,
          alpha: 0.12,
        });
      }
      // crisp core line on top
      ctx.strokeStyle = rgba(pal.a, 0.65);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      drawn.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      // monitor head dot while animating
      if (t < 1) {
        const head = drawn[drawn.length - 1];
        ctx.fillStyle = pal.b;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(pal.b, 0.25);
        ctx.beginPath();
        ctx.arc(head.x, head.y, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // spike labels
    ctx.save();
    ctx.font = '600 18px ui-monospace, Menlo, monospace';
    for (const g of goals) {
      if (!labeled.has(g.sha)) continue;
      const rv = reveal(t, g.t01, 0.03);
      if (rv <= 0) continue;
      const x = margin + g.t01 * innerW;
      const y = baseY - intensityAt(g.t01) * params.amplitude - g.magnitude * params.spikes * 330 - 16;
      ctx.globalAlpha = rv;
      ctx.fillStyle = pal.ink;
      ctx.fillText(g.timestamp.slice(5, 10), x - 24, y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    grain(ctx, frame, frame.rngFor('grain'), 3000 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 3);
  },
};

export default recipe;
