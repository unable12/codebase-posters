import type { CanvasRecipe } from '../core/types';
import type { RepoDataset, FileStat } from '../core/schema';
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
import { hashString, makeRng } from '../core/rng';

// The repo as a mind at work: one unbroken pen-line wandering through the
// project's idea-space. Perceive, consider, act — thousands of times over.
// Silences become coils of deliberation, big commits become bold strokes,
// abandoned experiments fade back into the paper like forgotten thoughts.

const CX = 750;
const CY = 940;
const RX = 520;
const RY = 640;
const FIELD = { x0: 170, y0: 200, x1: 1330, y1: 1640 };
const MAX_NODES = 1200;
const GOLDEN_ANGLE = 2.39996322972865332;

interface PenPoint {
  x: number;
  y: number;
  tt: number;
  ni: number; // node index this point belongs to
}

interface Node {
  x: number;
  y: number;
  tt: number;
  appear: number;
  sha: string;
  date: string; // MM-DD
  magnitude: number;
  addDominant: boolean;
  frontier: boolean;
  visitNo: number;
  ghostFade: number; // final alpha multiplier: 1 = kept thought, ~0.3 = abandoned
  coil: boolean; // this node was preceded by a deliberation coil
  forks: { x: number; y: number }[];
  labeled: boolean;
}

interface Cluster {
  name: string;
  x: number;
  y: number;
  r: number;
  firstAppear: number;
  labeled: boolean;
}

