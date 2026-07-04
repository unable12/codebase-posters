// Normalized dataset extracted from a git repo. Shared by server/ and src/.

export interface RepoMeta {
  name: string;
  path: string;
  headSha: string;
  firstCommit: string; // ISO
  lastCommit: string; // ISO
  durationDays: number;
  commitCount: number;
  extractedAt: string;
}

export interface RepoEvent {
  kind: 'commit' | 'file-change';
  /** Real-time position in [0,1] between first and last commit. */
  t01: number;
  /** Sequence position in [0,1] — evenly spaced by event index. */
  s01: number;
  timestamp: string;
  sha: string;
  author: string;
  subject?: string;
  path?: string;
  ext?: string;
  additions: number;
  deletions: number;
  /** Log-scaled churn normalized to [0,1] across the dataset. */
  magnitude: number;
  /** Top-decile magnitude commits — gravity attractors. */
  isGoal: boolean;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  children?: TreeNode[];
  metrics: {
    bytes: number;
    churn: number;
    touches: number;
    /** t01 of the last event touching this node (0 if never touched in history). */
    lastTouchedT01: number;
    /** t01 of the first event touching this node. */
    firstTouchedT01: number;
    depth: number;
    ext?: string;
  };
}

export interface FileStat {
  path: string;
  ext: string;
  bytes: number;
  churn: number;
  touches: number;
  firstT01: number;
  lastT01: number;
}

export interface DaySlice {
  date: string; // YYYY-MM-DD
  t01Start: number;
  t01End: number;
  commits: number;
  additions: number;
  deletions: number;
  files: string[];
  drama: number;
}

export interface TimeBucket {
  t01: number; // bucket center
  churn: number;
  commits: number;
  /** Smoothed drama curve value in [0,1]. */
  intensity: number;
}

export interface ContentSample {
  path: string;
  ext: string;
  lines: { text: string; length: number; indent: number }[];
  maxLineLength: number;
}

export interface RepoDataset {
  schemaVersion: 1;
  meta: RepoMeta;
  events: RepoEvent[];
  tree: TreeNode;
  files: FileStat[];
  authors: { name: string; commits: number; additions: number; deletions: number; share: number }[];
  languages: { ext: string; files: number; bytes: number; share: number }[];
  totals: {
    additions: number;
    deletions: number;
    /** additions / (additions + deletions) — the "possession" ratio. */
    addShare: number;
    filesTouched: number;
    avgFilesPerCommit: number;
  };
  days: DaySlice[];
  buckets: TimeBucket[];
  contentSamples: ContentSample[];
}

export interface RepoListing {
  name: string;
  path: string;
  lastCommit: string;
}
