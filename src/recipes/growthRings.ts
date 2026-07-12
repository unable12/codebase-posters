import type { CanvasRecipe } from '../core/types';
import {
  dataTexture,
  grain,
  palette,
  PALETTE_NAMES,
  paper,
  reveal,
  rgba,
  sprayStroke,
  typographyFooter,
} from '../core/draw';

// The repo as a tree cross-section: one ring per calendar year, knots at the
// biggest commits. Read it like wood.

const WEEKS = 52;
const PITH = 40;

type YearRing = {
  year: number;
  innerR: number;
  outerR: number;
  thickness: number;
  weekly: number[]; // length 52, normalized activity
  addShare: number; // 0..1 additions-dominant
  partial: boolean;
  weekStart: number; // inclusive, for partial rings
  weekEnd: number; // inclusive
};

type Knot = {
  year: number;
  yearIndex: number;
  angle: number;
  magnitude: number;
  date: string;
  r: number;
};

type RingsLayout = {
  rings: YearRing[];
  knots: Knot[];
  cx: number;
  cy: number;
  maxR: number;
};

function weekOfYear(iso: string): number {
  const d = new Date(iso);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const day = Math.floor((d.getTime() - start.getTime()) / 86400000);
  return Math.min(51, Math.max(0, Math.floor(day / 7)));
}

function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

function smooth52(series: number[]): number[] {
  const k = [0.1, 0.2, 0.4, 0.2, 0.1];
  return series.map((_, i) =>
    k.reduce((s, w, j) => s + w * (series[(i + j - 2 + WEEKS) % WEEKS] ?? 0), 0),
  );
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    grainDensity: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    wobble: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    knots: { type: 'boolean'; label: string; default: boolean };
  },
  RingsLayout
