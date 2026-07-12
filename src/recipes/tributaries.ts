import type { CanvasRecipe } from '../core/types';
import {
  dataTexture,
  grain,
  hexToRgb,
  palette,
  PALETTE_NAMES,
  paper,
  reveal,
  rgba,
  sprayStroke,
  typographyFooter,
} from '../core/draw';

// Contributors as a braided river. One ribbon per author; width = share of
// activity. Threads swell and thin — they don't cross or vanish.

const S = 96;
const KERNEL = [0.06, 0.24, 0.4, 0.24, 0.06];

type RibbonRow = { y: number; xLeft: number; xRight: number };
type Ribbon = {
  name: string;
  color: string;
  rows: RibbonRow[];
  labelSample: number;
  maxWidth: number;
};

function smooth(series: number[]): number[] {
  return series.map((_, i) =>
    KERNEL.reduce((s, k, j) => s + k * (series[Math.min(S - 1, Math.max(0, i + j - 2))] ?? 0), 0),
  );
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    voices: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    sway: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    smoothing: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  },
  { ribbons: (Ribbon & { hideLabel?: boolean })[]; margin: number; innerW: number; top: number; bottom: number }
> = {
  engine: 'canvas2d',
  id: '15-tributaries',
  name: 'Tributaries',
  description: 'Contributors as a braided river — each voice a ribbon, width the share of the work.',
  family: 'flow',
  room: 'people',
  meaning: [
    { label: 'The river', text: 'Time flows top to bottom. The braid is the whole project\'s authorship over its life.' },
    { label: 'One color per person', text: 'Each ribbon is one author. Colors walk from the palette\'s A ink to its B ink.' },
    { label: 'Width = share', text: 'Where a ribbon fattens, that person was carrying more of the work right then.' },
    { label: 'The quiet thread', text: 'Everyone beyond the top voices merges into one thin ink thread — still present, not named.' },
    { label: 'Thin ≠ gone', text: 'Ribbons never break. Quiet stretches thin to a hair and wait.' },
    { label: 'Margin dots', text: 'Biggest commits sit left of the braid with their dates — landmarks beside the current.' },
    { label: 'Animation', text: 'The river fills downward, like water finding its bed.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'clay-sea', options: PALETTE_NAMES },
    voices: { type: 'number', label: 'Voices', default: 5, min: 2, max: 8, step: 1 },
    sway: { type: 'number', label: 'Sway', default: 0.5, min: 0, max: 1, step: 0.05 },
    smoothing: { type: 'number', label: 'Smoothing', default: 2, min: 1, max: 4, step: 1 },
  },
  prepare(data, params) {
    const margin = 150;
    const innerW = 1500 - margin * 2;
    const top = 160;
    const bottom = 2000 - 160;
    const height = bottom - top;

    const topN = Math.max(2, Math.min(8, Math.round(params.voices)));
    const named = data.authors.slice(0, topN);
    const rest = data.authors.slice(topN);
    const roster: { name: string; isOthers: boolean }[] = named.map((a) => ({
      name: a.name,
      isOthers: false,
    }));
    if (rest.length > 0) roster.push({ name: 'others', isOthers: true });

    const series: number[][] = roster.map(() => new Array(S).fill(0));
    const events = data.events.filter((e) => e.kind === 'file-change' || e.kind === 'commit');
    for (const e of events) {
      const author = e.author ?? '';
      let ri = roster.findIndex((r) => !r.isOthers && r.name === author);
      if (ri < 0) ri = roster.findIndex((r) => r.isOthers);
      if (ri < 0) continue;
      const center = Math.min(S - 1, Math.max(0, Math.floor(e.t01 * S)));
      const mag = e.magnitude || 0.05;
      for (let d = -3; d <= 3; d++) {
        const j = center + d;
        if (j < 0 || j >= S) continue;
        const g = Math.exp(-(d * d) / (2 * 1.5 * 1.5));
        series[ri][j] += mag * g;
      }
    }

    let smoothed = series.map((s) => {
      let out = s;
      for (let k = 0; k < params.smoothing; k++) out = smooth(out);
      return out;
    });
    for (const s of smoothed) {
      const mx = Math.max(...s, 1e-9);
      const floor = 0.06 * mx;
      for (let i = 0; i < S; i++) s[i] = Math.max(s[i], floor);
    }

    // inside-out ThemeRiver order: largest total activity innermost
    const totals = smoothed.map((s) => s.reduce((a, b) => a + b, 0));
    const order = roster.map((_, i) => i).sort((a, b) => totals[b] - totals[a]);
    // reorder: largest in middle — [..., 3,1,0,2,4]
    const arranged: number[] = [];
    order.forEach((idx, rank) => {
      if (rank % 2 === 0) arranged.push(idx);
      else arranged.unshift(idx);
    });

    const widths = new Array(S).fill(0).map((_, s) => smoothed.reduce((sum, row) => sum + row[s], 0));
    const maxW = Math.max(...widths, 1e-9);
    const targetMax = innerW * 0.72;

    const pal = palette(params.palette);
    const namedCount = arranged.filter((j) => !roster[j].isOthers).length;
    let namedRank = 0;
    const ribbons: (Ribbon & { hideLabel?: boolean })[] = arranged.map((ri, stackI) => {
      const r = roster[ri];
      let color = pal.ink;
      if (!r.isOthers) {
        const t = namedCount <= 1 ? 0 : namedRank / Math.max(1, namedCount - 1);
        color = lerpColor(pal.a, pal.b, t);
        namedRank++;
      }
      const rows: RibbonRow[] = [];
      let maxWidth = 0;
      let labelSample = 0;
      for (let s = 0; s < S; s++) {
        const y = top + (s / (S - 1)) * height;
        const sway =
          Math.sin((s / S) * Math.PI * 2) * 40 * params.sway +
          Math.sin((s / S) * Math.PI * 5.3) * 18 * params.sway;
        const cx = 750 + sway;
        let leftOf = 0;
        for (let k = 0; k < stackI; k++) leftOf += smoothed[arranged[k]][s];
        const scale = targetMax / maxW;
        const w = smoothed[ri][s] * scale;
        const x0 = cx - (widths[s] * scale) / 2 + leftOf * scale;
        rows.push({ y, xLeft: x0, xRight: x0 + w });
        if (w > maxWidth) {
          maxWidth = w;
          labelSample = s;
        }
      }
      return {
        name: r.name,
        color,
        rows,
        labelSample,
        maxWidth,
        hideLabel: r.isOthers,
      };
    });

    // resolve label collisions: drop narrower if within 24px vertically
    const labeled = ribbons
      .filter((r) => !r.hideLabel)
      .map((r) => ({ ribbon: r, y: r.rows[r.labelSample].y }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < labeled.length; i++) {
      if (Math.abs(labeled[i].y - labeled[i - 1].y) < 24) {
        if (labeled[i].ribbon.maxWidth < labeled[i - 1].ribbon.maxWidth) {
          labeled[i].ribbon.hideLabel = true;
        } else {
          labeled[i - 1].ribbon.hideLabel = true;
        }
      }
    }

    return { ribbons, margin, innerW, top, bottom };
  },
  render(ctx, frame, params, prepared) {
    const pal = palette(params.palette);
    const { ribbons, top, bottom } = prepared;
    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.045);
    const height = bottom - top;

    for (const ribbon of ribbons) {
      const isOthers = ribbon.name === 'others';
      const baseAlpha = isOthers ? 0.18 : 1;
      for (let s = 0; s < ribbon.rows.length; s++) {
        const row = ribbon.rows[s];
        const rowT01 = (row.y - top) / height;
        const appear = reveal(frame.t, rowT01 * 0.92, 0.06);
        if (appear <= 0) continue;

        // soft interior fill — horizontal spray every ~14px
        if (s % Math.max(1, Math.round(14 / (height / S))) === 0 || s === ribbon.rows.length - 1) {
          const rng = frame.rngFor(`rib:${ribbon.name}:${s}`);
          const n = Math.max(2, Math.floor((row.xRight - row.xLeft) * 0.35 * frame.quality));
          ctx.fillStyle = rgba(ribbon.color, 0.05 * baseAlpha * appear);
          for (let i = 0; i < n; i++) {
            const x = row.xLeft + rng.next() * (row.xRight - row.xLeft);
            ctx.fillRect(x, row.y, 1.4, 1.4);
          }
        }
      }

      // boundary spray
      const leftPts = ribbon.rows
        .filter((row) => reveal(frame.t, ((row.y - top) / height) * 0.92, 0.06) > 0.2)
        .map((row) => ({ x: row.xLeft, y: row.y }));
      const rightPts = ribbon.rows
        .filter((row) => reveal(frame.t, ((row.y - top) / height) * 0.92, 0.06) > 0.2)
        .map((row) => ({ x: row.xRight, y: row.y }));
      sprayStroke(ctx, leftPts, ribbon.color, frame.rngFor(`edgeL:${ribbon.name}`), {
        width: 5,
        density: 1.8 * frame.quality,
        alpha: 0.07 * baseAlpha,
      });
      sprayStroke(ctx, rightPts, ribbon.color, frame.rngFor(`edgeR:${ribbon.name}`), {
        width: 5,
        density: 1.8 * frame.quality,
        alpha: 0.07 * baseAlpha,
      });

      const hide = ribbon.hideLabel;
      if (!hide && ribbon.name !== 'others') {
        const anchor = ribbon.rows[ribbon.labelSample];
        const rowT01 = (anchor.y - top) / height;
        const a = reveal(frame.t, rowT01 * 0.92 + 0.02, 0.08);
        if (a > 0) {
          const label = ribbon.name.toLowerCase().slice(0, 14);
          ctx.save();
          ctx.globalAlpha = a;
          ctx.fillStyle = pal.ink;
          ctx.font = '15px ui-monospace, Menlo, monospace';
          const tw = ctx.measureText(label).width;
          const cx = (anchor.xLeft + anchor.xRight) / 2;
          ctx.fillText(label, cx - tw / 2, anchor.y + 5);
          ctx.restore();
        }
      }
    }

    // goal dots in the left margin
    const goals = frame.data.events
      .filter((e) => e.isGoal)
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, 10);
    for (const g of goals) {
      const y = top + g.t01 * height;
      const a = reveal(frame.t, g.t01 * 0.92, 0.08);
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.arc(110, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '13px ui-monospace, Menlo, monospace';
      ctx.fillText(g.timestamp.slice(5, 10), 40, y + 4);
      ctx.restore();
    }

    grain(ctx, frame, frame.rngFor('grain'), 3000 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 15);
  },
};

export default recipe;
