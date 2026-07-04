import { useEffect, useState } from 'react';
import type { RepoDataset, RepoListing } from '../core/schema';
import { defaultParams } from '../core/types';
import { recipes } from '../core/registry';
import { fetchDataset, fetchRepos } from './api';
import { RecipeCanvas } from './RecipeCanvas';
import { Detail } from './Detail';

export function App() {
  const [repos, setRepos] = useState<RepoListing[]>([]);
  const [repoPath, setRepoPath] = useState<string>('');
  const [data, setData] = useState<RepoDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    fetchRepos()
      .then((r) => {
        setRepos(r);
        const preferred = r.find((x) => x.name === 'lighthouse') ?? r[0];
        if (preferred) setRepoPath(preferred.path);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!repoPath) return;
    // stale guard: a slow extraction must not overwrite a newer selection
    let stale = false;
    setData(null);
    setError(null);
    fetchDataset(repoPath)
      .then((d) => {
        if (!stale) setData(d);
      })
      .catch((e) => {
        if (!stale) setError(String(e));
      });
    return () => {
      stale = true;
    };
  }, [repoPath]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-side">
          {selected !== null && (
            <button className="back-link" onClick={() => setSelected(null)}>
              ← gallery
            </button>
          )}
        </div>
        <div className="topbar-center">
          <h1>CODEBASE POSTERS</h1>
          <select value={repoPath} onChange={(e) => setRepoPath(e.target.value)}>
            {repos.map((r) => (
              <option key={r.path} value={r.path}>
                {r.name}
              </option>
            ))}
          </select>
          {data && (
            <span className="stats">
              {data.meta.commitCount} commits · {data.events.length} events ·{' '}
              {Math.round(data.meta.durationDays)} days
            </span>
          )}
        </div>
        <div className="topbar-side dots">
          {selected !== null &&
            recipes.map((r, i) => (
              <button
                key={r.id}
                className={`dot ${i === selected ? 'on' : ''}`}
                title={r.name}
                onClick={() => setSelected(i)}
              />
            ))}
        </div>
      </div>

      {error && <div className="status">error: {error}</div>}
      {!error && !data && (
        <div className="gallery">
          <div className="skeleton-note">
            composing posters from {repos.find((r) => r.path === repoPath)?.name ?? 'repository'}
            <span className="ellipsis" />
          </div>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="thumb skeleton">
              <div className="skeleton-card" />
            </div>
          ))}
        </div>
      )}

      {data && selected === null && (
        <div className="gallery">
          {recipes.map((r, i) => (
            <button key={r.id} className="thumb" onClick={() => setSelected(i)}>
              <RecipeCanvas
                recipe={r}
                data={data}
                params={defaultParams(r.params)}
                seed={1}
                t={1}
                pixelWidth={480}
                queued
                quality={0.4}
              />
              <div className="label">
                {r.name} · {r.family}
              </div>
            </button>
          ))}
        </div>
      )}

      {data && selected !== null && (
        <Detail
          key={recipes[selected].id}
          recipe={recipes[selected]}
          data={data}
          onBack={() => setSelected(null)}
          onNavigate={(dir) => setSelected((selected + dir + recipes.length) % recipes.length)}
        />
      )}
    </div>
  );
}
