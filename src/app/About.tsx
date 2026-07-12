import { useEffect } from 'react';

interface Props {
  onClose: () => void;
}

export function About({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="about-overlay" onClick={onClose} role="dialog" aria-label="about codebase posters">
      <div className="about-card" onClick={(e) => e.stopPropagation()}>
        <button className="about-close" onClick={onClose} aria-label="close">
          ×
        </button>
        <h1 className="about-wordmark">CODEBASE POSTERS</h1>
        <div className="about-body">
          <p>writing code today is art.</p>
          <p>
            so I asked: what does a codebase look like, hung on a wall?
          </p>
          <p>
            every repository has a shape. storms of additions and cleanup, working
            days like calendars, constellations committed at 2am. this paints them:
            locally, from your git history, in one command.
          </p>
          <p className="about-command">npx codebase-posters</p>
          <p className="about-credits">
            made by <a href="https://x.com/unable0_">kamil</a>
            <span aria-hidden> · </span>
            inspired by{' '}
            <a href="https://zehfernandes.com/posts/how-i-turned-world-cup-data-into-posters">
              zeh fernandes&rsquo; gencup
            </a>
            <span aria-hidden> · </span>
            <a href="https://github.com/unable12/codebase-posters">source</a>
          </p>
        </div>
      </div>
    </div>
  );
}
