import type { CanvasRecipe } from '../core/types';
import type { Rng } from '../core/rng';
import { grain, palette, PALETTE_NAMES, paper, reveal, rgba, typographyFooter } from '../core/draw';

// Activity as a line-printer job on tractor-feed paper. Everything is dots.
// dataTexture omitted — the piece IS machine text.

/** 5×7 bitmap glyphs (rows top→bottom, bits MSB left). */
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0e],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x01, 0x01, 0x01, 0x01, 0x11, 0x11, 0x0e],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x11, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0e, 0x11, 0x10, 0x0e, 0x01, 0x11, 0x0e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x0e, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  '#': [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ':': [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  '%': [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03],
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  '*': [0x00, 0x04, 0x15, 0x0e, 0x15, 0x04, 0x00],
};

type BodyRow = {
  i: number;
  addLen: number;
  delLen: number;
  isGoal: boolean;
  date?: string;
};

type MatrixLayout = {
  header: string[];
  rows: BodyRow[];
};

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function printText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x0: number,
  y0: number,
  pitch: number,
  r: number,
  color: string,
  misfire: number,
  rngFor: (key: string) => Rng,
  quality: number,
  rowKey: string,
): void {
  const cell = pitch * 6;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    const g = FONT[ch] ?? FONT[' '];
    const rng = rngFor(`dot:${rowKey}:${i}`);
    for (let row = 0; row < 7; row++) {
      const bits = g[row];
      for (let col = 0; col < 5; col++) {
        if (((bits >> (4 - col)) & 1) === 0) continue;
        if (quality < 0.5 && (row + col) % 2 === 1) continue;
        const roll = quality < 0.5 ? 0.5 : rng.next();
        if (roll < misfire) continue;
        const alpha = roll < misfire + 0.18 ? 0.45 : 0.8;
        drawDot(ctx, x0 + i * cell + col * pitch, y0 + row * pitch, r, color, alpha);
      }
    }
  }
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    dotSize: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    misfire: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    rows: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  },
  MatrixLayout
