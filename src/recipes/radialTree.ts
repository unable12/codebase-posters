import type { CanvasRecipe } from '../core/types';
import type { RepoDataset, TreeNode } from '../core/schema';
import { dataTexture, grain, palette, PALETTE_NAMES, paper, rgba, sprayStroke, typographyFooter } from '../core/draw';

// Directory tree as a radial burst: brushed branches from root outward,
// leaf size = file size, hue = churn (hot files in color A, cold in color B).

interface Laid {
  node: TreeNode;
  depth: number;
  angle: number; // radians
  span: number;
  parent?: Laid;
}

function layout(root: TreeNode): Laid[] {
  const out: Laid[] = [];
  const weight = (n: TreeNode): number =>
    n.type === 'file' ? Math.max(1, Math.sqrt(n.metrics.bytes)) : (n.children ?? []).reduce((s, c) => s + weight(c), 0);
  const walk = (node: TreeNode, depth: number, a0: number, a1: number, parent?: Laid) => {
    const mid = (a0 + a1) / 2;
    const laid: Laid = { node, depth, angle: mid, span: a1 - a0, parent };
    out.push(laid);
    if (!node.children) return;
    const total = weight(node);
    let a = a0;
    for (const c of node.children.slice().sort((x, y) => weight(y) - weight(x))) {
      const frac = total ? weight(c) / total : 0;
      walk(c, depth + 1, a, a + (a1 - a0) * frac, laid);
      a += (a1 - a0) * frac;
    }
  };
  walk(root, 0, -Math.PI / 2, Math.PI * 1.5);
  return out;
}

const recipe: CanvasRecipe<
  {
    palette: { type: 'select'; label: string; default: string; options: string[] };
    ringGap: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    curl: { type: 'number'; label: string; default: number; min: number; max: number; step: number };
    labels: { type: 'boolean'; label: string; default: boolean };
  },
  Laid[]
> = {
  engine: 'canvas2d',
  id: '06-radial-tree',
  name: 'Radial Tree Burst',
  description: 'The directory tree exploding from the center; branch length by depth, marks by file size, color by churn.',
  family: 'structure',
  params: {
    palette: { type: 'select', label: 'Palette', default: 'violet-lime', options: PALETTE_NAMES },
    ringGap: { type: 'number', label: 'Ring gap', default: 300, min: 60, max: 300, step: 5 },
    curl: { type: 'number', label: 'Branch curl', default: 0.4, min: 0, max: 1.5, step: 0.05 },
    labels: { type: 'boolean', label: 'Dir labels', default: true },
  },
  prepare(data: RepoDataset) {
    return layout(data.tree);
  },
  render(ctx, frame, params, laid) {
    const pal = palette(params.palette);
    const { rng, noise, t } = frame;
    const cx = frame.width / 2;
    const cy = frame.height / 2 - 60;

    paper(ctx, frame, pal.paper);
    dataTexture(ctx, frame, pal.ink, 0.06);

    const maxChurn = Math.max(...laid.map((l) => l.node.metrics.churn), 1);
    // scale rings so the deepest node reaches near the poster edge regardless of tree depth
    const deepest = Math.max(...laid.map((l) => l.depth), 1);
    const ringScale = Math.min(params.ringGap, (Math.min(frame.width, frame.height) / 2 - 200) / deepest);
    const posOf = (l: Laid) => {
      const r = l.depth * ringScale;
      const curlOff = noise(Math.cos(l.angle) + 3, Math.sin(l.angle) + 3, l.depth * 0.5) * params.curl * 80;
      return {
        x: cx + Math.cos(l.angle) * (r + curlOff),
        y: cy + Math.sin(l.angle) * (r + curlOff) * 0.95,
      };
    };

    // reveal by depth: t sweeps the tree outward from the root
    const maxDepth = Math.max(...laid.map((l) => l.depth), 1);
    const reveal = t * (maxDepth + 1);

    for (const l of laid) {
      if (!l.parent || l.depth > reveal) continue;
      const p0 = posOf(l.parent);
      const p1 = posOf(l);
      const partial = Math.min(1, reveal - l.depth + 1);
      const heat = Math.log1p(l.node.metrics.churn) / Math.log1p(maxChurn);
      const color = heat > 0.45 ? pal.a : pal.b;
      const pts = [];
      const steps = 14;
      for (let k = 0; k <= steps * partial; k++) {
        const v = k / steps;
        const bend = noise(v * 3 + l.angle, l.depth, 7) * 26;
        pts.push({
          x: p0.x + (p1.x - p0.x) * v + Math.cos(l.angle + Math.PI / 2) * bend,
          y: p0.y + (p1.y - p0.y) * v + Math.sin(l.angle + Math.PI / 2) * bend,
        });
      }
      const w = l.node.type === 'dir' ? 6 : 2 + Math.sqrt(l.node.metrics.bytes) * 0.03;
      sprayStroke(ctx, pts, color, rng, {
        width: Math.min(14, w),
        density: 2,
        alpha: 0.06 + heat * 0.05,
      });
      if (l.node.type === 'file' && partial >= 1) {
        ctx.fillStyle = rgba(color, 0.5);
        const r = Math.min(10, 1.5 + Math.sqrt(l.node.metrics.bytes) * 0.02);
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (params.labels) {
      ctx.save();
      ctx.font = '600 18px ui-monospace, Menlo, monospace';
      ctx.fillStyle = pal.ink;
      for (const l of laid) {
        if (l.node.type !== 'dir' || l.depth !== 1 || l.depth > reveal) continue;
        const p = posOf(l);
        ctx.fillText(l.node.name, p.x + 8, p.y - 8);
      }
      ctx.restore();
    }

    grain(ctx, frame, rng);
    typographyFooter(ctx, frame, pal.ink, 6);
  },
};

export default recipe;
