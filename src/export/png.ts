import type { RepoDataset } from '../core/schema';
import type { AnyParams, Recipe } from '../core/types';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../core/types';
import { renderFrame } from '../core/renderHost';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPNG(
  recipe: Recipe,
  data: RepoDataset,
  params: AnyParams,
  seed: number,
  t: number,
  scale = 2,
): Promise<void> {
  const canvas = new OffscreenCanvas(DESIGN_WIDTH * scale, DESIGN_HEIGHT * scale);
  renderFrame(canvas, recipe, data, params, seed, t);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  download(blob, `${data.meta.name}-${recipe.id}-s${seed}.png`);
}

export { download };
