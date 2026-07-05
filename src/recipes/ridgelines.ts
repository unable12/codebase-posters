import type { CanvasRecipe } from '../core/types';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, rgba, sprayStroke, typographyFooter } from '../core/draw';

// Joy-division ridgelines: the repo's lifetime cut into horizontal bands,
// each band a horizon whose peaks are the churn inside that slice of time.
// Nearer (later) ridges occlude the ones behind them.

const X_SAMPLES = 220;

const recipe: CanvasRecipe<{
  palette: { type: 'select'; label: string; default: string; options: string[] };
  bands: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  height: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  overlap: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
}> = {
  engine: 'canvas2d',
  id: '03-ridgelines',
  name: 'Ridgelines',
  description: 'The repo’s life as a mountain range — each ridge one slice of time, peaks where the work was.',
  family: 'timeline',
  meaning: [
    { label: 'Ridges', text: 'The repo’s lifetime cut into equal slices of time, top to bottom: the first ridge is the beginning, the last is now. Each ridge is that period’s horizon.' },
    { label: 'Peaks', text: 'Mountains rise where commits landed — height is churn, so a violent week makes an alp and a quiet one stays a plain.' },
    { label: 'Color', text: 'Each peak takes color A when the work there mostly added code, color B when it mostly deleted.' },
    { label: 'Occlusion', text: 'Nearer ridges hide the ones behind them, the way mountain ranges do — later work stands in front of earlier work.' },
    { label: 'Animation', text: 'Each ridge draws itself left to right like a pen stroke, oldest first — the range sketched one horizon at a time.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'clay-sea', options: PALETTE_NAMES },
    bands: { type: 'number', label: 'Ridges', default: 14, min: 5, max: 30, step: 1 },
    height: { type: 'number', label: 'Peak height', default: 180, min: 60, max: 400, step: 10 },
    overlap: { type: 'number', label: 'Overlap', default: 1.4, min: 1, max: 2.5, step: 0.1 },
  },
  render(ctx, frame, params) {
    const pal = palette(params.palette);
    const { data, noise, t } = frame;
    const margin = 160;
    const innerW = frame.width - margin * 2;
    const K = Math.round(params.bands);
    const fileEvents = data.events.filter((e) => e.kind === 'file-change');
    const maxMag = Math.max(...fileEvents.map((e) => e.magnitude), 1e-9);

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.05);

    // headroom above the first baseline must fit the tallest possible peak
    const topY = 200 + params.height * params.overlap;
    const bottomY = frame.height - 320;
    const rowGap = (bottomY - topY) / Math.max(1, K - 1);

    // build each band's profile from the events inside its time slice
    for (let b = 0; b < K; b++) {
      const t0 = b / K;
      const t1 = (b + 1) / K;
      const baseline = topY + b * rowGap;
      // pen progress: each ridge draws itself left -> right, staggered oldest first
      const start = (b / K) * 0.86;
      const prog = t >= 1 ? 1 : Math.max(0, Math.min(1, (t - start) / 0.14));
      if (prog <= 0) continue;

      const events = fileEvents.filter((e) => e.t01 >= t0 && e.t01 < t1);
      const profile = new Array(X_SAMPLES + 1).fill(0);
      const colorMix = new Array(X_SAMPLES + 1).fill(0); // + additions, - deletions
      for (const e of events) {
        const u = (e.t01 - t0) / (t1 - t0);
        const center = u * X_SAMPLES;
        const sigma = 5 + e.magnitude * 9;
        const amp = (e.magnitude / maxMag) * 1.0;
        const lo = Math.max(0, Math.floor(center - sigma * 3));
        const hi = Math.min(X_SAMPLES, Math.ceil(center + sigma * 3));
        for (let s = lo; s <= hi; s++) {
          const g = Math.exp(-((s - center) ** 2) / (2 * sigma * sigma)) * amp;
          profile[s] += g;
          colorMix[s] += g * (e.additions >= e.deletions ? 1 : -1);
        }
      }
      const maxP = Math.max(...profile, 0.4);

      // sample points at full height — the animation is the drawing, not growth
      const pts = profile.map((p, s) => {
        const u = s / X_SAMPLES;
        const hills = (p / maxP) * params.height * params.overlap;
        const texture = (noise(u * 9 + b * 3, b * 1.7) * 0.5 + 0.5) * 14;
        return { x: margin + u * innerW, y: baseline - hills - texture };
      });
      const drawnCount = Math.max(2, Math.ceil(pts.length * prog));

      // occlude everything behind the drawn part of this ridge
      ctx.fillStyle = pal.paper;
      ctx.beginPath();
      ctx.moveTo(margin, baseline + 2);
      for (let s = 0; s < drawnCount; s++) ctx.lineTo(pts[s].x, pts[s].y);
      ctx.lineTo(pts[drawnCount - 1].x, baseline + 2);
      ctx.closePath();
      ctx.fill();

      // ridge line, colored per segment by add/delete dominance
      const seg = 12;
      for (let s = 0; s + 1 < drawnCount; s += seg) {
        const slice = pts.slice(s, Math.min(s + seg + 1, drawnCount));
        const mix = colorMix.slice(s, s + seg + 1).reduce((a, v) => a + v, 0);
        const active = profile.slice(s, s + seg + 1).some((v) => v > 0.02);
        const color = mix >= 0 ? pal.a : pal.b;
        if (active) {
          sprayStroke(ctx, slice, color, frame.rngFor(`ridge:${b}:${s}`), {
            width: 2.6,
            density: 2.2 * frame.quality,
            alpha: 0.14,
          });
        }
        ctx.strokeStyle = rgba(active ? color : pal.ink, active ? 0.55 : 0.3);
        ctx.lineWidth = active ? 1.6 : 1;
        ctx.beginPath();
        slice.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }

      // the pen's ink dot riding the tip while this ridge is being drawn
      if (prog < 1) {
        const tip = pts[drawnCount - 1];
        ctx.fillStyle = rgba(pal.ink, 0.8);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    grain(ctx, frame, frame.rngFor('grain'), 3000 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 3);
  },
};

export default recipe;
