import type { CanvasRecipe } from '../core/types';
import type { RepoDataset } from '../core/schema';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, sprayStroke, typographyFooter } from '../core/draw';
import { hashString, makeRng } from '../core/rng';

// The repo's raw text IS the wind: character codes fill a coarse grid of
// angles; particles seeded across the poster trace through that field.
// prepare() integrates full trajectories so scrubbing t is a pure lookup.

const FIELD = 28; // field resolution (cols); rows follow 4:3
const STEPS = 90;

interface Traj {
  pts: { x: number; y: number }[];
  color: 'a' | 'b';
  weight: number;
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    particles: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    swirl: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    stepSize: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  },
  Traj[]
> = {
  engine: 'canvas2d',
  id: '17-char-flow',
  name: 'Character Flow Field',
  description: 'Your source text turned into wind; particles ride it and leave trails.',
  family: 'particles',
  meaning: [
    { label: 'The wind', text: 'Invisible, but everywhere: the poster is divided into a grid, and each region’s wind direction comes from the actual characters of your code at that position. Different code = different weather. This poster cannot be forged — it is derived from the text itself.' },
    { label: 'Trails', text: 'Particles dropped onto the canvas and carried by that wind. Where trails bunch and curl, the underlying text has repetitive structure; where they scatter, the text is chaotic.' },
    { label: 'Two colors', text: 'Split by the repo’s language balance — if 70% of the repo is markdown, ~70% of particles carry color A.' },
    { label: 'Animation', text: 'The particles take flight: every trail grows from its seed point simultaneously.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'cobalt-mint', options: PALETTE_NAMES },
    particles: { type: 'number', label: 'Particles', default: 700, min: 100, max: 3000, step: 50 },
    swirl: { type: 'number', label: 'Swirl', default: 2.2, min: 0.5, max: 6, step: 0.1 },
    stepSize: { type: 'number', label: 'Step size', default: 9, min: 3, max: 24, step: 1 },
  },
  prepare(data: RepoDataset, params, seed) {
    const rng = makeRng(hashString(`char-flow|${seed}`));
    const W = 1500;
    const H = 2000;
    const cols = FIELD;
    const rowsN = Math.round(FIELD * (H / W));

    // build the angle field from raw characters
    const text = data.contentSamples.map((s) => s.lines.map((l) => l.text).join('')).join('') || 'empty';
    const field: number[] = [];
    for (let i = 0; i < cols * rowsN; i++) {
      const c = text.charCodeAt(i % text.length);
      field.push(((c % 97) / 97) * Math.PI * 2 * params.swirl);
    }
    const angleAt = (x: number, y: number) => {
      const cx = Math.max(0, Math.min(cols - 1, Math.floor((x / W) * cols)));
      const cy = Math.max(0, Math.min(rowsN - 1, Math.floor((y / H) * rowsN)));
      return field[cy * cols + cx];
    };

    // language split decides each particle's color: share of dominant ext
    const domShare = data.languages[0]?.share ?? 0.5;

    const trajs: Traj[] = [];
    for (let p = 0; p < params.particles; p++) {
      let x = rng.next() * W;
      let y = rng.next() * H;
      const pts = [{ x, y }];
      for (let s = 0; s < STEPS; s++) {
        const a = angleAt(x, y);
        x += Math.cos(a) * params.stepSize;
        y += Math.sin(a) * params.stepSize;
        if (x < -50 || x > W + 50 || y < -50 || y > H + 50) break;
        pts.push({ x, y });
      }
      trajs.push({
        pts,
        color: rng.next() < domShare ? 'a' : 'b',
        weight: 0.4 + rng.next() * 0.6,
      });
    }
    return trajs;
  },
  render(ctx, frame, params, trajs) {
    const pal = palette(params.palette);
    const { rng, t } = frame;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.06);

    for (const traj of trajs) {
      const n = Math.max(2, Math.floor(traj.pts.length * t));
      const pts = traj.pts.slice(0, n);
      sprayStroke(ctx, pts, traj.color === 'a' ? pal.a : pal.b, rng, {
        width: 2.5 + traj.weight * 3,
        density: 1.2,
        alpha: 0.045 + traj.weight * 0.03,
      });
    }

    grain(ctx, frame, rng);
    typographyFooter(ctx, frame, pal.ink, 17);
  },
};

export default recipe;
