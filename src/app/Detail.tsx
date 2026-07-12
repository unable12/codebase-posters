import { useEffect, useRef, useState } from 'react';
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
  index: number;
  total: number;
  onBack: () => void;
  /** dir: -1 previous, +1 next */
  onNavigate: (dir: number) => void;
}

export function Detail({ recipe, data, index, total, onBack, onNavigate }: Props) {
  const [params, setParams] = useState<AnyParams>(() => defaultParams(recipe.params));
  const [seed, setSeed] = useState(1);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  /** When true, playLoop runs once and stops at t=1 (autoplay). Manual play loops. */
  const [playOnce, setPlayOnce] = useState(false);
  const [duration, setDuration] = useState(7);
  const [busy, setBusy] = useState<'image' | 'animation' | null>(null);
  const [done, setDone] = useState<'image' | 'animation' | null>(null);
  const [editing, setEditing] = useState(false);
  const [bleed, setBleed] = useState(false);
  const [labelSwap, setLabelSwap] = useState<'image' | 'animation' | null>(null);
  const [canvasFading, setCanvasFading] = useState(false);

  const renderParams = useDebounced(params, 150);
  const renderSeed = useDebounced(seed, 150);

  const autoplayTimers = useRef<number[]>([]);
  const autoplayActiveRef = useRef(false);
  const doneTimer = useRef<number | null>(null);
  const imageLabelMounted = useRef(false);
  const videoLabelMounted = useRef(false);

  const clearAutoplayTimers = () => {
    for (const id of autoplayTimers.current) window.clearTimeout(id);
    autoplayTimers.current = [];
  };

  /** Abort the first-open sequence and land on the finished poster. No-op if idle. */
  const cancelAutoplay = () => {
    clearAutoplayTimers();
    setCanvasFading(false);
    if (!autoplayActiveRef.current) return;
    autoplayActiveRef.current = false;
    setPlayOnce(false);
    setPlaying(false);
    setT(1);
  };

  useEffect(() => {
    if (!playing) return;
    return playLoop(
      duration * 1000,
      (next) => {
        setT(next);
        if (playOnce && next >= 1) {
          autoplayActiveRef.current = false;
          setPlaying(false);
          setPlayOnce(false);
        }
      },
      !playOnce,
    );
  }, [playing, duration, playOnce]);

  // Every open performs once: show the finished piece → fade to paper →
  // paint it in front of you → rest at t=1. Any interaction cancels.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    autoplayActiveRef.current = true;

    const fadeAt = window.setTimeout(() => {
      setCanvasFading(true);
      // fade-out done: swap to the blank t=0 frame WHILE still hidden…
      const swapBlank = window.setTimeout(() => {
        setT(0);
        // …give the blank frame a beat to actually paint, then reveal and play.
        // (Revealing in the same commit flashed the old finished frame — the blink.)
        const revealAndPlay = window.setTimeout(() => {
          setCanvasFading(false);
          setPlayOnce(true);
          setPlaying(true);
        }, 120);
        autoplayTimers.current.push(revealAndPlay);
      }, 260);
      autoplayTimers.current.push(swapBlank);
    }, 840); // morph (~340ms) + a breath on the finished piece
    autoplayTimers.current.push(fadeAt);

    return () => clearAutoplayTimers();
  }, []);

  const imageLabel =
    busy === 'image' ? 'saving…' : done === 'image' ? 'saved ✓' : 'Save print';
  const videoLabel =
    busy === 'animation' ? 'encoding…' : done === 'animation' ? 'saved ✓' : 'Save video';

  useEffect(() => {
    if (!imageLabelMounted.current) {
      imageLabelMounted.current = true;
      return;
    }
    setLabelSwap('image');
    const id = window.setTimeout(() => setLabelSwap(null), 200);
    return () => window.clearTimeout(id);
  }, [imageLabel]);

  useEffect(() => {
    if (!videoLabelMounted.current) {
      videoLabelMounted.current = true;
      return;
    }
    setLabelSwap('animation');
    const id = window.setTimeout(() => setLabelSwap(null), 200);
    return () => window.clearTimeout(id);
  }, [videoLabel]);

  useEffect(() => {
    return () => {
      if (doneTimer.current !== null) window.clearTimeout(doneTimer.current);
    };
  }, []);

  const markDone = (kind: 'image' | 'animation') => {
    if (doneTimer.current !== null) window.clearTimeout(doneTimer.current);
    setDone(kind);
    doneTimer.current = window.setTimeout(() => {
      setDone(null);
      doneTimer.current = null;
    }, 1400);
  };

  // gallery-style keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft') {
        cancelAutoplay();
        onNavigate(-1);
      } else if (e.key === 'ArrowRight') {
        cancelAutoplay();
        onNavigate(1);
      } else if (e.key === 'Escape') {
        cancelAutoplay();
        onBack();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (autoplayActiveRef.current) {
          cancelAutoplay();
        } else {
          setPlaying((p) => !p);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNavigate, onBack]);

  // fixed render resolution; CSS scales it to fit the viewport
  const pixelWidth = 1350;

  const saveImage = async () => {
    if (doneTimer.current !== null) {
      window.clearTimeout(doneTimer.current);
      doneTimer.current = null;
    }
    setDone(null);
    setBusy('image');
    try {
      await exportPNG(recipe, data, params, seed, t, undefined, bleed);
      markDone('image');
    } catch {
      /* failed export — no celebration */
    } finally {
      setBusy(null);
    }
  };

  const saveAnimation = async () => {
    if (doneTimer.current !== null) {
      window.clearTimeout(doneTimer.current);
      doneTimer.current = null;
    }
    setDone(null);
    setBusy('animation');
    try {
      await exportVideo(recipe, data, params, seed, duration);
      markDone('animation');
    } catch {
      /* failed export — no celebration */
    } finally {
      setBusy(null);
    }
  };

  const navigate = (dir: number) => {
    cancelAutoplay();
    onNavigate(dir);
  };

  return (
    <div className="detail">
      <button className="nav-arrow" onClick={() => navigate(-1)} title="previous (←)">
        ‹
      </button>

      <div className="stage">
        <div className={`stage-canvas ${canvasFading ? 'fading' : ''}`}>
          <RecipeCanvas
            recipe={recipe}
            data={data}
            params={renderParams}
            seed={renderSeed}
            t={t}
            pixelWidth={pixelWidth}
            draft={playing}
          />
        </div>
        <div className="player">
          <button
            className="play"
            onClick={() => {
              if (autoplayActiveRef.current) {
                cancelAutoplay();
              } else {
                setPlaying((p) => !p);
              }
            }}
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
              cancelAutoplay();
              setPlaying(false);
              setT(parseFloat(e.target.value));
            }}
          />
          <span className="time">{t.toFixed(2)}</span>
        </div>
      </div>

      <button className="nav-arrow" onClick={() => navigate(1)} title="next (→)">
        ›
      </button>

      <div className="panel">
        <div className="placard-head">
          <div className="mobile-nav">
            <button type="button" onClick={() => navigate(-1)} aria-label="previous poster">
              ‹
            </button>
            <span>
              {index + 1} / {total}
            </span>
            <button type="button" onClick={() => navigate(1)} aria-label="next poster">
              ›
            </button>
          </div>
          <h2>{recipe.name}</h2>
        </div>
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
            <button
              className={`${labelSwap === 'image' ? 'label-swapping' : ''} ${done === 'image' ? 'save-done' : ''}`}
              disabled={!!busy}
              onClick={saveImage}
              title="3600×4800 px — 12×16 in at 300 DPI"
            >
              {imageLabel}
            </button>
            <button
              className={`${labelSwap === 'animation' ? 'label-swapping' : ''} ${done === 'animation' ? 'save-done' : ''}`}
              disabled={!!busy}
              onClick={saveAnimation}
              title={`${duration}s MP4, encoded in the browser`}
            >
              {videoLabel}
            </button>
          </div>
          <p className="export-note">print: 12×16 in · 300 DPI &nbsp;·&nbsp; video: {duration}s mp4</p>
          <button
            className="edit-link"
            onClick={() => {
              cancelAutoplay();
              setEditing((e) => !e);
            }}
          >
            {editing ? '✓ done' : '✎ edit parameters'}
          </button>
        </div>
      </div>
    </div>
  );
}
