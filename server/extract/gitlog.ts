import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface RawFileChange {
  path: string;
  additions: number;
  deletions: number;
}

export interface RawCommit {
  sha: string;
  author: string;
  timestamp: string; // ISO
  subject: string;
  changes: RawFileChange[];
}

const SEP = '';

export async function readLog(repoPath: string): Promise<RawCommit[]> {
  const { stdout } = await run(
    'git',
    ['log', '--numstat', '--no-renames', `--format=${SEP}%H${SEP}%an${SEP}%aI${SEP}%s`],
    { cwd: repoPath, maxBuffer: 64 * 1024 * 1024 },
  );

  const commits: RawCommit[] = [];
  let current: RawCommit | null = null;

  for (const line of stdout.split('\n')) {
    if (line.startsWith(SEP)) {
      const [, sha, author, timestamp, subject] = line.split(SEP);
      current = { sha, author, timestamp, subject, changes: [] };
      commits.push(current);
    } else if (current && line.trim()) {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (m) {
        current.changes.push({
          additions: m[1] === '-' ? 0 : parseInt(m[1], 10),
          deletions: m[2] === '-' ? 0 : parseInt(m[2], 10),
          path: m[3],
        });
      }
    }
  }

  commits.reverse(); // oldest first
  return commits;
}

export async function headSha(repoPath: string): Promise<string> {
  const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
  return stdout.trim();
}

export interface RawTreeEntry {
  path: string;
  bytes: number;
}

export async function readTree(repoPath: string): Promise<RawTreeEntry[]> {
  const { stdout } = await run('git', ['ls-tree', '-r', '-l', 'HEAD'], {
    cwd: repoPath,
    maxBuffer: 64 * 1024 * 1024,
  });
  const entries: RawTreeEntry[] = [];
  for (const line of stdout.split('\n')) {
    // <mode> blob <sha> <size>\t<path>
    const m = line.match(/^\S+ blob \S+\s+(\d+|-)\t(.+)$/);
    if (m) entries.push({ bytes: m[1] === '-' ? 0 : parseInt(m[1], 10), path: m[2] });
  }
  return entries;
}

export async function readFileAtHead(repoPath: string, filePath: string, maxBytes = 32768): Promise<string> {
  const { stdout } = await run('git', ['show', `HEAD:${filePath}`], {
    cwd: repoPath,
    maxBuffer: maxBytes * 4,
  });
  return stdout.slice(0, maxBytes);
}
