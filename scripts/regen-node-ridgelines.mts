import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { extractRepo } from '../server/extract/derive.ts';
import { renderFrame } from '../src/core/renderHost.ts';
import { defaultParams, DESIGN_HEIGHT, DESIGN_WIDTH } from '../src/core/types.ts';
import ridgelines from '../src/recipes/ridgelines.ts';

const repoPath = '/tmp/codebase-posters-clones/node';
const OUT_DIR = join(import.meta.dirname, '..', 'docs', 'posters');
const slug = 'node-ridgelines';
const seed = 1;

const data = await extractRepo(repoPath, 20000);
console.log(`node: ${data.meta.commitCount} commits (capped), ${Math.round(data.meta.durationDays)} days`);
const w = Math.round(DESIGN_WIDTH * 2.4);
const h = Math.round(DESIGN_HEIGHT * 2.4);
const canvas = createCanvas(w, h);
renderFrame(canvas as unknown as OffscreenCanvas, ridgelines, data, defaultParams(ridgelines.params), seed, 1);
await writeFile(join(OUT_DIR, `${slug}-full.png`), canvas.toBuffer('image/png'));

const manifestPath = join(OUT_DIR, 'manifest.md');
let manifest = await readFile(manifestPath, 'utf8').catch(() => '');
const row = `| node | \`${data.meta.headSha.slice(0, 12)}\` | ${ridgelines.id} | ${seed} | ${data.meta.commitCount} | ${Math.round(data.meta.durationDays)} | ${slug}.png |`;
if (manifest.includes('| linux |')) {
  manifest = manifest.replace(/\| linux \|[^\n]*/, row);
} else if (!manifest.includes('| node |')) {
  manifest = manifest.trimEnd() + '\n' + row + '\n';
}
await writeFile(manifestPath, manifest.endsWith('\n') ? manifest : manifest + '\n');
console.log('done');
