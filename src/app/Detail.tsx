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
  index: number;
  count: number;
  onBack: () => void;
  /** dir: -1 previous, +1 next */
  onNavigate: (dir: number) => void;
}

export function Detail({ recipe, data, index, count, onBack, onNavigate }: Props) {
  const [params, setParams] = useState<AnyParams>(() => defaultParams(recipe.params));
  const [seed, setSeed] = useState(1);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(6);
  const [busy, setBusy] = useState<string | null>(null);
  const [showMeaning, setShowMeaning] = useState(true);

  useEffect(() => {
    setParams(defaultParams(recipe.params));
    setT(1);
    setPlaying(false);
  }, [recipe]);

  useEffect(() => {
    if (!playing) return;
    return playLoop(duration * 1000, setT);
  }, [playing, duration]);

  // gallery-style keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft') onNavigate(-1);
      else if (e.key === 'ArrowRight') onNavigate(1);
      else if (e.key === 'Escape') onBack();
      else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNavigate, onBack]);

  const displayWidth = useMemo(
    () => Math.min(900, Math.floor(window.innerHeight * 0.75 * 0.75)),
    [],
  );

  return (
    <div className="detail">
      <button className="nav-arrow" onClick={() => onNavigate(-1)} title="previous (←)">
        ‹
      </button>
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
      <button className="nav-arrow" onClick={() => onNavigate(1)} title="next (→)">
        ›
      </button>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="back" onClick={onBack}>← gallery</button>
          <span style={{ color: '#777', fontSize: 12 }}>
            {index + 1} / {count}
          </span>
        </div>
        <h2>{recipe.name}</h2>
        <p className="desc">{recipe.description}</p>

        <button onClick={() => setShowMeaning((s) => !s)}>
          {showMeaning ? 'hide' : 'how to read this'}
        </button>
        {showMeaning && (
          <dl className="meaning">
            {recipe.meaning.map((m) => (
              <div key={m.label}>
                <dt>{m.label}</dt>
                <dd>{m.text}</dd>
              </div>
            ))}
          </dl>
        )}

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
