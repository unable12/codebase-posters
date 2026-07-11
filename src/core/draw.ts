import type { Frame } from './types';
import type { Rng } from './rng';

export interface Palette {
  name: string;
  paper: string;
  a: string; // "home" force
  b: string; // "away" force
  ink: string; // typography
}

export const PALETTES: Palette[] = [
  { name: 'cobalt-mint', paper: '#f6f4ec', a: '#2a4fd7', b: '#2fbf9a', ink: '#1c1c1c' },
  { name: 'clay-sea', paper: '#f5efe4', a: '#c4502e', b: '#22668c', ink: '#221d18' },
  { name: 'violet-lime', paper: '#f4f2ee', a: '#5b3fd4', b: '#8bc34a', ink: '#1f1b2e' },
  { name: 'ember-slate', paper: '#f2ede6', a: '#d94f30', b: '#3f4a5a', ink: '#20242b' },
  { name: 'rose-forest', paper: '#f7f1ea', a: '#c2405f', b: '#2e6b4f', ink: '#231a1d' },
  { name: 'ochre-indigo', paper: '#f7f2e7', a: '#d99a2b', b: '#3a3f8f', ink: '#26221a' },
  { name: 'coral-teal', paper: '#f5f1ea', a: '#e8604c', b: '#177e89', ink: '#22201d' },
];

export function palette(name: string): Palette {
  return PALETTES.find((p) => p.name === name) ?? PALETTES[0];
}

export const PALETTE_NAMES = PALETTES.map((p) => p.name);

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Smoothstep envelope for animated appearance: 0 before appearAt, eases to 1
 * over `dur` of the timeline. Multiply alpha/size by it so elements grow in
 * softly instead of popping. Always 1 at t=1 so the final poster is identical.
 */
export function reveal(t: number, appearAt: number, dur = 0.05): number {
  if (t >= 1) return 1;
  const u = (t - appearAt) / dur;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}

/** Fill the poster with paper color. */
export function paper(ctx: CanvasRenderingContext2D, frame: Frame, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, frame.width, frame.height);
}

/**
 * Raw dataset text tiled faintly across the poster — the data as watermark.
 * Deterministic (uses its own rng stream from frame.rng).
 */
export function dataTexture(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  inkColor: string,
  alpha = 0.08,
): void {
  const { data } = frame;
  const lines: string[] = [];
  const d = data.totals;
  lines.push(`${data.meta.name.toUpperCase()}  ${data.meta.commitCount} COMMITS`);
  lines.push(`ADDITIONS ${d.additions}  DELETIONS ${d.deletions}`);
  lines.push(`FILES TOUCHED ${d.filesTouched}  AVG ${d.avgFilesPerCommit.toFixed(1)} / COMMIT`);
  for (const a of data.authors.slice(0, 3))
    lines.push(`${a.name.toUpperCase()} ${a.commits} COMMITS  +${a.additions} -${a.deletions}`);
  for (const l of data.languages.slice(0, 5))
    lines.push(`${(l.ext || 'NONE').toUpperCase()} ${l.files} FILES  ${(l.share * 100).toFixed(1)}%`);
  for (const e of data.events.filter((e) => e.isGoal).slice(0, 8))
    lines.push(`${e.timestamp.slice(0, 10)}  ${String(e.subject ?? '').toUpperCase().slice(0, 40)}`);

  ctx.save();
  ctx.fillStyle = rgba(inkColor, alpha);
  ctx.font = '13px ui-monospace, Menlo, monospace';
  const lineH = 26;
  const colW = 340;
  let i = 0;
  for (let y = 40; y < frame.height - 20; y += lineH) {
    for (let x = 40; x < frame.width - 60; x += colW) {
      ctx.fillText(lines[i % lines.length], x, y);
      i++;
    }
  }
  ctx.restore();
}

/** Subtle paper grain: sparse dark/light specks. Deterministic via rng. */
export function grain(ctx: CanvasRenderingContext2D, frame: Frame, rng: Rng, amount = 3000): void {
  ctx.save();
  for (let i = 0; i < amount; i++) {
    const x = rng.next() * frame.width;
    const y = rng.next() * frame.height;
    ctx.fillStyle = rng.next() > 0.5 ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.restore();
}

/**
 * A soft "spray brush" stroke along a polyline: many low-alpha dots scattered
 * around the path. This is the Canvas2D stand-in for p5.brush.
 */
export function sprayStroke(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  color: string,
  rng: Rng,
  opts: { width?: number; density?: number; alpha?: number } = {},
): void {
  const { width = 8, density = 2.2, alpha = 0.06 } = opts;
  if (points.length < 2) return;
  ctx.save();
  ctx.fillStyle = rgba(color, alpha);
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const segLen = Math.hypot(dx, dy);
    const n = Math.max(1, Math.floor(segLen * density));
    for (let j = 0; j < n; j++) {
      const u = j / n;
      const jx = rng.gauss() * width;
      const jy = rng.gauss() * width;
      const r = 0.6 + rng.next() * 1.6;
      ctx.fillRect(p0.x + dx * u + jx, p0.y + dy * u + jy, r, r);
    }
  }
  ctx.restore();
}

/**
 * Poster footer: repo name, stat, index box — consistent across recipes.
 * Fades in during the final moments of the animation: the signature on the
 * finished piece.
 */
export function typographyFooter(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  inkColor: string,
  posterNo = 1,
): void {
  const { data } = frame;
  const signature = reveal(frame.t, 0.94, 0.06);
  if (signature <= 0) return;
  const y = frame.height - 90;
  ctx.save();
  ctx.globalAlpha = signature;
  ctx.fillStyle = inkColor;
  ctx.font = '600 22px ui-monospace, Menlo, monospace';
  ctx.fillText(data.meta.name.toUpperCase(), frame.width - 560, y);
  ctx.font = '22px ui-monospace, Menlo, monospace';
  ctx.fillText(`${data.meta.commitCount}`, frame.width - 280, y);
  ctx.fillText(`+${data.totals.additions} -${data.totals.deletions}`, frame.width - 560, y + 32);

  // index/date box
  const bx = frame.width - 210;
  const by = y - 24;
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, 170, 64);
  ctx.font = '20px ui-monospace, Menlo, monospace';
  ctx.fillText(`#${String(posterNo).padStart(2, '0')}`, bx + 12, by + 28);
  ctx.fillText(data.meta.lastCommit.slice(0, 10), bx + 12, by + 54);
  ctx.beginPath();
  ctx.moveTo(bx + 70, by);
  ctx.lineTo(bx + 70, by + 32);
  ctx.moveTo(bx, by + 32);
  ctx.lineTo(bx + 170, by + 32);
  ctx.stroke();

  // maker's mark: bottom-left, whisper-quiet, arrives with the signature
  ctx.font = '15px ui-monospace, Menlo, monospace';
  ctx.fillStyle = rgba(inkColor, 0.35);
  ctx.fillText('made with codebase-posters', 130, y + 32);

  ctx.restore();
}