interface Prepared {
  points: PenPoint[];
  nodes: Node[];
  clusters: Cluster[];
  dim: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (lo: number, hi: number, v: number) => {
  const u = clamp((v - lo) / (hi - lo), 0, 1);
  return u * u * (3 - 2 * u);
};

function clusterKey(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? '.' : path.slice(0, i);
}

function prepareThought(
  data: RepoDataset,
  params: { momentum: number; dwell: number; ghosts: boolean; clock: string },
  seed: number,
): Prepared {
  const rngOf = (key: string) => makeRng(hashString(`tot:${seed}:${key}`));
  const commits = data.events.filter((e) => e.kind === 'commit');
  const n = commits.length;
  if (n === 0) return { points: [], nodes: [], clusters: [], dim: 1 };

  // files touched per commit
  const filesBySha = new Map<string, string[]>();
  for (const e of data.events) {
    if (e.kind !== 'file-change' || !e.path) continue;
    const arr = filesBySha.get(e.sha);
    if (arr) arr.push(e.path);
    else filesBySha.set(e.sha, [e.path]);
  }
  const statByPath = new Map<string, FileStat>(data.files.map((f) => [f.path, f]));

  // ---- two clocks: calendar time stretches silence, sequence time gives
  // every thought an equal beat
  const useReal = params.clock === 'real' && data.meta.durationDays > 0;
  const baseT = (i: number) => (useReal ? commits[i].t01 : n === 1 ? 0 : i / (n - 1));

  // gaps in wall-clock ms (deliberation is always measured in real silence)
  const ms = commits.map((c) => new Date(c.timestamp).getTime());
  const gaps = ms.slice(1).map((b, i) => Math.max(0, b - ms[i]));
  const positive = gaps.filter((g) => g > 0).sort((a, b) => a - b);
  const medianGap = positive.length ? positive[Math.floor(positive.length / 2)] : 0;
  const coilThreshold = Math.max(4 * medianGap, 6 * 3600 * 1000);
  // only the longest silences earn a coil — a long history has hundreds of
  // qualifying gaps, and a poster drowning in spirals says nothing
  const coilSet = new Set<number>();
  if (params.dwell > 0 && medianGap > 0) {
    const candidates: { i: number; gap: number }[] = [];
    for (let i = 1; i < n; i++) {
      if (gaps[i - 1] > coilThreshold) candidates.push({ i, gap: gaps[i - 1] });
    }
    candidates.sort((a, b) => b.gap - a.gap);
    for (const c of candidates.slice(0, 48)) coilSet.add(c.i);
  }
  const coilWorthy = (i: number) => coilSet.has(i);

  // ---- density stride: huge histories fold into ~MAX_NODES pen strokes
  const keepEvery = Math.ceil(n / MAX_NODES);
  const kept: { i: number; magnitude: number; adds: number; dels: number; paths: string[] }[] = [];
  let acc: { magnitude: number; adds: number; dels: number; paths: string[] } | null = null;
  for (let i = 0; i < n; i++) {
    const c = commits[i];
    const paths = filesBySha.get(c.sha) ?? [];
    if (!acc) acc = { magnitude: 0, adds: 0, dels: 0, paths: [] };
    acc.magnitude = Math.max(acc.magnitude, c.magnitude);
    acc.adds += c.additions;
    acc.dels += c.deletions;
    for (const p of paths) acc.paths.push(p);
    if (i % keepEvery === 0 || c.isGoal || coilWorthy(i) || i === n - 1) {
      kept.push({ i, ...acc });
      acc = null;
    }
  }
  const dim = 0.45 + 0.55 * Math.min(1, 900 / Math.max(1, n));

  // ---- idea-space: top-level directories on a golden-angle spiral,
  // the heaviest neighborhoods of thought near the center of the mind
  const weight = new Map<string, number>();
  for (const e of data.events) {
    if (e.kind !== 'file-change' || !e.path) continue;
    const k = clusterKey(e.path);
    weight.set(k, (weight.get(k) ?? 0) + 1);
  }
  if (weight.size === 0) weight.set('.', 1);
  const names = [...weight.keys()].sort(
    (a, b) => (weight.get(b)! - weight.get(a)!) || (a < b ? -1 : 1),
  );
  const maxW = weight.get(names[0])!;
  const layoutRng = rngOf('layout');
  const rot = layoutRng.next() * Math.PI * 2;
  const clusterPos = new Map<string, { x: number; y: number; r: number }>();
  names.forEach((name, k) => {
    const jr = rngOf(`cluster:${name}`);
    const angle = k * GOLDEN_ANGLE + rot;
    const radius01 = Math.sqrt((k + 0.6) / (names.length + 0.6));
    const x = clamp(CX + Math.cos(angle) * radius01 * RX + jr.gauss() * 30, FIELD.x0 + 60, FIELD.x1 - 60);
    const y = clamp(CY + Math.sin(angle) * radius01 * RY + jr.gauss() * 30, FIELD.y0 + 60, FIELD.y1 - 60);
    const r = 60 + 130 * Math.sqrt(weight.get(name)! / maxW);
    clusterPos.set(name, { x, y, r });
  });

  // stable file position inside its cluster: same subdirectory, same bearing
  const filePos = (path: string): { x: number; y: number } => {
    const c = clusterPos.get(clusterKey(path))!;
    const rest = path.slice(path.indexOf('/') + 1);
    const seg = rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : rest;
    const a = (hashString(`a:${seg}`) / 4294967296) * Math.PI * 2;
    const rad = c.r * (0.25 + 0.75 * Math.sqrt(hashString(`r:${path}`) / 4294967296));
    return { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad };
  };

  // ---- targets: where each act of thought pulled the pen
  const targets: { x: number; y: number }[] = [];
  for (let k = 0; k < kept.length; k++) {
    const { i, paths } = kept[k];
    const jit = rngOf(`jit:${commits[i].sha}`);
    if (paths.length === 0) {
      const prev = targets[k - 1] ?? { x: CX, y: CY };
      targets.push({ x: prev.x + jit.gauss() * 10, y: prev.y + jit.gauss() * 10 });
      continue;
    }
    let sx = 0;
    let sy = 0;
    for (const p of paths) {
      const fp = filePos(p);
      sx += fp.x;
      sy += fp.y;
    }
    targets.push({
      x: sx / paths.length + jit.gauss() * 10,
      y: sy / paths.length + jit.gauss() * 10,
    });
  }

  // ---- monotonic timeline + appearance schedule (line finishes at 0.92,
  // leaving the last beats for the signature)
  const tts: number[] = [];
  let prevTT = -1;
  for (const k of kept) {
    let tt = baseT(k.i);
    if (tt <= prevTT) tt = prevTT + 1e-6;
    tts.push(tt);
    prevTT = tt;
  }
  const ttMax = Math.max(tts[tts.length - 1], 1);
  // one schedule for everything: pen points, nodes, labels all live on the
  // same 0.02..0.92 timeline so the tip and its nodes arrive together
  const appearOf = (tt: number) => 0.02 + (tt / ttMax) * 0.9;

  // ---- the pen: momentum carries it, targets pull it, silence coils it
  const fric = 0.5 + 0.42 * params.momentum;
  const pull = 0.3 - 0.18 * params.momentum;
  const sub = n > 3000 ? 4 : n > 800 ? 6 : 10;
  const points: PenPoint[] = [];
  const nodes: Node[] = [];
  let px = targets[0].x;
  let py = targets[0].y;
  let vx = 0;
  let vy = 0;
  // headings in/out of each node, for pivot detection
  const headIn: { x: number; y: number }[] = [];
  const headOut: { x: number; y: number }[] = [];

  points.push({ x: px, y: py, tt: appearOf(tts[0]), ni: 0 });
  for (let k = 0; k < kept.length; k++) {
    const { i, magnitude, adds, dels } = kept[k];
    const c = commits[i];
    if (k > 0) {
      const g = targets[k];
      const tt0 = appearOf(tts[k - 1]);
      const tt1 = appearOf(tts[k]);
      const emitStart = points.length;
      let strikeFrom = 0;

      // deliberation: the pen circles in place before it strikes out
      if (coilWorthy(i)) {
        const gap = gaps[i - 1];
        const turns = clamp(0.5 * Math.log2(gap / medianGap), 0.75, 3);
        const R = (7 + 9 * turns) * params.dwell;
        const steps = Math.ceil(turns * 14);
        const cr = rngOf(`coil:${c.sha}`);
        const a0 = Math.atan2(vy, vx) + Math.PI / 2;
        const dir = cr.next() < 0.5 ? 1 : -1;
        for (let j = 1; j <= steps; j++) {
          const u = j / steps;
          const rad = 2 + (R - 2) * u;
          const a = a0 + dir * u * turns * Math.PI * 2;
          points.push({
            x: clamp(px + Math.cos(a) * rad, FIELD.x0, FIELD.x1),
            y: clamp(py + Math.sin(a) * rad, FIELD.y0, FIELD.y1),
            tt: tt0 + (tt1 - tt0) * (0.05 + 0.75 * u),
            ni: k,
          });
        }
        const last = points[points.length - 1];
        px = last.x;
        py = last.y;
        vx *= 0.2; // thinking kills momentum
        vy *= 0.2;
        strikeFrom = 0.8;
      }

      // the strike: drift of heading + pull toward the touched files
      const before = { x: px, y: py };
      for (let s = 1; s <= sub; s++) {
        vx = vx * fric + (g.x - px) * pull;
        vy = vy * fric + (g.y - py) * pull;
        px = clamp(px + vx, FIELD.x0, FIELD.x1);
        py = clamp(py + vy, FIELD.y0, FIELD.y1);
        points.push({
          x: px,
          y: py,
          tt: tt0 + (tt1 - tt0) * (strikeFrom + (1 - strikeFrom) * (s / sub)),
          ni: k,
        });
      }
      headIn[k] = { x: px - before.x, y: py - before.y };
      // heading out of node k-1 is the first movement toward node k
      const firstAfter = points[emitStart];
      const prevNode = nodes[k - 1];
      headOut[k - 1] = { x: firstAfter.x - prevNode.x, y: firstAfter.y - prevNode.y };
    }

    nodes.push({
      x: px,
      y: py,
      tt: appearOf(tts[k]),
      appear: appearOf(tts[k]),
      sha: c.sha,
      date: c.timestamp.slice(5, 10),
      magnitude,
      addDominant: adds >= dels,
      frontier: false,
      visitNo: 1,
      ghostFade: 1,
      coil: k > 0 && coilWorthy(i),
      forks: [],
      labeled: false,
    });
  }

  // ---- classification: adventures, abandoned experiments, revisits
  const eps = Math.max(0.004, 0.75 / n);
  const visitCount = new Map<string, number>();
  let prevCluster = '';
  for (let k = 0; k < kept.length; k++) {
    const node = nodes[k];
    const { i, paths } = kept[k];
    const c = commits[i];

    if (paths.length > 0) {
      let firstTouches = 0;
      let lastSum = 0;
      let known = 0;
      for (const p of paths) {
        const st = statByPath.get(p);
        if (!st) continue;
        known++;
        lastSum += st.lastT01;
        if (Math.abs(st.firstT01 - c.t01) <= eps) firstTouches++;
      }
      node.frontier = known >= 2 && firstTouches / known >= 0.6;
      if (known > 0) node.ghostFade = 0.3 + 0.7 * smooth(0.25, 0.65, lastSum / known);
    }

    // revisits: stepping back into a neighborhood already thought about
    const ck = paths.length ? clusterKey(paths[0]) : prevCluster;
    if (ck && ck !== prevCluster) {
      const v = (visitCount.get(ck) ?? 0) + 1;
      visitCount.set(ck, v);
      node.visitNo = v;
      prevCluster = ck;
    }
  }

  // ---- pivots and the roads not taken
  if (params.ghosts) {
    const pivots: { k: number; sharp: number }[] = [];
    for (let k = 1; k < nodes.length - 1; k++) {
      const hi = headIn[k];
      const ho = headOut[k];
      if (!hi || !ho) continue;
      const li = Math.hypot(hi.x, hi.y);
      const lo = Math.hypot(ho.x, ho.y);
      if (li < 45 || lo < 45) continue;
      const dot = (hi.x * ho.x + hi.y * ho.y) / (li * lo);
      if (dot < -0.17) pivots.push({ k, sharp: -dot });
    }
    pivots.sort((a, b) => b.sharp - a.sharp);
    for (const { k } of pivots.slice(0, 40)) {
      const node = nodes[k];
      // other neighborhoods the mind could have gone to instead
      const elsewhere = names.filter((name) => {
        if (kept[k].paths.length && clusterKey(kept[k].paths[0]) === name) return false;
        const c = clusterPos.get(name)!;
        return Math.hypot(c.x - node.x, c.y - node.y) > 40;
      });
      const fr = rngOf(`fork:${node.sha}`);
      const count = Math.min(elsewhere.length, 2 + (fr.next() < 0.5 ? 1 : 0));
      // deterministic pick: the nearest few
      const byDist = elsewhere
        .map((name) => {
          const c = clusterPos.get(name)!;
          return { name, d: Math.hypot(c.x - node.x, c.y - node.y) };
        })
        .sort((a, b) => a.d - b.d)
        .slice(0, count);
      for (const { name } of byDist) {
        const c = clusterPos.get(name)!;
        const d = Math.hypot(c.x - node.x, c.y - node.y) || 1;
        const len = 70 + fr.next() * 40;
        node.forks.push({
          x: clamp(node.x + ((c.x - node.x) / d) * len, FIELD.x0, FIELD.x1),
          y: clamp(node.y + ((c.y - node.y) / d) * len, FIELD.y0, FIELD.y1),
        });
      }
    }
  }

  // ---- labels: the eight most decisive moments
  const goalNodes = kept
    .map((kc, k) => ({ k, isGoal: commits[kc.i].isGoal, magnitude: nodes[k].magnitude }))
    .filter((g) => g.isGoal)
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 8);
  for (const g of goalNodes) nodes[g.k].labeled = true;

