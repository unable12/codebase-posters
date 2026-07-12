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

// Authors as planets on a vintage astronomy plate.

const BUCKETS = 64;

type Planet = {
  name: string;
  commits: number;
  churn: number;
  share: number;
  orbitIndex: number;
  firstT01: number;
  angle: number; // center of mass
  buckets: number[]; // activity per bucket
  a: number; // ellipse semi-major
  b: number;
  rot: number;
};

type OrbitsLayout = {
  planets: Planet[];
  othersActivity: number;
  othersBuckets: number[];
  cx: number;
  cy: number;
  outerR: number;
  step: number;
  solo: boolean;
};

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
    authors: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    tickLength: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    eccentricity: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
  },
  OrbitsLayout
> = {
  engine: 'canvas2d',
  id: '15b-orbits',
  name: 'Orbits',
  description: 'Authors as planets on a vintage astronomy plate: founders close in, rhythm written as ticks around each orbit.',
  family: 'flow',
  room: 'people',
  meaning: [
    { label: 'Planets', text: 'The people who built this. Size is total contribution.' },
    { label: 'Inner orbits', text: 'Founders sit closest to the sun: join order, not commit count.' },
    { label: 'Position on the dial', text: 'Where an author\'s work centered in time. 12 o\'clock is the first commit; clockwise is the repo\'s lifetime.' },
    { label: 'Ticks ticks', text: 'An author\'s working rhythm around their orbit: tick length is how busy that slice was.' },
    { label: 'The belt', text: 'Everyone beyond the top voices, as a dotted asteroid ring.' },
    { label: 'The sun', text: 'The repository itself.' },
    { label: 'One-planet system', text: 'A solo repo is proud of it: one world, no loneliness implied.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'violet-lime', options: PALETTE_NAMES },
    authors: { type: 'number', label: 'Authors', default: 5, min: 2, max: 7, step: 1 },
    tickLength: { type: 'number', label: 'Tick length', default: 1, min: 0.5, max: 2, step: 0.1 },
    eccentricity: { type: 'number', label: 'Eccentricity', default: 0.06, min: 0, max: 0.15, step: 0.01 },
  },
  prepare(data, params, seed) {
    const cx = 1500 / 2;
    const cy = 2000 / 2 - 30;
    const innerRadius = Math.min(1500, 2000) / 2 - 220;
    const nAuth = Math.min(Math.round(params.authors), data.authors.length);
    const top = data.authors.slice(0, Math.max(1, nAuth));
    const others = data.authors.slice(top.length);
    const solo = data.authors.length <= 1;

    // first-seen t01 per author
    const firstSeen = new Map<string, number>();
    const authorBuckets = new Map<string, number[]>();
    const authorChurn = new Map<string, number>();
    const massT = new Map<string, { w: number; tw: number }>();

    for (const a of data.authors) {
      authorBuckets.set(a.name, new Array(BUCKETS).fill(0));
      authorChurn.set(a.name, 0);
      massT.set(a.name, { w: 0, tw: 0 });
    }

    for (const e of data.events) {
      if (!firstSeen.has(e.author)) firstSeen.set(e.author, e.t01);
      else firstSeen.set(e.author, Math.min(firstSeen.get(e.author)!, e.t01));
      const bucks = authorBuckets.get(e.author);
      if (bucks) {
        const bi = Math.min(BUCKETS - 1, Math.max(0, Math.floor(e.t01 * BUCKETS)));
        bucks[bi] += e.magnitude || 0.01;
      }
      authorChurn.set(e.author, (authorChurn.get(e.author) ?? 0) + (e.magnitude || 0));
      const m = massT.get(e.author);
      if (m) {
        const w = e.magnitude || 0.01;
        m.w += w;
        m.tw += w * e.t01;
      }
    }

    const ordered = [...top].sort(
      (a, b) => (firstSeen.get(a.name) ?? 1) - (firstSeen.get(b.name) ?? 1),
    );

    const step = ordered.length <= 1 ? 0 : (innerRadius - 120) / Math.max(1, ordered.length - 1);

    const planets: Planet[] = ordered.map((a, i) => {
      const mass = massT.get(a.name)!;
      const tCom = mass.w > 0 ? mass.tw / mass.w : firstSeen.get(a.name) ?? 0.5;
      const angle = tCom * Math.PI * 2 - Math.PI / 2;
      const aR = 120 + i * (step || 0);
      let nh = 0;
      for (let c = 0; c < a.name.length; c++) nh = (nh * 31 + a.name.charCodeAt(c)) >>> 0;
      const rot = (((nh ^ seed) >>> 0) / 4294967296) * Math.PI * 2;
      return {
        name: a.name,
        commits: a.commits,
        churn: authorChurn.get(a.name) ?? 0,
        share: a.share,
        orbitIndex: i,
        firstT01: firstSeen.get(a.name) ?? 0,
        angle,
        buckets: authorBuckets.get(a.name) ?? new Array(BUCKETS).fill(0),
        a: aR,
        b: aR * (0.94 - params.eccentricity * 0.4),
        rot,
      };
    });

    const othersBuckets = new Array(BUCKETS).fill(0);
    let othersActivity = 0;
    for (const o of others) {
      othersActivity += o.commits;
      const bucks = authorBuckets.get(o.name);
      if (bucks) for (let i = 0; i < BUCKETS; i++) othersBuckets[i] += bucks[i];
    }

    const outerR = planets.length ? planets[planets.length - 1].a + 40 : 160;
    return {
      planets,
      othersActivity,
      othersBuckets,
      cx,
      cy,
      outerR: Math.min(outerR, innerRadius + 40),
      step: step || 80,
      solo,
    };
  },
  render(ctx, frame, params, prepared) {
    const pal = palette(params.palette);
    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.04);

    const { planets, othersActivity, othersBuckets, cx, cy, outerR, solo } = prepared;
    const borderRev = reveal(frame.t, 0, 0.12);

    // plate border + degree ticks
    if (borderRev > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2 * borderRev);
      ctx.strokeStyle = rgba(pal.ink, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();

      const tickCount = Math.floor(24 * borderRev);
      for (let i = 0; i < tickCount; i++) {
        const ang = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const major = i % 2 === 0;
        const r0 = outerR;
        const r1 = outerR + (major ? 10 : 5);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.strokeStyle = rgba(pal.ink, 0.2);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // sun
    const sunRev = reveal(frame.t, 0.05, 0.08);
    if (sunRev > 0) {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * 6, cy + Math.sin(ang) * 6);
        ctx.lineTo(cx + Math.cos(ang) * 14 * sunRev, cy + Math.sin(ang) * 14 * sunRev);
        ctx.strokeStyle = rgba(pal.ink, 0.55);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 5 * sunRev, 0, Math.PI * 2);
      ctx.fillStyle = rgba(pal.ink, 0.7);
      ctx.fill();
      ctx.fillStyle = rgba(pal.ink, 0.55);
      ctx.font = '13px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(frame.data.meta.name.slice(0, 22), cx, cy + 28);
      ctx.textAlign = 'left';
    }

    const ellipsePoint = (p: Planet, ang: number) => {
      // parametric then rotate by p.rot
      const x0 = Math.cos(ang) * p.a;
      const y0 = Math.sin(ang) * p.b;
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      return { x: cx + x0 * c - y0 * s, y: cy + x0 * s + y0 * c };
    };

    const nP = Math.max(1, planets.length);
    const labelPts: { x: number; y: number; name: string }[] = [];

    for (let pi = 0; pi < planets.length; pi++) {
      const p = planets[pi];
      const orbitAppear = 0.15 + (pi / nP) * 0.55;
      const orbitRev = reveal(frame.t, orbitAppear, 0.12);
      if (orbitRev <= 0) continue;

      // pen-draw orbit
      const samples = 96;
      const drawn = Math.max(2, Math.ceil(samples * orbitRev));
      const pts: { x: number; y: number }[] = [];
      for (let s = 0; s <= drawn; s++) {
        const ang = (s / samples) * Math.PI * 2;
        pts.push(ellipsePoint(p, ang));
      }
      sprayStroke(ctx, pts, pal.ink, frame.rngFor(`orbit:${p.name}`), {
        width: 1.2,
        density: 0.55,
        alpha: 0.07,
      });

      // observation ticks
      const maxB = Math.max(...p.buckets, 1e-9);
      for (let bi = 0; bi < BUCKETS; bi++) {
        const act = p.buckets[bi];
        if (act <= 0) continue;
        const t01 = (bi + 0.5) / BUCKETS;
        const tickRev = reveal(frame.t, t01 * 0.85 + 0.1, 0.04);
        if (tickRev <= 0) continue;
        const ang = (bi / BUCKETS) * Math.PI * 2;
        const base = ellipsePoint(p, ang);
        // radial direction from center
        const dx = base.x - cx;
        const dy = base.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const tickLen = (4 + (act / maxB) * 14) * params.tickLength * tickRev;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(base.x + (dx / len) * tickLen, base.y + (dy / len) * tickLen);
        ctx.strokeStyle = rgba(pal.ink, 0.45);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // planet when orbit completes
      const planetRev = reveal(frame.t, orbitAppear + 0.1, 0.08);
      if (planetRev > 0) {
        // map absolute dial angle onto the rotated ellipse
        const paramAng = p.angle - p.rot;
        const pos2 = ellipsePoint(p, paramAng);
        const color = lerpColor(pal.a, pal.b, nP <= 1 ? 0 : pi / (nP - 1));
        const pr = Math.min(22, 4 + Math.log1p(p.churn) * 3.2) * planetRev;
        ctx.beginPath();
        ctx.arc(pos2.x, pos2.y, pr, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85 * planetRev;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(pal.ink, 0.55);
        ctx.lineWidth = 1;
        ctx.stroke();

        // label with collision offset
        let lx = pos2.x + 12;
        let ly = pos2.y - 8;
        for (const other of labelPts) {
          if (Math.hypot(other.x - lx, other.y - ly) < 24) {
            ly += 18;
            lx += 6;
          }
        }
        labelPts.push({ x: lx, y: ly, name: p.name });
        if (planetRev > 0.6) {
          ctx.fillStyle = rgba(pal.ink, 0.65);
          ctx.font = '14px ui-monospace, Menlo, monospace';
          const label = p.name.length > 18 ? p.name.slice(0, 16) + '…' : p.name;
          ctx.fillText(label, lx, ly);
        }
      }
    }

    // asteroid belt
    if (othersActivity > 0 && planets.length >= 2) {
      const beltRev = reveal(frame.t, 0.9, 0.08);
      if (beltRev > 0) {
        const rIn = planets[planets.length - 2].a;
        const rOut = planets[planets.length - 1].a;
        const rBelt = (rIn + rOut) / 2;
        const dens = Math.min(120, 20 + othersActivity);
        const maxOB = Math.max(...othersBuckets, 1);
        for (let i = 0; i < dens * beltRev; i++) {
          const rng = frame.rngFor(`belt:${i}`);
          const ang = rng.next() * Math.PI * 2;
          const rr = rBelt + (rng.next() - 0.5) * (rOut - rIn) * 0.6;
          const bi = Math.floor((ang / (Math.PI * 2)) * BUCKETS) % BUCKETS;
          if (othersBuckets[bi] / maxOB < 0.05 && rng.next() > 0.3) continue;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = rgba(pal.ink, 0.35);
          ctx.fill();
        }
      }
    }

    if (solo) {
      // meaning lives in the placard; subtle caption near footer band
      const r = reveal(frame.t, 0.92, 0.05);
      if (r > 0) {
        ctx.fillStyle = rgba(pal.ink, 0.35 * r);
        ctx.font = '13px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('a one-planet system', cx, cy + outerR + 36);
        ctx.textAlign = 'left';
      }
    }

    grain(ctx, frame, frame.rngFor('grain'), 2800 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 19);
  },
};

export default recipe;
