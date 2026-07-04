import type {
  ContentSample,
  DaySlice,
  FileStat,
  RepoDataset,
  RepoEvent,
  TimeBucket,
  TreeNode,
} from '../../src/core/schema';
import { readFileAtHead, readLog, readTree, headSha } from './gitlog';
import { basename } from 'node:path';

const BUCKET_COUNT = 64;
const CONTENT_SAMPLE_FILES = 40;
const CONTENT_SAMPLE_LINES = 120;

function extOf(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

/** Deterministic tiny hash → [0,1), used to spread file-changes within a commit. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export async function extractRepo(repoPath: string): Promise<RepoDataset> {
  const [commits, treeEntries, head] = await Promise.all([
    readLog(repoPath),
    readTree(repoPath),
    headSha(repoPath),
  ]);
  if (commits.length === 0) throw new Error(`no commits in ${repoPath}`);

  const first = new Date(commits[0].timestamp).getTime();
  const last = new Date(commits[commits.length - 1].timestamp).getTime();
  const span = Math.max(1, last - first);
  const toT01 = (iso: string) => (new Date(iso).getTime() - first) / span;

  // ---- events ----
  const events: RepoEvent[] = [];
  // ε for spreading file-changes inside their commit: half the min gap between commits
  const epsilon = 0.4 / Math.max(commits.length, 1) / 1;
  for (const c of commits) {
    const t = toT01(c.timestamp);
    const add = c.changes.reduce((s, ch) => s + ch.additions, 0);
    const del = c.changes.reduce((s, ch) => s + ch.deletions, 0);
    events.push({
      kind: 'commit',
      t01: t,
      s01: 0,
      timestamp: c.timestamp,
      sha: c.sha,
      author: c.author,
      subject: c.subject,
      additions: add,
      deletions: del,
      magnitude: 0,
      isGoal: false,
    });
    for (const ch of c.changes) {
      events.push({
        kind: 'file-change',
        t01: Math.min(1, t + epsilon * hash01(c.sha + ch.path)),
        s01: 0,
        timestamp: c.timestamp,
        sha: c.sha,
        author: c.author,
        path: ch.path,
        ext: extOf(ch.path),
        additions: ch.additions,
        deletions: ch.deletions,
        magnitude: 0,
        isGoal: false,
      });
    }
  }
  events.sort((a, b) => a.t01 - b.t01 || a.sha.localeCompare(b.sha));
  events.forEach((e, i) => (e.s01 = events.length > 1 ? i / (events.length - 1) : 0));

  // magnitude: log-scaled churn normalized per kind
  for (const kind of ['commit', 'file-change'] as const) {
    const ofKind = events.filter((e) => e.kind === kind);
    const max = Math.max(...ofKind.map((e) => Math.log1p(e.additions + e.deletions)), 1e-9);
    for (const e of ofKind) e.magnitude = Math.log1p(e.additions + e.deletions) / max;
  }
  // goals: top-decile commits by magnitude
  const commitEvents = events.filter((e) => e.kind === 'commit');
  const sortedMags = commitEvents.map((e) => e.magnitude).sort((a, b) => a - b);
  const goalCut = sortedMags[Math.floor(sortedMags.length * 0.9)] ?? 1;
  for (const e of commitEvents) e.isGoal = e.magnitude >= goalCut && e.magnitude > 0;

  // ---- per-file stats ----
  const fileMap = new Map<string, FileStat>();
  for (const e of events) {
    if (e.kind !== 'file-change' || !e.path) continue;
    let f = fileMap.get(e.path);
    if (!f) {
      f = {
        path: e.path,
        ext: e.ext ?? '',
        bytes: 0,
        churn: 0,
        touches: 0,
        firstT01: e.t01,
        lastT01: e.t01,
      };
      fileMap.set(e.path, f);
    }
    f.churn += e.additions + e.deletions;
    f.touches += 1;
    f.lastT01 = e.t01;
  }
  for (const te of treeEntries) {
    const f = fileMap.get(te.path);
    if (f) f.bytes = te.bytes;
  }
  // files present at HEAD but never in log (e.g. from merges) still get stats
  for (const te of treeEntries) {
    if (!fileMap.has(te.path)) {
      fileMap.set(te.path, {
        path: te.path,
        ext: extOf(te.path),
        bytes: te.bytes,
        churn: 0,
        touches: 0,
        firstT01: 0,
        lastT01: 0,
      });
    }
  }
  const files = [...fileMap.values()];

  // ---- tree (only files at HEAD) ----
  const root: TreeNode = {
    name: '/',
    path: '',
    type: 'dir',
    children: [],
    metrics: { bytes: 0, churn: 0, touches: 0, lastTouchedT01: 0, firstTouchedT01: 1, depth: 0 },
  };
  for (const te of treeEntries) {
    const stat = fileMap.get(te.path)!;
    const parts = te.path.split('/');
    let node = root;
    for (let d = 0; d < parts.length; d++) {
      const isFile = d === parts.length - 1;
      const childPath = parts.slice(0, d + 1).join('/');
      let child = node.children!.find((c) => c.name === parts[d]);
      if (!child) {
        child = {
          name: parts[d],
          path: childPath,
          type: isFile ? 'file' : 'dir',
          children: isFile ? undefined : [],
          metrics: {
            bytes: 0,
            churn: 0,
            touches: 0,
            lastTouchedT01: 0,
            firstTouchedT01: 1,
            depth: d + 1,
            ext: isFile ? stat.ext : undefined,
          },
        };
        node.children!.push(child);
      }
      child.metrics.bytes += te.bytes;
      child.metrics.churn += stat.churn;
      child.metrics.touches += stat.touches;
      child.metrics.lastTouchedT01 = Math.max(child.metrics.lastTouchedT01, stat.lastT01);
      child.metrics.firstTouchedT01 = Math.min(child.metrics.firstTouchedT01, stat.firstT01);
      node = child;
    }
    root.metrics.bytes += te.bytes;
    root.metrics.churn += stat.churn;
    root.metrics.touches += stat.touches;
    root.metrics.lastTouchedT01 = Math.max(root.metrics.lastTouchedT01, stat.lastT01);
    root.metrics.firstTouchedT01 = Math.min(root.metrics.firstTouchedT01, stat.firstT01);
  }

  // ---- aggregates ----
  const authorMap = new Map<string, { commits: number; additions: number; deletions: number }>();
  for (const c of commits) {
    const a = authorMap.get(c.author) ?? { commits: 0, additions: 0, deletions: 0 };
    a.commits += 1;
    for (const ch of c.changes) {
      a.additions += ch.additions;
      a.deletions += ch.deletions;
    }
    authorMap.set(c.author, a);
  }
  const authors = [...authorMap.entries()]
    .map(([name, a]) => ({ name, ...a, share: a.commits / commits.length }))
    .sort((a, b) => b.commits - a.commits);

  const langMap = new Map<string, { files: number; bytes: number }>();
  for (const f of files) {
    const l = langMap.get(f.ext) ?? { files: 0, bytes: 0 };
    l.files += 1;
    l.bytes += f.bytes;
    langMap.set(f.ext, l);
  }
  const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
  const languages = [...langMap.entries()]
    .map(([ext, l]) => ({ ext, ...l, share: totalBytes ? l.bytes / totalBytes : 0 }))
    .sort((a, b) => b.bytes - a.bytes);

  const totalAdd = events.filter((e) => e.kind === 'commit').reduce((s, e) => s + e.additions, 0);
  const totalDel = events.filter((e) => e.kind === 'commit').reduce((s, e) => s + e.deletions, 0);

  // ---- day slices ----
  const dayMap = new Map<string, DaySlice>();
  for (const c of commits) {
    const date = c.timestamp.slice(0, 10);
    let d = dayMap.get(date);
    if (!d) {
      d = { date, t01Start: 1, t01End: 0, commits: 0, additions: 0, deletions: 0, files: [], drama: 0 };
      dayMap.set(date, d);
    }
    const t = toT01(c.timestamp);
    d.t01Start = Math.min(d.t01Start, t);
    d.t01End = Math.max(d.t01End, t);
    d.commits += 1;
    for (const ch of c.changes) {
      d.additions += ch.additions;
      d.deletions += ch.deletions;
      if (!d.files.includes(ch.path)) d.files.push(ch.path);
    }
  }
  const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // ---- buckets + drama curve ----
  const buckets: TimeBucket[] = Array.from({ length: BUCKET_COUNT }, (_, i) => ({
    t01: (i + 0.5) / BUCKET_COUNT,
    churn: 0,
    commits: 0,
    intensity: 0,
  }));
  const gaps: number[] = [];
  for (let i = 1; i < commitEvents.length; i++) gaps.push(commitEvents[i].t01 - commitEvents[i - 1].t01);
  const medianGap = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 1;
  const burst = new Array(BUCKET_COUNT).fill(0);
  for (let i = 0; i < commitEvents.length; i++) {
    const e = commitEvents[i];
    const bi = Math.min(BUCKET_COUNT - 1, Math.floor(e.t01 * BUCKET_COUNT));
    buckets[bi].churn += e.additions + e.deletions;
    buckets[bi].commits += 1;
    if (i > 0) {
      const gap = e.t01 - commitEvents[i - 1].t01;
      if (gap < medianGap * 0.5) burst[bi] += 1;
    }
  }
  const maxChurn = Math.max(...buckets.map((b) => Math.log1p(b.churn)), 1e-9);
  const maxCommits = Math.max(...buckets.map((b) => b.commits), 1e-9);
  const maxBurst = Math.max(...burst, 1e-9);
  let raw = buckets.map(
    (b, i) =>
      (Math.log1p(b.churn) / maxChurn) * 0.5 + (b.commits / maxCommits) * 0.3 + (burst[i] / maxBurst) * 0.2,
  );
  // gaussian smooth, σ≈2 buckets
  const kernel = [0.06, 0.24, 0.4, 0.24, 0.06];
  const smoothed = raw.map((_, i) =>
    kernel.reduce((s, k, j) => s + k * (raw[Math.min(BUCKET_COUNT - 1, Math.max(0, i + j - 2))] ?? 0), 0),
  );
  const maxSm = Math.max(...smoothed, 1e-9);
  buckets.forEach((b, i) => (b.intensity = smoothed[i] / maxSm));
  // day drama = mean intensity over the day's span
  for (const d of days) {
    const inRange = buckets.filter((b) => b.t01 >= d.t01Start - 0.01 && b.t01 <= d.t01End + 0.01);
    d.drama = inRange.length ? inRange.reduce((s, b) => s + b.intensity, 0) / inRange.length : 0;
  }

  // ---- content samples: most-churned text files at HEAD ----
  const TEXT_EXTS = new Set([
    'md', 'txt', 'js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'sh', 'yml', 'yaml', 'toml', 'svg',
  ]);
  const candidates = files
    .filter((f) => f.bytes > 0 && f.bytes < 200000 && TEXT_EXTS.has(f.ext))
    .sort((a, b) => b.churn - a.churn)
    .slice(0, CONTENT_SAMPLE_FILES);
  const contentSamples: ContentSample[] = [];
  for (const f of candidates) {
    try {
      const text = await readFileAtHead(repoPath, f.path);
      const lines = text.split('\n').slice(0, CONTENT_SAMPLE_LINES).map((raw) => {
        const indent = raw.match(/^[\t ]*/)?.[0].replace(/\t/g, '  ').length ?? 0;
        return { text: raw.slice(0, 200), length: raw.length, indent };
      });
      contentSamples.push({
        path: f.path,
        ext: f.ext,
        lines,
        maxLineLength: Math.max(...lines.map((l) => l.length), 1),
      });
    } catch {
      // binary or unreadable — skip
    }
  }

  const name = basename(repoPath);
  return {
    schemaVersion: 1,
    meta: {
      name,
      path: repoPath,
      headSha: head,
      firstCommit: commits[0].timestamp,
      lastCommit: commits[commits.length - 1].timestamp,
      durationDays: span / 86400000,
      commitCount: commits.length,
      extractedAt: new Date().toISOString(),
    },
    events,
    tree: root,
    files,
    authors,
    languages,
    totals: {
      additions: totalAdd,
      deletions: totalDel,
      addShare: totalAdd + totalDel ? totalAdd / (totalAdd + totalDel) : 0.5,
      filesTouched: files.filter((f) => f.touches > 0).length,
      avgFilesPerCommit: commits.length
        ? commits.reduce((s, c) => s + c.changes.length, 0) / commits.length
        : 0,
    },
    days,
    buckets,
    contentSamples,
  };
}