  // ---- cluster furniture
  const firstAppearOf = new Map<string, number>();
  for (let k = 0; k < kept.length; k++) {
    const paths = kept[k].paths;
    if (!paths.length) continue;
    const ck = clusterKey(paths[0]);
    if (!firstAppearOf.has(ck)) firstAppearOf.set(ck, nodes[k].appear);
  }
  const clusters: Cluster[] = names.map((name, k) => {
    const c = clusterPos.get(name)!;
    return {
      name,
      x: c.x,
      y: c.y,
      r: c.r,
      firstAppear: firstAppearOf.get(name) ?? 0.02,
      labeled: k < 8,
    };
  });

  return { points, nodes, clusters, dim };
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    momentum: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    dwell: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    ghosts: { type: 'boolean'; label: string; default: boolean };
    clock: { type: 'select'; label: string; default: string; options: string[] };
  },
  Prepared
> = {
  engine: 'canvas2d',
  id: '19-train-of-thought',
  name: 'Train of Thought',
  description:
    'One continuous pen-line wandering the repo’s idea-space: commits as steps of thought, silences as coils, abandoned ideas fading to ghost.',
  family: 'flow',
  room: 'time',
  meaning: [
    {
      label: 'The line',
      text: 'One unbroken pen-line, first commit to last: the project’s mind wandering through its own idea-space. It never lifts.',
    },
    {
      label: 'Idea-space',
      text: 'Each top-level directory is a neighborhood of thought, placed once and never moved. Every commit pulls the pen toward the files it touched, so returning to old code is literally returning.',
    },
    {
      label: 'Coils',
      text: 'A long silence before a commit is drawn as a small coil: the pen circling in place, deliberating. The longer the pause, the more turns.',
    },
    {
      label: 'Ink',
      text: 'Stroke weight is the size of the commit. Color A when code mostly arrived, color B when it mostly left. Revisited neighborhoods accumulate darker ink.',
    },
    {
      label: 'Frontiers & ghosts',
      text: 'Ringed nodes are first steps into files never touched before. Faint dashed rays at sharp pivots are the roads not taken. Strokes through abandoned corners fade back toward the paper: thoughts the project stopped thinking.',
    },
    {
      label: 'Animation',
      text: 'The line draws itself chronologically, a bright pen-tip riding the end; at rest you see the whole train of thought at once.',
    },
  ],
  params: {
    palette: { type: 'select', label: 'Palette', default: 'ochre-indigo', options: PALETTE_NAMES },
    momentum: { type: 'number', label: 'Momentum', default: 0.6, min: 0, max: 1, step: 0.05 },
    dwell: { type: 'number', label: 'Dwell coils', default: 1, min: 0, max: 2.5, step: 0.1 },
    ghosts: { type: 'boolean', label: 'Roads not taken', default: true },
    clock: { type: 'select', label: 'Clock', default: 'real', options: ['real', 'sequence'] },
  },
  prepare(data, params, seed) {
    return prepareThought(data, params, seed);
  },
  render(ctx, frame, params, prep) {
    const pal = palette(params.palette);
    const { t } = frame;
    const { points, nodes, clusters, dim } = prep;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.05);

    // neighborhoods of thought: faint concentric rings, named for the big ones
    ctx.save();
    ctx.font = '14px ui-monospace, Menlo, monospace';
    for (const c of clusters) {
      const rv = reveal(t, Math.max(0, c.firstAppear - 0.02), 0.08);
      if (rv <= 0) continue;
      for (const [f, a] of [
        [0.5, 0.04],
        [0.75, 0.03],
        [1, 0.02],
      ] as const) {
        ctx.strokeStyle = rgba(pal.ink, a * rv);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r * f, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (c.labeled) {
        ctx.fillStyle = rgba(pal.ink, 0.3 * rv);
        ctx.fillText(c.name.toLowerCase(), c.x - c.name.length * 4, c.y - c.r - 10);
      }
    }
    ctx.restore();

    // memory consolidation: revisited ground darkens softly under the line
    for (const node of nodes) {
      if (node.visitNo < 2) continue;
      const rv = reveal(t, node.appear, 0.06);
      if (rv <= 0) continue;
      ctx.fillStyle = rgba(pal.ink, 0.05 * dim * rv);
      ctx.beginPath();
      ctx.arc(node.x, node.y, 10 + 3 * Math.min(node.visitNo, 6), 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- the line itself, painted as runs of points per node
    if (nodes.length > 0 && points.length >= 2) {
      let runStart = 0;
      while (runStart < points.length) {
        const ni = points[runStart].ni;
        let runEnd = runStart;
        while (runEnd + 1 < points.length && points[runEnd + 1].ni === ni) runEnd++;
        const node = nodes[ni];
        // include the previous point so runs connect without gaps
        const runPts = points.slice(Math.max(0, runStart - 1), runEnd + 1);
        const first = runPts[0];
        if (first.tt > t && t < 1) break; // nothing of this run visible yet

        const runColor = node.coil && points[runStart].tt < node.tt ? pal.ink : node.addDominant ? pal.a : pal.b;
        const ghostRamp = reveal(t, Math.min(0.999, node.appear + 0.08), 0.25);
        const alphaMul = dim * (1 - (1 - node.ghostFade) * ghostRamp);
        const runWidth = 1 + node.magnitude * 3.2;

        // visible prefix of this run, with one interpolated tip point
        const vis: { x: number; y: number }[] = [];
        for (let i = 0; i < runPts.length; i++) {
          const p = runPts[i];
          if (t >= 1 || p.tt <= t) {
            vis.push(p);
          } else {
            const prev = runPts[i - 1];
            if (prev && prev.tt < p.tt) {
              const u = (t - prev.tt) / (p.tt - prev.tt);
              vis.push({ x: prev.x + (p.x - prev.x) * u, y: prev.y + (p.y - prev.y) * u });
            }
            break;
          }
        }
        if (vis.length >= 2) {
          // brushed ink in frame-stable chunks
          const chunk = 20;
          for (let i = 0; i + 1 < vis.length; i += chunk) {
            const slice = vis.slice(i, Math.min(i + chunk + 1, vis.length));
            sprayStroke(ctx, slice, runColor, frame.rngFor(`spray:${ni}:${i}`), {
              width: 2.6 + node.magnitude * 2,
              density: 2.4 * frame.quality,
              alpha: 0.1 * alphaMul,
            });
          }
          // crisp core stroke
          ctx.strokeStyle = rgba(runColor, 0.6 * alphaMul);
          ctx.lineWidth = runWidth;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.beginPath();
          vis.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
        }
        runStart = runEnd + 1;
      }

      // the pen-tip, riding the end of thought while it still thinks
      if (t < 1) {
        let tip = points[0];
        for (const p of points) {
          if (p.tt <= t) tip = p;
          else break;
        }
        ctx.fillStyle = pal.b;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(pal.b, 0.25);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // roads not taken: dashed rays at the sharp pivots
    if (params.ghosts) {
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      for (const node of nodes) {
        if (!node.forks.length) continue;
        const rv = reveal(t, Math.min(0.999, node.appear + 0.01), 0.05);
        if (rv <= 0) continue;
        ctx.strokeStyle = rgba(pal.ink, 0.12 * rv);
        for (const f of node.forks) {
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(node.x + (f.x - node.x) * rv, node.y + (f.y - node.y) * rv);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // acts of thought: one node per stroke, frontiers ringed
    for (const node of nodes) {
      const rv = reveal(t, node.appear, 0.04);
      if (rv <= 0) continue;
      const color = node.addDominant ? pal.a : pal.b;
      const size = (2 + node.magnitude * 7) * (0.4 + 0.6 * rv);
      if (rv < 1) {
        const flash = Math.sin(rv * Math.PI);
        ctx.fillStyle = rgba(color, 0.22 * flash);
        ctx.beginPath();
        ctx.arc(node.x, node.y, size * (2.5 + flash * 2.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rgba(color, 0.1 * dim * rv);
      ctx.beginPath();
      ctx.arc(node.x, node.y, size * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(color, 0.5 * dim * rv);
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
      ctx.fill();
      if (node.frontier) {
        // a first step into blank territory: bright center, wide ring
        ctx.fillStyle = rgba(pal.paper, 0.9 * rv);
        ctx.beginPath();
        ctx.arc(node.x, node.y, size * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(color, 0.5 * rv);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(node.x, node.y, size * 2.4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(pal.ink, 0.75 * dim * rv);
        ctx.beginPath();
        ctx.arc(node.x, node.y, size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // the decisive moments, dated
    ctx.save();
    ctx.font = '600 18px ui-monospace, Menlo, monospace';
    for (const node of nodes) {
      if (!node.labeled) continue;
      const rv = reveal(t, node.appear, 0.03);
      if (rv <= 0) continue;
      ctx.globalAlpha = rv;
      ctx.fillStyle = pal.ink;
      ctx.fillText(node.date, node.x + 14, node.y - 14);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    grain(ctx, frame, frame.rngFor('grain'), 3000 * frame.quality);
    typographyFooter(ctx, frame, pal.ink, 20);
  },
};

export default recipe;
