import { useEffect, useState } from 'react';
import type { RepoDataset } from '../core/schema';
import type { AnyParams, Recipe } from '../core/types';
import { defaultParams } from '../core/types';
import { playLoop } from '../core/renderHost';
import { RecipeCanvas } from './RecipeCanvas';
import { ControlPanel } from './ControlPanel';
import { exportPNG } from '../export/png';
import { exportVideo } from '../export/video';

// Sliders update instantly in the UI; the (expensive) poster re-render waits
// until the value settles so dragging stays fluid.
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

interface Props {
  recipe: Recipe;
  data: RepoDataset;
  onBack: () => void;
  /** dir: -1 previous, +1 next */
  onNavigate: (dir: number) => void;
}

export function Detail({ recipe, data, onBack, onNavigate }: Props) {
  const [params, setParams] = useState<AnyParams>(() => defaultParams(recipe.params));
  const [seed, setSeed] = useState(1);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [bleed, setBleed] = useState(false);
  /** contact sheet page: 6 seed variants per page */
  const [sheetPage, setSheetPage] = useState(0);

  const renderParams = useDebounced(params, 150);
  const renderSeed = useDebounced(seed, 150);

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

  // fixed render resolution; CSS scales it to fit the viewport
  const pixelWidth = 1350;

  const saveImage = async () => {
    setBusy('image');
    try {
      await exportPNG(recipe, data, params, seed, t, undefined, bleed);
    } finally {
      setBusy(null);
    }
  };

  const saveAnimation = async () => {
    setBusy('animation');
    try {
      await exportVideo(recipe, data, params, seed, duration);
    } finally {
      setBusy(null);
    }
  };

  const sheetSeeds = Array.from({ length: 6 }, (_, i) => sheetPage * 6 + i + 1);

  return (
    <div className="detail">
      <button className="nav-arrow" onClick={() => onNavigate(-1)} title="previous (←)">
        ‹
      </button>

      <div className="stage">
        <RecipeCanvas
          recipe={recipe}
          data={data}
          params={renderParams}
          seed={renderSeed}
          t={t}
          pixelWidth={pixelWidth}
          draft={playing}
        />
        <div className="player">
          <button
            className="play"
            onClick={() => setPlaying((p) => !p)}
            title="play/pause (space)"
          >
            {playing ? '⏸' : '▶'}
          </button>
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
          <span className="time">{t.toFixed(2)}</span>
        </div>

        <div className="contact-sheet">
          {sheetSeeds.map((s) => (
            <button
              key={s}
              className={`variant ${s === seed ? 'active' : ''}`}
              onClick={() => setSeed(s)}
              title={`seed ${s}`}
            >
              <RecipeCanvas
                recipe={recipe}
                data={data}
                params={renderParams}
                seed={s}
                t={1}
                pixelWidth={150}
                queued
                quality={0.3}
              />
            </button>
          ))}
          <button
            className="more-variants"
            onClick={() => setSheetPage((p) => p + 1)}
            title="more variants"
          >
            ↻
          </button>
        </div>
      </div>

      <button className="nav-arrow" onClick={() => onNavigate(1)} title="next (→)">
        ›
      </button>

      <div className="panel">
        <h2>{recipe.name}</h2>
        <p className="desc">{recipe.description}</p>

        <div className="placard-body">
          <div className={`drawer ${editing ? '' : 'open'}`}>
            <div className="drawer-inner">
              <dl className="meaning">
                {recipe.meaning.map((m) => (
                  <div key={m.label}>
                    <dt>{m.label}</dt>
                    <dd>{m.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className={`drawer ${editing ? 'open' : ''}`}>
            <div className="drawer-inner controls">
              <ControlPanel schema={recipe.params} values={params} onChange={setParams} />

              <label>
                <span className="param-head">
                  <span>Seed</span>
                  <span className="param-value">{seed}</span>
                </span>
                <span className="row">
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value || '0', 10))}
                  />
                  <button onClick={() => setSeed(Math.floor(Math.random() * 99999))}>🎲</button>
                </span>
              </label>

              <label>
                Animation duration (s)
                <input
                  type="number"
                  value={duration}
                  min={1}
                  max={60}
                  onChange={(e) => setDuration(parseFloat(e.target.value || '7'))}
                />
              </label>

              <label className="check-row">
                <span>3 mm print bleed</span>
                <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} />
              </label>
            </div>
          </div>
        </div>

        <div className="placard-footer">
          <div className="actions">
            <button disabled={!!busy} onClick={saveImage} title="3600×4800 px — 12×16 in at 300 DPI">
              {busy === 'image' ? 'saving…' : 'Save print'}
            </button>
            <button disabled={!!busy} onClick={saveAnimation} title={`${duration}s MP4, encoded in the browser`}>
              {busy === 'animation' ? 'encoding…' : 'Save video'}
            </button>
          </div>
          <p className="export-note">print: 12×16 in · 300 DPI &nbsp;·&nbsp; video: {duration}s mp4</p>
          <button className="edit-link" onClick={() => setEditing((e) => !e)}>
            {editing ? '✓ done' : '✎ edit parameters'}
          </button>
        </div>
      </div>
    </div>
  );
}
