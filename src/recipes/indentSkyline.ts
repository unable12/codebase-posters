import type { CanvasRecipe } from '../core/types';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, rgba, typographyFooter } from '../core/draw';

// The code itself as textile: every sampled line becomes a thin horizontal
// bar — x offset by indentation, width by line length. Files stack top to
// bottom like woven bands. Color alternates per file between the two inks.

const recipe: CanvasRecipe<{
  palette: { type: 'select'; label: string; default: string; options: string[] };
  lineHeight: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  indentScale: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  jitter: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
}> = {
  engine: 'canvas2d',
  id: '14-indent-skyline',
  name: 'Indentation Skyline',
  description: 'Every line of code is a woven thread: indent = offset, length = width. The repo as textile.',
  family: 'texture',
  params: {
    palette: { type: 'select', label: 'Palette', default: 'france-senegal', options: PALETTE_NAMES },
    lineHeight: { type: 'number', label: 'Thread height', default: 4, min: 2, max: 12, step: 0.5 },
    indentScale: { type: 'number', label: 'Indent scale', default: 26, min: 6, max: 80, step: 2 },
    jitter: { type: 'number', label: 'Jitter', default: 1.5, min: 0, max: 8, step: 0.5 },
  },
  render(ctx, frame, params) {
    const pal = palette(params.palette);
    const { data, rng, t } = frame;
    const margin = 150;
    const innerW = frame.width - margin * 2;
    const innerH = frame.height - margin * 2 - 120;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.05);

    // flatten all sampled lines, remembering file boundaries
    const rows: { indent: number; length: number; fileIdx: number }[] = [];
    data.contentSamples.forEach((s, fi) => {
      for (const l of s.lines) rows.push({ indent: l.indent, length: l.length, fileIdx: fi });
    });
    if (rows.length === 0) return;

    const rowH = Math.max(params.lineHeight, innerH / rows.length);
    const visible = Math.min(rows.length, Math.floor(innerH / rowH));
    const shown = Math.floor(visible * t);

    for (let i = 0; i < shown; i++) {
      // sample rows evenly across the whole set so t reveals top→bottom of the poster
      const r = rows[Math.floor((i / visible) * rows.length)];
      const y = margin + i * rowH;
      const fromLeft = r.fileIdx % 2 === 0; // alternate files weave from opposite edges
      const indent = Math.min(r.indent * params.indentScale, innerW * 0.4);
      const w = Math.max(2, Math.min(innerW - indent, (r.length / 100) * innerW * 0.6) * (0.7 + rng.next() * 0.3));
      const x = fromLeft
        ? margin + indent + rng.gauss() * params.jitter * 2
        : frame.width - margin - indent - w + rng.gauss() * params.jitter * 2;
      const color = fromLeft ? pal.a : pal.b;
      const alpha = 0.28 + (r.length > 80 ? 0.2 : 0) + rng.next() * 0.12;
      ctx.fillStyle = rgba(color, Math.min(0.6, alpha));
      ctx.fillRect(x, y + rng.gauss() * params.jitter, w, rowH * 0.72);
    }

    grain(ctx, frame, rng, 5000);
    typographyFooter(ctx, frame, pal.ink, 14);
  },
};

export default recipe;
