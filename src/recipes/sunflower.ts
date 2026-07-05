import type { CanvasRecipe } from '../core/types';
import type { FileStat, RepoDataset } from '../core/schema';
import { dataTexture, grain, hexToRgb, palette, PALETTE_NAMES, paper, reveal, rgba, typographyFooter } from '../core/draw';

// Phyllotaxis: every file is a seed placed at the golden angle, in the order
// the files were created. The repo grows the way a sunflower head does —
// oldest seeds at the center, newest at the rim.

const GOLDEN = (137.508 * Math.PI) / 180;

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    spread: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    seedScale: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    labels: { type: 'boolean'; label: string; default: boolean };
  },
  FileStat[]
> = {
  engine: 'canvas2d',
  id: '06-sunflower',
  name: 'Sunflower',
  description: 'Every file a seed at the golden angle, planted in the order it was created.',
  family: 'structure',
  meaning: [
    { label: 'Seeds', text: 'One seed per file, placed by the same golden-angle rule sunflowers use. The repo grows like a flower head: earliest files at the center, newest at the rim.' },
    { label: 'Seed size', text: 'The file’s size in bytes.' },
    { label: 'Color blend', text: 'Churn heat — seeds shift toward color A when heavily rewritten, toward color B when written once and left alone. Hot cores and quiet edges become visible.' },
    { label: 'Names', text: 'The largest files carry their names, like botanical specimens.' },
    { label: 'Animation', text: 'The flower grows: seeds spiral out one by one in creation order.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'ochre-indigo', options: PALETTE_NAMES },
    spread: { type: 'number', label: 'Spread', default: 1, min: 0.5, max: 1.6, step: 0.05 },
    seedScale: { type: 'number', label: 'Seed size', default: 1, min: 0.3, max: 3, step: 0.1 },
    labels: { type: 'boolean', label: 'File names', default: true },
  },
  prepare(data: RepoDataset) {
    // creation order; untouched files (firstT01=0) sort first, ties by path for determinism
    return data.files
      .filter((f) => f.bytes > 0)
      .sort((a, b) => a.firstT01 - b.firstT01 || a.path.localeCompare(b.path));
  },
  render(ctx, frame, params, files) {
    const pal = palette(params.palette);
    const { t } = frame;
    const cx = frame.width / 2;
    const cy = frame.height / 2 - 60;
    const n = files.length;
    if (n === 0) return;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.05);

    const maxR = (Math.min(frame.width, frame.height) / 2 - 190) * params.spread;
    const k = maxR / Math.sqrt(n);
    const [ra, ga, ba] = hexToRgb(pal.a);
    const [rb, gb, bb] = hexToRgb(pal.b);
    const maxChurn = Math.max(...files.map((f) => f.churn), 1);
    const bigCut = files
      .map((f) => f.bytes)
      .sort((a, b) => b - a)[Math.min(4, n - 1)];

    files.forEach((f, i) => {
      const appear = n > 1 ? i / (n - 1) : 0;
      const rv = reveal(t, appear * 0.96, 0.05);
      if (rv <= 0) return;
      const r = k * Math.sqrt(i + 0.5);
      const theta = i * GOLDEN;
      const x = cx + Math.cos(theta) * r;
      const y = cy + Math.sin(theta) * r * 0.96;

      const heat = Math.log1p(f.churn) / Math.log1p(maxChurn);
      const cr = Math.round(rb + (ra - rb) * heat);
      const cg = Math.round(gb + (ga - gb) * heat);
      const cb2 = Math.round(bb + (ba - bb) * heat);
      // seed size adapts to seed spacing (k) so sparse repos get plump seeds
      // and dense repos stay tight; bytes modulate within that band
      const byteNorm = Math.min(1, Math.sqrt(f.bytes) / 220);
      // bloom: overshoot past full size then settle — seeds pop open
      const u = rv - 1;
      const bloom = rv >= 1 ? 1 : 1 + 2.7 * u * u * u + 1.7 * u * u;
      const radius = Math.max(3, k * (0.16 + byteNorm * 0.3)) * params.seedScale * bloom;

      // layered soft ink circles = one painted seed
      const srng = frame.rngFor(`seed:${f.path}`);
      const layers = Math.max(2, Math.round(4 * frame.quality));
      for (let l = 0; l < layers; l++) {
        const jx = srng.gauss() * radius * 0.18;
        const jy = srng.gauss() * radius * 0.18;
        ctx.fillStyle = `rgba(${cr},${cg},${cb2},${(0.16 + heat * 0.1) * rv})`;
        ctx.beginPath();
        ctx.arc(x + jx, y + jy, radius * (0.75 + srng.next() * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
      // a dark nucleus for well-churned seeds
      if (heat > 0.4) {
        ctx.fillStyle = rgba(pal.ink, 0.35 * heat * rv);
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }

      if (params.labels && f.bytes >= bigCut && rv >= 1) {
        ctx.fillStyle = rgba(pal.ink, 0.7);
        ctx.font = '15px ui-monospace, Menlo, monospace';
        const name = f.path.split('/').pop() ?? '';
        ctx.fillText(name.slice(0, 24), x + radius + 6, y + 5);
      }
    });

    grain(ctx, frame, frame.rngFor('grain'), 3000 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 6);
  },
};

export default recipe;
