import type { CanvasRecipe } from '../core/types';
import type { RepoDataset, RepoEvent } from '../core/schema';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, reveal, rgba, typographyFooter } from '../core/draw';
import { hashString, makeRng } from '../core/rng';

// A vintage star chart on cream paper: every work session is a constellation.
// Commits are ink stars joined by hairlines; the chart's grid and ticks give
// it the feel of an old celestial map.

const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

interface Star {
  e: RepoEvent;
  x: number;
  y: number;
}

interface Session {
  stars: Star[];
  label: string;
}

function layoutSessions(data: RepoDataset, seed: number, w: number, h: number): Session[] {
  const margin = 190;
  const commits = data.events.filter((e) => e.kind === 'commit');
  const groups: RepoEvent[][] = [];
  for (const c of commits) {
    const last = groups[groups.length - 1];
    if (
      last &&
      new Date(c.timestamp).getTime() - new Date(last[last.length - 1].timestamp).getTime() < SESSION_GAP_MS
    ) {
      last.push(c);
    } else {
      groups.push([c]);
    }
  }
  return groups.map((g, gi) => {
    const rng = makeRng(hashString(`session:${seed}:${gi}:${g[0].sha}`));
    // time flows top -> bottom; x scattered per session
    const midT = g.reduce((s, e) => s + e.t01, 0) / g.length;
    const cx = margin + rng.next() * (w - margin * 2);
    const cy = margin + midT * (h - margin * 2 - 120);
    const spread = 46 + Math.sqrt(g.length) * 40;
    const stars = g.map((e, i) => {
      const a = rng.next() * Math.PI * 2;
      const r = (0.3 + rng.next() * 0.7) * spread;
      return {
        e,
        x: Math.max(margin * 0.6, Math.min(w - margin * 0.6, cx + Math.cos(a) * r + i * 14)),
        y: Math.max(margin * 0.6, Math.min(h - margin * 0.7, cy + Math.sin(a) * r * 0.8)),
      };
    });
    return { stars, label: g[0].timestamp.slice(5, 10) };
  });
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    starScale: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    chartGrid: { type: 'boolean'; label: string; default: boolean };
  },
  Session[]