> = {
  engine: 'canvas2d',
  id: '18-dot-matrix',
  name: 'Dot Matrix',
  description: 'Your codebase as a tractor-feed printout: activity bars stamped one printer-dot at a time.',
  family: 'texture',
  room: 'texture',
  meaning: [
    { label: 'The medium', text: 'An impact printer, one dot at a time: sprockets, greenbar, worn ribbon.' },
    { label: 'Bars', text: 'Each row is a slice of time. Color A grows to the left of center; B prunes to the right.' },
    { label: 'Misfires', text: 'Some dots skip or print light: the ribbon was old. Deterministic per seed; change the seed for a fresher ribbon.' },
    { label: 'Sprockets & greenbar', text: 'The paper your codebase would have been printed on in 1982.' },
    { label: 'Dated rows', text: 'Biggest commits print their date at the end of the bar.' },
    { label: 'Animation', text: 'It prints. A carriage sweeps each row, then the head is gone and the job is done.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'ember-slate', options: PALETTE_NAMES },
    dotSize: { type: 'number', label: 'Dot size', default: 2.2, min: 1.6, max: 3.5, step: 0.1 },
    misfire: { type: 'number', label: 'Misfire', default: 0.06, min: 0, max: 0.2, step: 0.01 },
    rows: { type: 'number', label: 'Rows', default: 64, min: 40, max: 90, step: 1 },
  },
  prepare(data, params) {
    const nRows = Number.isFinite(params.rows) ? Math.max(1, Math.round(params.rows)) : 64;
    const buckets = Array.from({ length: nRows }, () => ({
      add: 0,
      del: 0,
      goalDate: undefined as string | undefined,
    }));
    for (const e of data.events) {
      if (e.kind !== 'file-change' && e.kind !== 'commit') continue;
      const i = Math.min(nRows - 1, Math.max(0, Math.floor(e.t01 * nRows)));
      buckets[i].add += e.additions;
      buckets[i].del += e.deletions;
      if (e.isGoal && !buckets[i].goalDate) buckets[i].goalDate = e.timestamp.slice(0, 10);
    }
    let maxBar = 1;
    for (const b of buckets) {
      maxBar = Math.max(maxBar, Math.log1p(b.add), Math.log1p(b.del));
    }
    const rows: BodyRow[] = buckets.map((b, i) => ({
      i,
      addLen: Math.log1p(b.add) / maxBar,
      delLen: Math.log1p(b.del) / maxBar,
      isGoal: Boolean(b.goalDate),
      date: b.goalDate,
    }));

    const header = [
      `REPO: ${data.meta.name.toUpperCase().slice(0, 28)}`,
      `COMMITS: ${data.meta.commitCount}`,
      `FIRST: ${data.meta.firstCommit.slice(0, 10)}`,
      `LAST: ${data.meta.lastCommit.slice(0, 10)}`,
    ];
    return { header, rows };
  },
  render(ctx, frame, params, prepared) {
    const pal = palette(params.palette);
    paper(ctx, frame, pal.paper);

    const tractor = 60;
    const pitch = 7;
    const r = params.dotSize;
    const marginX = tractor + 40;
    const top = 140;
    const bottom = frame.height - 180;
    const innerW = frame.width - marginX * 2;
    const textRowH = pitch * 8;

    // greenbar banding (every 4 text rows)
    for (let i = 0; ; i++) {
      const y = top + i * textRowH * 4;
      if (y >= bottom) break;
      if (i % 2 === 0) {
        ctx.fillStyle = rgba(pal.ink, 0.025);
        ctx.fillRect(tractor, y, frame.width - tractor * 2, textRowH * 4);
      }
    }

    // perforation + sprockets
    for (const side of [0, 1] as const) {
      const x = side === 0 ? tractor : frame.width - tractor;
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = rgba(pal.ink, 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 80);
      ctx.lineTo(x, frame.height - 100);
      ctx.stroke();
      ctx.setLineDash([]);
      const hx = side === 0 ? tractor / 2 : frame.width - tractor / 2;
      for (let y = 100; y < frame.height - 120; y += 26) {
        ctx.beginPath();
        ctx.arc(hx, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = pal.paper;
        ctx.fill();
        ctx.strokeStyle = rgba(pal.ink, 0.3);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    const { header, rows } = prepared;
    let yCursor = top + 10;

    for (let hi = 0; hi < header.length; hi++) {
      const appearAt = (hi / (header.length + rows.length + 1)) * 0.15;
      if (reveal(frame.t, appearAt, 0.04) <= 0) continue;
      printText(
        ctx,
        header[hi],
        marginX,
        yCursor,
        pitch,
        r,
        pal.ink,
        params.misfire,
        frame.rngFor,
        frame.quality,
        `h${hi}`,
      );
      yCursor += textRowH;
    }
    yCursor += pitch * 2;

    const bodyTop = yCursor;
    const bodyH = bottom - bodyTop - textRowH * 2;
    const rowPitch = Math.min(textRowH, bodyH / Math.max(1, rows.length));
    const barMax = innerW * 0.38;
    const mid = marginX + innerW / 2;

    let printHeadProp: { row: number; frac: number } | null = null;

    for (let i = 0; i < rows.length; i++) {
      if (frame.quality < 0.5 && i % 2 === 1) continue;
      const appearAt = 0.12 + (i / rows.length) * 0.82;
      const rev = reveal(frame.t, appearAt, 0.04);
      if (rev <= 0) continue;

      const row = rows[i];
      const y = bodyTop + i * rowPitch;

      drawDot(ctx, mid, y + pitch * 3, r * 0.6, pal.ink, 0.35);

      const addDots = Math.floor(row.addLen * (barMax / pitch));
      const delDots = Math.floor(row.delLen * (barMax / pitch));
      const drawnAdd = Math.floor(addDots * rev);
      const drawnDel = Math.floor(delDots * rev);

      for (let d = 0; d < drawnAdd; d++) {
        const roll = frame.quality < 0.5 ? 0.5 : frame.rngFor(`dot:${i}:a:${d}`).next();
        if (roll < params.misfire) continue;
        const alpha = roll < params.misfire + 0.18 ? 0.45 : 0.8;
        drawDot(ctx, mid - pitch * 2 - d * pitch, y + pitch * 3, r, pal.a, alpha);
      }
      for (let d = 0; d < drawnDel; d++) {
        const roll = frame.quality < 0.5 ? 0.5 : frame.rngFor(`dot:${i}:b:${d}`).next();
        if (roll < params.misfire) continue;
        const alpha = roll < params.misfire + 0.18 ? 0.45 : 0.8;
        drawDot(ctx, mid + pitch * 2 + d * pitch, y + pitch * 3, r, pal.b, alpha);
      }

      if (row.isGoal && row.date && rev > 0.85) {
        const labelX = mid + pitch * 2 + delDots * pitch + pitch * 3;
        printText(
          ctx,
          row.date,
          Math.min(labelX, frame.width - tractor - 120),
          y,
          pitch * 0.85,
          r * 0.85,
          pal.ink,
          params.misfire,
          frame.rngFor,
          frame.quality,
          `g${i}`,
        );
      }

      if (frame.t < 1 && rev > 0 && rev < 1) {
        printHeadProp = { row: i, frac: rev };
      }
    }

    if (printHeadProp && frame.t < 1) {
      const y = bodyTop + printHeadProp.row * rowPitch;
      ctx.fillStyle = rgba(pal.ink, 0.15);
      ctx.fillRect(marginX, y, innerW, rowPitch);
      const carriageX = marginX + printHeadProp.frac * (innerW - 40);
      ctx.fillStyle = rgba(pal.ink, 0.35);
      ctx.fillRect(carriageX, y, 40, rowPitch);
    }

    if (reveal(frame.t, 0.94, 0.05) > 0) {
      printText(
        ctx,
        '*** END OF JOB ***',
        marginX,
        bottom - textRowH,
        pitch,
        r,
        pal.ink,
        params.misfire,
        frame.rngFor,
        frame.quality,
        'end',
      );
    }

    grain(ctx, frame, frame.rngFor('grain'), 2200 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 18);
  },
};

export default recipe;
