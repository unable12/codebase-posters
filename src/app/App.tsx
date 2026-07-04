import { useEffect, useState } from 'react';
import type { RepoDataset, RepoListing } from '../core/schema';
import type { Recipe } from '../core/types';
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
  const [selected, setSelected] = useState<Recipe | null>(null);

  useEffect(() => {
    fetchRepos()
      .then((r) => {
        setRepos(r);
        const preferred =
          r.find((x) => x.name === 'lighthouse') ?? r[0];
        if (preferred) setRepoPath(preferred.path);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!repoPath) return;
    setData(null);
    setError(null);
    fetchDataset(repoPath)
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [repoPath]);

  return (
    <div className="app">
      <div className="topbar">
        <h1>CODEBASE POSTERS</h1>
        <select value={repoPath} onChange={(e) => setRepoPath(e.target.value)}>
          {repos.map((r) => (
            <option key={r.path} value={r.path}>
              {r.name}
            </option>
          ))}
        </select>
        {data && (
          <span style={{ fontSize: 12, color: '#888' }}>
            {data.meta.commitCount} commits · {data.events.length} events ·{' '}
            {Math.round(data.meta.durationDays)} days
          </span>
        )}
      </div>

      {error && <div className="status">error: {error}</div>}
      {!error && !data && <div className="status">extracting…</div>}

      {data && !selected && (
        <div className="gallery">
          {recipes.map((r) => (
            <button key={r.id} className="thumb" onClick={() => setSelected(r)}>
              <RecipeCanvas
                recipe={r}
                data={data}
                params={defaultParams(r.params)}
                seed={1}
                t={1}
                pixelWidth={480}
              />
              <div className="label">
                {r.name} · {r.family}
              </div>
            </button>
          ))}
        </div>
      )}

      {data && selected && <Detail recipe={selected} data={data} onBack={() => setSelected(null)} />}
    </div>
  );
}