> = {
  engine: 'canvas2d',
  id: '12-constellations',
  name: 'Constellations',
  description: 'Every work session a constellation on a vintage star chart — commits as stars, joined in sequence.',
  family: 'timeline',
  meaning: [
    { label: 'Stars', text: 'One star per commit, sized by how much it changed. Bright heavy stars are the big commits.' },
    { label: 'Constellations', text: 'Commits made within two hours of each other belong to one work session — one star sign. The hairlines join them in the order you made them.' },
    { label: 'Top to bottom', text: 'Time flows down the chart: earliest sessions near the top, latest near the bottom. Sideways placement is celestial chance.' },
    { label: 'Date marks', text: 'Each constellation carries the date of its first commit, like a named star sign.' },
    { label: 'Chart furniture', text: 'The fine grid and cross ticks are drawn the way old celestial maps were — ink on cream paper.' },
    { label: 'Animation', text: 'The sky fills in chronologically: stars appear, then the lines that join them.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'cobalt-mint', options: PALETTE_NAMES },
    starScale: { type: 'number', label: 'Star size', default: 1, min: 0.4, max: 2.5, step: 0.1 },
    chartGrid: { type: 'boolean', label: 'Chart grid', default: true },
  },
  prepare(data: RepoDataset, _params, seed: number) {
    return layoutSessions(data, seed, 1500, 2000);
  },
  render(ctx, frame, params, sessions) {
    const pal = palette(params.palette);
    const { t } = frame;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.05);

    // chart furniture
    if (params.chartGrid) {
      const margin = 130;
      ctx.strokeStyle = rgba(pal.ink, 0.08);
      ctx.lineWidth = 1;
      const step = (frame.width - margin * 2) / 8;
      for (let x = margin; x <= frame.width - margin + 1; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, margin);
        ctx.lineTo(x, frame.height - margin - 120);
        ctx.stroke();
      }
      for (let y = margin; y <= frame.height - margin - 119; y += step) {
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(frame.width - margin, y);
        ctx.stroke();
        // cross ticks at intersections
        for (let x = margin; x <= frame.width - margin + 1; x += step) {
          ctx.strokeStyle = rgba(pal.ink, 0.16);
          ctx.beginPath();
          ctx.moveTo(x - 4, y);
          ctx.lineTo(x + 4, y);
          ctx.moveTo(x, y - 4);
          ctx.lineTo(x, y + 4);
          ctx.stroke();
          ctx.strokeStyle = rgba(pal.ink, 0.08);
        }
      }
    }

    // dense skies get smaller, fainter stars; only the very biggest sparkle
    const commitCount = sessions.reduce((s, g) => s + g.stars.length, 0);
    const density = Math.min(1, 300 / Math.max(commitCount, 1));
    const dim = 0.45 + 0.55 * density;
    const sparkling = new Set(
      sessions
        .flatMap((s) => s.stars)
        .filter((s) => s.e.isGoal)
        .sort((a, b) => b.e.magnitude - a.e.magnitude)
        .slice(0, 18)
        .map((s) => s.e.sha),
    );
    const labelEvery = Math.max(1, Math.ceil(sessions.length / 24));

    sessions.forEach((session, si) => {
      // connecting hairlines: each draws once both endpoints have appeared
      for (let i = 0; i + 1 < session.stars.length; i++) {
        const a = session.stars[i];
        const b = session.stars[i + 1];
        const rv = reveal(t, b.e.t01, 0.04);
        if (rv <= 0) continue;
        ctx.strokeStyle = rgba(pal.ink, 0.35 * dim * rv);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + (b.x - a.x) * rv, a.y + (b.y - a.y) * rv);
        ctx.stroke();
      }

      for (const star of session.stars) {
        const rv = reveal(t, star.e.t01, 0.04);
        if (rv <= 0) continue;
        const size = (3 + star.e.magnitude * 11) * params.starScale * dim * (0.4 + 0.6 * rv);
        const color = star.e.additions >= star.e.deletions ? pal.a : pal.b;
        // arrival flash: a brief extra halo as the star twinkles into existence
        if (rv < 1) {
          const flash = Math.sin(rv * Math.PI);
          ctx.fillStyle = rgba(color, 0.22 * flash);
          ctx.beginPath();
          ctx.arc(star.x, star.y, size * (2.5 + flash * 2.5), 0, Math.PI * 2);
          ctx.fill();
        }
        // layered ink star
        ctx.fillStyle = rgba(color, 0.12 * dim * rv);
        ctx.beginPath();
        ctx.arc(star.x, star.y, size * 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(color, 0.5 * dim * rv);
        ctx.beginPath();
        ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(pal.ink, 0.75 * dim * rv);
        ctx.beginPath();
        ctx.arc(star.x, star.y, size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        // four-point sparkle on the very biggest
        if (sparkling.has(star.e.sha)) {
          ctx.strokeStyle = rgba(pal.ink, 0.55 * rv);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(star.x - size * 2.6, star.y);
          ctx.lineTo(star.x + size * 2.6, star.y);
          ctx.moveTo(star.x, star.y - size * 2.6);
          ctx.lineTo(star.x, star.y + size * 2.6);
          ctx.stroke();
        }
      }

      const first = session.stars[0];
      const rv = reveal(t, first.e.t01, 0.04);
      if (rv > 0.6 && si % labelEvery === 0) {
        ctx.fillStyle = rgba(pal.ink, 0.5 * rv);
        ctx.font = '15px ui-monospace, Menlo, monospace';
        ctx.fillText(session.label, first.x + 12, first.y - 12);
      }
    });

    grain(ctx, frame, frame.rngFor('grain'), 3500 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 12);
  },
};

export default recipe;