> = {
  engine: 'canvas2d',
  id: '04-growth-rings',
  name: 'Growth Rings',
  description: 'The repo as a tree cross-section: one ring per year, knots where the biggest commits scarred the wood.',
  family: 'timeline',
  room: 'time',
  meaning: [
    { label: 'Rings', text: 'Count them: each ring is one calendar year of the project\'s life.' },
    { label: 'Thick rings', text: 'A heavy year (lots of churn) lays down a fat band of wood.' },
    { label: 'Wavy rings', text: 'Bursty years wobble: weeks of frenzy pull the grain out, quiet weeks pull it in.' },
    { label: 'Knots', text: 'The commits big enough to leave a scar. Dates sit beside them like a dendrochronologist\'s notes.' },
    { label: 'Tint', text: 'A wash of A means the year mostly grew; B means it mostly pruned.' },
    { label: 'The crack', text: 'The hairline at 12 o\'clock is the calendar axis. Year labels step along it.' },
    { label: 'Sapling', text: 'A repo younger than a year is one partial arc around the pith: honest wood, not a full trunk.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'rose-forest', options: PALETTE_NAMES },
    grainDensity: { type: 'number', label: 'Grain density', default: 1, min: 0.5, max: 2, step: 0.1 },
    wobble: { type: 'number', label: 'Wobble', default: 0.7, min: 0, max: 1, step: 0.05 },
    knots: { type: 'boolean', label: 'Knots', default: true },
  },
  prepare(data) {
    const cx = 1500 / 2;
    const cy = 2000 / 2 - 40;
    const maxR = Math.min(1500, 2000) / 2 - 210;

    const fileEvents = data.events.filter((e) => e.kind === 'file-change');
    const byYear = new Map<number, typeof fileEvents>();
    for (const e of fileEvents) {
      const y = yearOf(e.timestamp);
      const list = byYear.get(y) ?? [];
      list.push(e);
      byYear.set(y, list);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    if (years.length === 0) {
      return { rings: [], knots: [], cx, cy, maxR };
    }

    const yearStats = years.map((year) => {
      const evs = byYear.get(year)!;
      const weekly = new Array(WEEKS).fill(0);
      let churn = 0;
      let adds = 0;
      let dels = 0;
      let weekMin = WEEKS;
      let weekMax = 0;
      for (const e of evs) {
        const w = weekOfYear(e.timestamp);
        weekly[w] += e.magnitude;
        churn += e.magnitude;
        adds += e.additions;
        dels += e.deletions;
        weekMin = Math.min(weekMin, w);
        weekMax = Math.max(weekMax, w);
      }
      return {
        year,
        weekly: smooth52(weekly),
        churn,
        addShare: adds + dels > 0 ? adds / (adds + dels) : 0.5,
        weekStart: weekMin,
        weekEnd: weekMax,
      };
    });

    const thicknesses = yearStats.map((y) => 18 + Math.log1p(y.churn) * 14);
    const sumTh = thicknesses.reduce((s, t) => s + t, 0);
    const scale = sumTh > 0 ? (maxR - PITH) / sumTh : 1;

    const rings: YearRing[] = [];
    let r = PITH;
    for (let i = 0; i < yearStats.length; i++) {
      const ys = yearStats[i];
      const th = thicknesses[i] * scale;
      const maxW = Math.max(...ys.weekly, 1e-9);
      const weekly = ys.weekly.map((v) => v / maxW);
      rings.push({
        year: ys.year,
        innerR: r,
        outerR: r + th,
        thickness: th,
        weekly,
        addShare: ys.addShare,
        partial: yearStats.length === 1,
        weekStart: ys.weekStart,
        weekEnd: ys.weekEnd,
      });
      r += th;
    }

    const goals = data.events
      .filter((e) => e.isGoal)
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, 8);

    const knots: Knot[] = goals.map((g) => {
      const year = yearOf(g.timestamp);
      const yearIndex = years.indexOf(year);
      const ring = rings[yearIndex] ?? rings[rings.length - 1];
      const week = weekOfYear(g.timestamp);
      const angle = (week / WEEKS) * Math.PI * 2 - Math.PI / 2; // 12 o'clock start
      return {
        year,
        yearIndex: Math.max(0, yearIndex),
        angle,
        magnitude: g.magnitude,
        date: g.timestamp.slice(0, 10),
        r: ring ? (ring.innerR + ring.outerR) / 2 : PITH + 20,
      };
    });

    return { rings, knots, cx, cy, maxR: r };
  },
  render(ctx, frame, params, prepared) {
    const pal = palette(params.palette);
    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.04);

    const { rings, knots, cx, cy } = prepared;
    if (rings.length === 0) {
      grain(ctx, frame, frame.rngFor('grain'), 2800 * frame.quality);
      typographyFooter(ctx, frame, pal.ink, 4);
      return;
    }

    // pith
    ctx.beginPath();
    ctx.arc(cx, cy, PITH * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = rgba(pal.ink, 0.08);
    ctx.fill();

    const nYears = Math.max(1, rings.length);

    for (let yi = 0; yi < rings.length; yi++) {
      const ring = rings[yi];
      const appearAt = (yi / nYears) * 0.9;
      const rev = reveal(frame.t, appearAt, 0.12);
      if (rev <= 0) continue;

      const weekA = ring.partial ? ring.weekStart : 0;
      const weekB = ring.partial ? ring.weekEnd : WEEKS - 1;
      const spanWeeks = Math.max(1, weekB - weekA + 1);
      const samples = Math.max(48, Math.floor(spanWeeks * 6));
      const drawFrac = rev;

      const radiusAt = (weekF: number, boundary: number) => {
        // boundary 0..1 within thickness
        const wi = Math.floor(weekF) % WEEKS;
        const act = ring.weekly[wi] ?? 0;
        const base = ring.innerR + boundary * ring.thickness;
        const wob = params.wobble * ring.thickness * 0.25 * (act - 0.5) * 2;
        // low-frequency organic noise
        const ang = (weekF / WEEKS) * Math.PI * 2;
        const lf = Math.sin(ang * 3 + yi * 1.7) * 0.35 + Math.sin(ang * 7 + yi) * 0.15;
        let r = base + wob + lf * params.wobble * ring.thickness * 0.12;

        if (params.knots) {
          for (const kn of knots) {
            if (kn.yearIndex !== yi) continue;
            let dAng = Math.abs(ang - (kn.angle + Math.PI / 2));
            dAng = Math.min(dAng, Math.PI * 2 - dAng);
            const sigma = (18 * Math.PI) / 180;
            if (dAng < sigma * 3) {
              const bump = Math.exp(-(dAng * dAng) / (2 * sigma * sigma));
              r += bump * ring.thickness * 0.35 * (boundary > 0.5 ? 1 : -0.6);
            }
          }
        }
        return r;
      };

      // year tint wash
      const tint = ring.addShare >= 0.5 ? pal.a : pal.b;
      ctx.beginPath();
      const washSamples = samples;
      for (let s = 0; s <= washSamples * drawFrac; s++) {
        const u = s / washSamples;
        const weekF = weekA + u * (weekB - weekA);
        const ang = (weekF / WEEKS) * Math.PI * 2 - Math.PI / 2;
        const r0 = radiusAt(weekF, 0.15);
        const x = cx + Math.cos(ang) * r0;
        const y = cy + Math.sin(ang) * r0;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let s = Math.floor(washSamples * drawFrac); s >= 0; s--) {
        const u = s / washSamples;
        const weekF = weekA + u * (weekB - weekA);
        const ang = (weekF / WEEKS) * Math.PI * 2 - Math.PI / 2;
        const r1 = radiusAt(weekF, 0.85);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      }
      ctx.closePath();
      ctx.fillStyle = rgba(tint, 0.05);
      ctx.fill();

      // concentric grain boundaries
      const boundaries = [0.15, 0.4, 0.65, 0.9].slice(0, Math.max(3, Math.min(5, Math.round(3 + params.grainDensity))));
      for (const b of boundaries) {
        const pts: { x: number; y: number }[] = [];
        for (let s = 0; s <= samples * drawFrac; s++) {
          const u = s / samples;
          const weekF = weekA + u * (weekB - weekA);
          const ang = (weekF / WEEKS) * Math.PI * 2 - Math.PI / 2;
          const rr = radiusAt(weekF, b);
          pts.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr });
        }
        if (pts.length < 2) continue;
        sprayStroke(ctx, pts, pal.ink, frame.rngFor(`ring:${yi}:${b}`), {
          width: 1.5 + b,
          density: 0.55,
          alpha: 0.06 + b * 0.04,
        });
      }

      // fine wood grain arcs
      if (frame.quality >= 0.5) {
        const step = Math.max(4, Math.round(6 / params.grainDensity));
        for (let gr = ring.innerR + step; gr < ring.outerR - 2; gr += step) {
          const b = (gr - ring.innerR) / ring.thickness;
          const rng = frame.rngFor(`grain-arc:${yi}:${Math.round(gr)}`);
          const pts: { x: number; y: number }[] = [];
          for (let s = 0; s <= samples * drawFrac; s++) {
            if (rng.next() < 0.35) {
              if (pts.length >= 2) {
                sprayStroke(ctx, pts, pal.ink, frame.rngFor(`gs:${yi}:${gr}:${s}`), {
                  width: 0.8,
                  density: 0.4,
                  alpha: 0.04,
                });
              }
              pts.length = 0;
              continue;
            }
            const u = s / samples;
            const weekF = weekA + u * (weekB - weekA);
            const ang = (weekF / WEEKS) * Math.PI * 2 - Math.PI / 2;
            const rr = radiusAt(weekF, b);
            pts.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr });
          }
          if (pts.length >= 2) {
            sprayStroke(ctx, pts, pal.ink, frame.rngFor(`gs:${yi}:${gr}:end`), {
              width: 0.8,
              density: 0.4,
              alpha: 0.04,
            });
          }
        }
      }

      // year label on dendro axis when ring closes
      if (rev >= 0.95) {
        const labelR = (ring.innerR + ring.outerR) / 2;
        ctx.fillStyle = rgba(pal.ink, 0.5);
        ctx.font = '13px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(ring.year), cx, cy - labelR - 4);
        ctx.textAlign = 'left';
      }
    }

    // radial crack at 12 o'clock
    ctx.beginPath();
    ctx.moveTo(cx, cy - PITH * 0.4);
    ctx.lineTo(cx, cy - rings[rings.length - 1].outerR - 8);
    ctx.strokeStyle = rgba(pal.ink, 0.25);
    ctx.lineWidth = 0.75;
    ctx.stroke();

    // knots
    if (params.knots) {
      for (const kn of knots) {
        const yearDone = reveal(frame.t, (kn.yearIndex / nYears) * 0.9 + 0.08, 0.08);
        if (yearDone <= 0) continue;
        const kx = cx + Math.cos(kn.angle) * kn.r;
        const ky = cy + Math.sin(kn.angle) * kn.r;
        const s = (4 + kn.magnitude * 10) * yearDone;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(kx, ky, s * (1 - i * 0.28), s * (0.7 - i * 0.15), kn.angle, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(pal.ink, 0.5 * yearDone);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        if (yearDone > 0.7) {
          const lx = cx + Math.cos(kn.angle) * (kn.r + 28);
          const ly = cy + Math.sin(kn.angle) * (kn.r + 28);
          ctx.fillStyle = rgba(pal.ink, 0.55);
          ctx.font = '15px ui-monospace, Menlo, monospace';
          ctx.fillText(kn.date, lx - 20, ly);
        }
      }
    }

    grain(ctx, frame, frame.rngFor('grain'), 2800 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 4);
  },
};

export default recipe;
