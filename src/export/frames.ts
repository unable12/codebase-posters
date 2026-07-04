import { zipSync } from 'fflate';
import type { RepoDataset } from '../core/schema';
import type { AnyParams, Recipe } from '../core/types';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../core/types';
import { renderFrame } from '../core/renderHost';
import { download } from './png';

/** Render t=0..1 in frameCount steps and download a zip of PNG frames. */
export async function exportFrames(
  recipe: Recipe,
  data: RepoDataset,
  params: AnyParams,
  seed: number,
  frameCount = 180,
  scale = 1,
): Promise<void> {
  const canvas = new OffscreenCanvas(DESIGN_WIDTH * scale, DESIGN_HEIGHT * scale);
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < frameCount; i++) {
    const t = frameCount > 1 ? i / (frameCount - 1) : 1;
    renderFrame(canvas, recipe, data, params, seed, t);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    files[`frame_${String(i).padStart(4, '0')}.png`] = new Uint8Array(await blob.arrayBuffer());
  }
  const zipped = zipSync(files, { level: 0 }); // PNGs are already compressed
  download(new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }), `${data.meta.name}-${recipe.id}-frames.zip`);
}
