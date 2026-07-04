import { useEffect, useRef } from 'react';
import type { RepoDataset } from '../core/schema';
import type { AnyParams, Recipe } from '../core/types';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../core/types';
import { renderFrame } from '../core/renderHost';

interface Props {
  recipe: Recipe;
  data: RepoDataset;
  params: AnyParams;
  seed: number;
  t: number;
  /** Canvas pixel width (height follows 3:4). */
  pixelWidth: number;
  onClick?: () => void;
}

export function RecipeCanvas({ recipe, data, params, seed, t, pixelWidth, onClick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    renderFrame(canvas, recipe, data, params, seed, t);
  }, [recipe, data, params, seed, t, pixelWidth]);

  return (
    <canvas
      ref={ref}
      width={pixelWidth}
      height={(pixelWidth * DESIGN_HEIGHT) / DESIGN_WIDTH}
      onClick={onClick}
    />
  );
}
