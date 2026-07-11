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

/** Strip gallery-ordering prefixes like `02b-` from recipe ids for filenames. */
export function recipeSlug(id: string): string {
  return id.replace(/^[0-9]+[a-z]?-/, '');
}

export function exportBasename(repo: string, recipeId: string, seed: number, bleed = false): string {
  return `${repo}-${recipeSlug(recipeId)}-seed${seed}${bleed ? '-bleed' : ''}`;
}

/** 12x16 in at 300 DPI: 3600x4800 px (design 1500x2000 x 2.4). */
export const PRINT_SCALE = 2.4;
/** 3 mm bleed at 300 DPI ≈ 35 px per side on the final print. */
const BLEED_PX = 35;

export async function exportPNG(
  recipe: Recipe,
  data: RepoDataset,
  params: AnyParams,
  seed: number,
  t: number,
  scale = PRINT_SCALE,
  bleed = false,
): Promise<void> {
  const w = Math.round(DESIGN_WIDTH * scale);
  const h = Math.round(DESIGN_HEIGHT * scale);
  const poster = new OffscreenCanvas(w, h);
  renderFrame(poster, recipe, data, params, seed, t);

  let out = poster;
  if (bleed) {
    // extend the paper color past the trim line so full-bleed printing
    // never shows a white sliver
    const ctx = poster.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const [pr, pg, pb] = ctx.getImageData(4, 4, 1, 1).data;
    out = new OffscreenCanvas(w + BLEED_PX * 2, h + BLEED_PX * 2);
    const octx = out.getContext('2d') as OffscreenCanvasRenderingContext2D;
    octx.fillStyle = `rgb(${pr},${pg},${pb})`;
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(poster, BLEED_PX, BLEED_PX);
  }

  const blob = await out.convertToBlob({ type: 'image/png' });
  download(blob, `${exportBasename(data.meta.name, recipe.id, seed, bleed)}.png`);
}

export { download };
