import { useEffect, useState } from 'react';
import type { RepoDataset, RepoListing } from '../core/schema';
import { recipes } from '../core/registry';
import { fetchDataset, fetchRepos } from './api';
import { Exhibition } from './Exhibition';
import { About } from './About';

export function App() {
  const [repos, setRepos] = useState<RepoListing[]>([]);
  const [repoPath, setRepoPath] = useState<string>('');
  const [data, setData] = useState<RepoDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);

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
    setSelected(0);
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
        <div className="topbar-repo">
          <span className="repo-prefix" aria-hidden>
            ~/
          </span>
          {repos.length === 1 ? (
            <span className="repo-name">{repos[0].name}</span>
          ) : (
            <select value={repoPath} onChange={(e) => setRepoPath(e.target.value)}>
              {repos.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          {data && (
            <span className="stats">
              {data.meta.commitCount} commits · {data.events.length} events ·{' '}
              {Math.round(data.meta.durationDays)} days
            </span>
          )}
        </div>
        <div className="topbar-right">
          <h1>CODEBASE POSTERS</h1>
          <button className="about-link" onClick={() => setAboutOpen(true)}>
            about
          </button>
        </div>
      </div>

      {error && <div className="status">error: {error}</div>}

      {!error && !data && (
        <div className="exhibition skeleton-exhibition">
          <div className="detail">
            <div className="stage">
              <div className="stage-canvas">
                <div className="skeleton-card stage-skeleton" />
              </div>
              <div className="player skeleton-player" />
            </div>
            <div className="panel skeleton-panel">
              <div className="skeleton-note">
                preparing the exhibition for{' '}
                {repos.find((r) => r.path === repoPath)?.name ?? 'this repository'}
              </div>
            </div>
          </div>
          <div className="filmstrip">
            {Array.from({ length: Math.max(10, recipes.length) }, (_, i) => (
              <div key={i} className="filmstrip-item">
                <div className="strip-thumb skeleton">
                  <div className="skeleton-card" style={{ '--i': i } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && <Exhibition data={data} selected={selected} onSelect={setSelected} />}

      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
