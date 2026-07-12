import type { CanvasRecipe } from '../core/types';
import {
  dataTexture,
  grain,
  palette,
  PALETTE_NAMES,
  paper,
  reveal,
  rgba,
  typographyFooter,
} from '../core/draw';

// Commit density as terrain: contour lines, dated summits, a quiet sea.

const GW = 120;
const GH = 160;

type ContourSeg = { level: number; pts: { x: number; y: number }[] };
type Summit = { gx: number; gy: number; date: string; value: number };

type TopoLayout = {
  field: Float64Array;
  contours: ContourSeg[];
  summits: Summit[];
  commitsPerCm: number;
  levels: number;
};

function boxBlur(src: Float64Array, w: number, h: number, passes: number): Float64Array {
  let a = src;
  let b = new Float64Array(w * h);
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += a[y * w + xx];
          n++;
        }
        b[y * w + x] = s / n;
      }
    }
    // vertical
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          s += b[yy * w + x];
          n++;
        }
        a[y * w + x] = s / n;
      }
    }
  }
  return a;
}

/** Marching squares — emit unjoined edge segments (acceptable visually). */
function marchingSquares(field: Float64Array, w: number, h: number, level: number, levelIndex: number): ContourSeg[] {
  const segs: ContourSeg[] = [];
  const v = (x: number, y: number) => field[y * w + x] ?? 0;
  const lerp = (a: number, b: number, va: number, vb: number) => {
    if (Math.abs(vb - va) < 1e-9) return 0.5;
    return (level - va) / (vb - va);
  };

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const v00 = v(x, y);
      const v10 = v(x + 1, y);
      const v11 = v(x + 1, y + 1);
      const v01 = v(x, y + 1);
      let idx = 0;
      if (v00 >= level) idx |= 1;
      if (v10 >= level) idx |= 2;
      if (v11 >= level) idx |= 4;
      if (v01 >= level) idx |= 8;
      if (idx === 0 || idx === 15) continue;

      const top = { x: x + lerp(0, 1, v00, v10), y: y + 0 };
      const right = { x: x + 1, y: y + lerp(0, 1, v10, v11) };
      const bottom = { x: x + lerp(0, 1, v01, v11), y: y + 1 };
      const left = { x: x + 0, y: y + lerp(0, 1, v00, v01) };

      const edges: [{ x: number; y: number }, { x: number; y: number }][] = [];
      // standard cases
      switch (idx) {
        case 1:
        case 14:
          edges.push([left, top]);
          break;
        case 2:
        case 13:
          edges.push([top, right]);
          break;
        case 3:
        case 12:
          edges.push([left, right]);
          break;
        case 4:
        case 11:
          edges.push([right, bottom]);
          break;
        case 5:
          edges.push([left, top], [right, bottom]);
          break;
        case 6:
        case 9:
          edges.push([top, bottom]);
          break;
        case 7:
        case 8:
          edges.push([left, bottom]);
          break;
        case 10:
          edges.push([top, right], [left, bottom]);
          break;
        default:
          break;
      }
      for (const [a, b] of edges) {
        segs.push({ level: levelIndex, pts: [a, b] });
      }
    }
  }
  return segs;
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    levels: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    smoothing: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    sea: { type: 'boolean'; label: string; default: boolean };
  },
  TopoLayout
