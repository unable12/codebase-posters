import { useEffect, useMemo, useState } from 'react';
import type { RepoDataset } from '../core/schema';
import type { AnyParams, Recipe } from '../core/types';
import { defaultParams } from '../core/types';
import { playLoop } from '../core/renderHost';
import { RecipeCanvas } from './RecipeCanvas';
import { ControlPanel } from './ControlPanel';
import { exportPNG } from '../export/png';
import { exportFrames } from '../export/frames';

interface Props {
  recipe: Recipe;
  data: RepoDataset;
  onBack: () => void;
}

export function Detail({ recipe, data, onBack }: Props) {
  const [params, setParams] = useState<AnyParams>(() => defaultParams(recipe.params));
  const [seed, setSeed] = useState(1);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(6);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setParams(defaultParams(recipe.params)), [recipe]);

  useEffect(() => {
    if (!playing) return;
    return playLoop(duration * 1000, setT);
  }, [playing, duration]);

  const displayWidth = useMemo(
    () => Math.min(900, Math.floor(window.innerHeight * 0.75 * 0.75)),
    [],
  );

  return (
    <div className="detail">
      <div className="canvas-wrap">
        <RecipeCanvas
          recipe={recipe}
          data={data}
          params={params}
          seed={seed}
          t={t}
          pixelWidth={displayWidth * 2}
        />
      </div>
      <div className="panel">
        <button className="back" onClick={onBack}>← gallery</button>
        <h2>{recipe.name}</h2>
        <p className="desc">{recipe.description}</p>

        <ControlPanel schema={recipe.params} values={params} onChange={setParams} />

        <label>
          Seed
          <span className="row">
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value || '0', 10))}
            />
            <button onClick={() => setSeed(Math.floor(Math.random() * 99999))}>🎲</button>
          </span>
        </label>

        <div className="scrubber">
          <button onClick={() => setPlaying((p) => !p)}>{playing ? '⏸' : '▶'}</button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={t}
            onChange={(e) => {
              setPlaying(false);
              setT(parseFloat(e.target.value));
            }}
          />
          <span>{t.toFixed(2)}</span>
        </div>
        <label>
          Duration (s)
          <input
            type="number"
            value={duration}
            min={1}
            max={60}
            onChange={(e) => setDuration(parseFloat(e.target.value || '6'))}
          />
        </label>

        <button
          disabled={!!busy}
          onClick={async () => {
            setBusy('png');
            try {
              await exportPNG(recipe, data, params, seed, t, 2);
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === 'png' ? 'exporting…' : 'Export PNG (3000×4000)'}
        </button>
        <button
          disabled={!!busy}
          onClick={async () => {
            setBusy('frames');
            try {
              await exportFrames(recipe, data, params, seed, Math.round(duration * 30));
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === 'frames' ? 'rendering frames…' : `Export frames (${Math.round(duration * 30)} @ 30fps)`}
        </button>
        <p className="desc">
          frames → video: <code>ffmpeg -framerate 30 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p out.mp4</code>
        </p>
      </div>
    </div>
  );
}
