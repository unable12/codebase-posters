/**
 * Headless poster renderer for README example images.
 * Usage: npx tsx scripts/generate-readme-posters.mts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { extractRepo } from '../server/extract/derive.ts';
import { headSha } from '../server/extract/gitlog.ts';
import { renderFrame } from '../src/core/renderHost.ts';
import { defaultParams } from '../src/core/types.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../src/core/types.ts';
import type { Recipe } from '../src/core/types.ts';

import chronoGrid from '../src/recipes/chronoGrid.ts';
import rain from '../src/recipes/rain.ts';
import heartbeat from '../src/recipes/heartbeat.ts';
import constellations from '../src/recipes/constellations.ts';
import posterPerDay from '../src/recipes/posterPerDay.ts';
import ridgelines from '../src/recipes/ridgelines.ts';

const POSTERS = [
  { repoPath: process.env.REACT_REPO ?? '/tmp/codebase-posters-clones/react', recipe: chronoGrid, seed: 7, slug: 'react-chrono-grid' },
  { repoPath: process.env.EXPRESS_REPO ?? '/tmp/codebase-posters-clones/express', recipe: rain, seed: 3, slug: 'express-rain' },
  { repoPath: process.env.VITE_REPO ?? '/tmp/codebase-posters-clones/vite', recipe: heartbeat, seed: 11, slug: 'vite-heartbeat' },
  { repoPath: process.env.ZOD_REPO ?? '/tmp/codebase-posters-clones/zod', recipe: constellations, seed: 5, slug: 'zod-constellations' },
  { repoPath: process.env.TAILWIND_REPO ?? '/tmp/codebase-posters-clones/tailwindcss', recipe: posterPerDay, seed: 2, slug: 'tailwind-poster-per-day' },
  { repoPath: process.env.GIT_REPO ?? '/tmp/codebase-posters-clones/git-scm', recipe: ridgelines, seed: 1, slug: 'git-ridgelines' },
] as const;

const OUT_DIR = join(import.meta.dirname, '..', 'docs', 'posters');
const PRINT_SCALE = 2.4;

async function renderPoster(
  recipe: Recipe,
  repoPath: string,
  seed: number,
  outPath: string,
): Promise<{ sha: string; commitCount: number; durationDays: number; params: Record<string, unknown> }> {
  const sha = await headSha(repoPath);
  const data = await extractRepo(repoPath, 20000);
  const params = defaultParams(recipe.params);
  const w = Math.round(DESIGN_WIDTH * PRINT_SCALE);
  const h = Math.round(DESIGN_HEIGHT * PRINT_SCALE);
  const canvas = createCanvas(w, h);
  renderFrame(canvas as unknown as OffscreenCanvas, recipe, data, params, seed, 1);
  await writeFile(outPath, canvas.toBuffer('image/png'));
  return {
    sha,
    commitCount: data.meta.commitCount,
    durationDays: Math.round(data.meta.durationDays),
    params,
  };
}

const manifestLines = [
  '# Example poster manifest',
  '',
  'Reproducible receipts for README gallery images.',
  '',
  '| repo | HEAD | recipe | seed | commits | days | file |',
  '| --- | --- | --- | ---: | ---: | ---: | --- |',
];

await mkdir(OUT_DIR, { recursive: true });

for (const item of POSTERS) {
  const fullPath = join(OUT_DIR, `${item.slug}-full.png`);
  console.log(`rendering ${item.slug} from ${item.repoPath}…`);
  const info = await renderPoster(item.recipe, item.repoPath, item.seed, fullPath);
  manifestLines.push(
    `| ${item.repoPath.split('/').pop()} | \`${info.sha.slice(0, 12)}\` | ${item.recipe.id} | ${item.seed} | ${info.commitCount} | ${info.durationDays} | ${item.slug}.png |`,
  );
  console.log(`  → ${info.commitCount} commits, ${info.durationDays} days`);
}

await writeFile(join(OUT_DIR, 'manifest.md'), manifestLines.join('\n') + '\n');
console.log('done — run sips downscale next');