> = {
  engine: 'canvas2d',
  id: '05-topo',
  name: 'Topographic Map',
  description: 'Commit density as terrain — contour lines around the peaks of activity, a quiet sea where nothing happened.',
  family: 'timeline',
  room: 'time',
  meaning: [
    { label: 'Elevation', text: 'How much work landed there. High ground is busy weeks; valleys are quiet ones.' },
    { label: 'Reading direction', text: 'Time reads like a page — left to right, top to bottom — same grid as the chrono-grid.' },
    { label: 'Summits', text: 'Local peaks of activity, labeled with the date of the nearest biggest commit.' },
    { label: 'The sea', text: 'Weeks where nothing happened — washed flat below the first contour.' },
    { label: 'Elevation numbers', text: 'Printed on major contours — a stand-in for churn intensity.' },
    { label: 'Animation', text: 'The range rises out of the water — lowest contours first, summits stamp last.' },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'clay-sea', options: PALETTE_NAMES },
    levels: { type: 'number', label: 'Levels', default: 12, min: 8, max: 20, step: 1 },
    smoothing: { type: 'number', label: 'Smoothing', default: 2, min: 1, max: 4, step: 1 },
    sea: { type: 'boolean', label: 'Sea', default: true },
  },
  prepare(data, params) {
    const field = new Float64Array(GW * GH);
    const fileEvents = data.events.filter((e) => e.kind === 'file-change');

    for (const e of fileEvents) {
      const cell = Math.min(GW * GH - 1, Math.max(0, Math.floor(e.t01 * GW * GH)));
      const cx = cell % GW;
      const cy = Math.floor(cell / GW);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || x >= GW || y < 0 || y >= GH) continue;
          const g = Math.exp(-(dx * dx + dy * dy) / (2 * 1.2 * 1.2));
          field[y * GW + x] += e.magnitude * g;
        }
      }
    }

    const blurred = boxBlur(field, GW, GH, Math.round(params.smoothing) * 2);
    let max = 1e-9;
    for (let i = 0; i < blurred.length; i++) if (blurred[i] > max) max = blurred[i];
    for (let i = 0; i < blurred.length; i++) blurred[i] /= max;

    const nLevels = Math.round(params.levels);
    const contours: ContourSeg[] = [];
    for (let li = 1; li <= nLevels; li++) {
      const level = li / (nLevels + 1);
      contours.push(...marchingSquares(blurred, GW, GH, level, li));
    }

    // local maxima above ~level 9
    const thresh = 9 / (nLevels + 1);
    const candidates: Summit[] = [];
    for (let y = 1; y < GH - 1; y++) {
      for (let x = 1; x < GW - 1; x++) {
        const v0 = blurred[y * GW + x];
        if (v0 < thresh) continue;
        let peak = true;
        for (let dy = -1; dy <= 1 && peak; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (blurred[(y + dy) * GW + (x + dx)] >= v0) peak = false;
          }
        }
        if (peak) candidates.push({ gx: x, gy: y, date: '', value: v0 });
      }
    }
    candidates.sort((a, b) => b.value - a.value);

    const goals = data.events.filter((e) => e.isGoal).sort((a, b) => b.magnitude - a.magnitude);
    const summits: Summit[] = [];
    for (const c of candidates) {
      if (summits.length >= 6) break;
      const t01 = (c.gy * GW + c.gx) / (GW * GH);
      let best = goals[0];
      let bestD = Infinity;
      for (const g of goals) {
        const d = Math.abs(g.t01 - t01);
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      summits.push({
        gx: c.gx,
        gy: c.gy,
        date: best ? best.timestamp.slice(0, 10) : '',
        value: c.value,
      });
    }

    // scale: commits across map width ≈ real commit count; 1cm ≈ commits / (mapWidthCm)
    // poster design: ~1200px inner ≈ ~20cm print → commitsPerCm
    const commitsPerCm = Math.max(1, Math.round(data.meta.commitCount / 20));

    return { field: blurred, contours, summits, commitsPerCm, levels: nLevels };
  },
  render(ctx, frame, params, prepared) {
    const pal = palette(params.palette);
    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.035);

    const margin = 150;
    const footerBand = 180;
    const left = margin;
    const top = margin + 20;
    const mapW = frame.width - margin * 2;
    const mapH = frame.height - margin - footerBand;
    const { field, contours, summits, commitsPerCm, levels } = prepared;

    const toScreen = (gx: number, gy: number) => ({
      x: left + (gx / (GW - 1)) * mapW,
      y: top + (gy / (GH - 1)) * mapH,
    });

    // sea wash
    if (params.sea) {
      const seaRev = reveal(frame.t, 0, 0.12);
      if (seaRev > 0) {
        ctx.fillStyle = rgba(pal.b, 0.06 * seaRev);
        for (let y = 0; y < GH; y++) {
          for (let x = 0; x < GW; x++) {
            if (field[y * GW + x] < 1 / (levels + 1)) {
              const p = toScreen(x, y);
              const cellW = mapW / GW;
              const cellH = mapH / GH;
              ctx.fillRect(p.x, p.y, cellW + 0.5, cellH + 0.5);
            }
          }
        }
        // dotted shoreline (level ~1)
        const shore = contours.filter((c) => c.level === 1);
        for (const seg of shore) {
          const a = toScreen(seg.pts[0].x, seg.pts[0].y);
          const b = toScreen(seg.pts[1].x, seg.pts[1].y);
          ctx.beginPath();
          ctx.setLineDash([2, 4]);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = rgba(pal.ink, 0.25 * seaRev);
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // highlands
    const highRev = reveal(frame.t, 0.2, 0.2);
    if (highRev > 0) {
      ctx.fillStyle = rgba(pal.a, 0.07 * highRev);
      const highThresh = 10 / (levels + 1);
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          if (field[y * GW + x] >= highThresh) {
            const p = toScreen(x, y);
            ctx.fillRect(p.x, p.y, mapW / GW + 0.5, mapH / GH + 0.5);
          }
        }
      }
    }

    // contours by level
    for (let li = 1; li <= levels; li++) {
      const appearAt = (li / levels) * 0.85;
      const rev = reveal(frame.t, appearAt, 0.08);
      if (rev <= 0) continue;
      const major = li % 4 === 0;
      const levelSegs = contours.filter((c) => c.level === li);
      // pen-draw fraction of segments
      const drawn = Math.ceil(levelSegs.length * rev);
      for (let i = 0; i < drawn; i++) {
        const seg = levelSegs[i];
        const a = toScreen(seg.pts[0].x, seg.pts[0].y);
        const b = toScreen(seg.pts[1].x, seg.pts[1].y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = rgba(pal.ink, major ? 0.55 : 0.35);
        ctx.lineWidth = major ? 1.4 : 0.8;
        ctx.stroke();
      }
      // elevation numbers on majors
      if (major && rev > 0.9 && frame.quality >= 0.5) {
        const labeled = levelSegs.filter((_, i) => i % 40 === 0).slice(0, 4);
        ctx.fillStyle = rgba(pal.ink, 0.45);
        ctx.font = '11px ui-monospace, Menlo, monospace';
        for (const seg of labeled) {
          const p = toScreen(seg.pts[0].x, seg.pts[0].y);
          ctx.fillText(String(li * 100), p.x + 2, p.y - 2);
        }
      }
    }

    // summits
    const sumRev = reveal(frame.t, 0.88, 0.1);
    if (sumRev > 0) {
      for (const s of summits) {
        const p = toScreen(s.gx, s.gy);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 7 * sumRev);
        ctx.lineTo(p.x - 5 * sumRev, p.y + 4 * sumRev);
        ctx.lineTo(p.x + 5 * sumRev, p.y + 4 * sumRev);
        ctx.closePath();
        ctx.fillStyle = rgba(pal.ink, 0.7 * sumRev);
        ctx.fill();
        if (s.date && sumRev > 0.6) {
          ctx.fillStyle = rgba(pal.ink, 0.7);
          ctx.font = '15px ui-monospace, Menlo, monospace';
          ctx.fillText(s.date, p.x + 8, p.y + 4);
        }
      }
    }

    // compass rose top-right
    const cx = frame.width - margin - 40;
    const cy = margin + 50;
    ctx.strokeStyle = rgba(pal.ink, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 18);
    ctx.lineTo(cx, cy + 18);
    ctx.moveTo(cx - 18, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 22);
    ctx.lineTo(cx - 4, cy - 12);
    ctx.lineTo(cx + 4, cy - 12);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.ink, 0.5);
    ctx.fill();
    ctx.font = '12px ui-monospace, Menlo, monospace';
    ctx.fillText('N', cx - 4, cy - 26);

    // scale bar
    ctx.strokeStyle = rgba(pal.ink, 0.5);
    ctx.lineWidth = 1.5;
    const sx = margin;
    const sy = frame.height - footerBand + 20;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 60, sy);
    ctx.moveTo(sx, sy - 4);
    ctx.lineTo(sx, sy + 4);
    ctx.moveTo(sx + 60, sy - 4);
    ctx.lineTo(sx + 60, sy + 4);
    ctx.stroke();
    ctx.fillStyle = rgba(pal.ink, 0.5);
    ctx.font = '12px ui-monospace, Menlo, monospace';
    ctx.fillText(`1 cm ≈ ${commitsPerCm} commits`, sx + 70, sy + 4);

    grain(ctx, frame, frame.rngFor('grain'), 2800 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 5);
  },
};

export default recipe;
