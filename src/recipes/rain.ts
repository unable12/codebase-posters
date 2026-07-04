import type { CanvasRecipe } from '../core/types';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, reveal, rgba, typographyFooter } from '../core/draw';

// Circadian rain: hour of day across, calendar days down. Every commit is a
// raindrop that falls to the hour it was made — the poster is literally when
// you work. The animation is weather.

const recipe: CanvasRecipe<{
  palette: { type: 'select'; label: string; default: string; options: string[] };
  streak: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  dropScale: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  hourLabels: { type: 'boolean'; label: string; default: boolean };
}> = {
  engine: 'canvas2d',
  id: '13-rain',
  name: 'Rain',
  description: 'Commits as rainfall on an hour-of-day field — the poster of when you actually work.',
  family: 'timeline',
  meaning: [
    { label: 'The field', text: 'Across: the 24 hours of a day, midnight to midnight. Down: every calendar day of the repo, first at the top. Each drop lands at the exact hour its commit was made.' },
    { label: 'Drops & streaks', text: 'One drop per commit; the streak above it is the falling trail — longer for bigger commits. Columns of rain reveal your working hours; a drop far from the others is a 3am fix.' },
    { label: 'Color', text: 'Color A when the commit mostly added code, color B when it mostly deleted.' },
    { label: 'Splashes', text: 'The biggest commits land hard enough to splash — ringed like rain on pavement.' },
    { label: 'Animation', text: 'The storm replays chronologically: each drop falls from the top of the poster to its hour.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'cobalt-mint', options: PALETTE_NAMES },
    streak: { type: 'number', label: 'Streak length', default: 1, min: 0, max: 2.5, step: 0.1 },
    dropScale: { type: 'number', label: 'Drop size', default: 1, min: 0.4, max: 2.5, step: 0.1 },
    hourLabels: { type: 'boolean', label: 'Hour labels', default: true },
  },
  render(ctx, frame, params) {
    const pal = palette(params.palette);
    const { data, t } = frame;
    const margin = 160;
    const innerW = frame.width - margin * 2;
    const topY = 260;
    const bottomY = frame.height - 300;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.05);

    // hour gridlines
    ctx.save();
    ctx.font = '15px ui-monospace, Menlo, monospace';
    for (let h = 0; h <= 24; h += 6) {
      const x = margin + (h / 24) * innerW;
      ctx.strokeStyle = rgba(pal.ink, 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, topY - 30);
      ctx.lineTo(x, bottomY + 20);
      ctx.stroke();
      if (params.hourLabels) {
        ctx.fillStyle = rgba(pal.ink, 0.5);
        ctx.fillText(String(h).padStart(2, '0'), x - 12, topY - 44);
      }
    }
    ctx.restore();

    const commits = data.events.filter((e) => e.kind === 'commit');
    const firstDay = new Date(data.meta.firstCommit.slice(0, 10) + 'T00:00:00Z').getTime();
    const lastDay = new Date(data.meta.lastCommit.slice(0, 10) + 'T00:00:00Z').getTime();
    const daySpan = Math.max(1, (lastDay - firstDay) / 86400000);

    for (const e of commits) {
      const rv = reveal(t, e.t01 * 0.96, 0.05);
      if (rv <= 0) continue;
      const drng = frame.rngFor(`drop:${e.sha}`);

      // author-local hour + minutes straight from the ISO string (keeps their timezone)
      const hour = parseInt(e.timestamp.slice(11, 13), 10) + parseInt(e.timestamp.slice(14, 16), 10) / 60;
      const dayIdx = (new Date(e.timestamp.slice(0, 10) + 'T00:00:00Z').getTime() - firstDay) / 86400000;
      const x = margin + (hour / 24) * innerW + drng.gauss() * 3;
      const yFinal = topY + (dayIdx / daySpan) * (bottomY - topY);

      // the drop falls: eased descent from the top edge to its spot
      const ease = 1 - (1 - rv) * (1 - rv);
      const y = topY - 120 + (yFinal - topY + 120) * ease;

      const color = e.additions >= e.deletions ? pal.a : pal.b;
      const size = (2.2 + e.magnitude * 5.5) * params.dropScale;

      // streak above the drop
      const streakLen = (30 + e.magnitude * 190) * params.streak;
      if (streakLen > 2) {
        const gradSteps = Math.max(3, Math.round(8 * frame.quality));
        for (let s = 0; s < gradSteps; s++) {
          const v = s / gradSteps;
          ctx.fillStyle = rgba(color, 0.22 * (1 - v) * rv);
          ctx.fillRect(x - 0.8, y - streakLen * v - streakLen / gradSteps, 1.6, streakLen / gradSteps + 1);
        }
      }

      // the drop
      ctx.fillStyle = rgba(color, 0.75 * rv);
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.7, size, 0, 0, Math.PI * 2);
      ctx.fill();

      // splash rings once landed
      if (e.isGoal && rv >= 1) {
        ctx.strokeStyle = rgba(color, 0.4);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(x, yFinal + 3, size * 3.2, size * 1.1, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = rgba(color, 0.18);
        ctx.beginPath();
        ctx.ellipse(x, yFinal + 3, size * 5.4, size * 1.8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    grain(ctx, frame, frame.rngFor('grain'), 3000 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 13);
  },
};

export default recipe;
