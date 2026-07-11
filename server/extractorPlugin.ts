import type { Plugin } from 'vite';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { extractRepo } from './extract/derive';
import { headSha } from './extract/gitlog';
import type { RepoListing } from '../src/core/schema';

const SCAN_ROOTS = (process.env.SCAN_ROOTS ?? join(homedir(), 'code_base'))
  .split(/[:;]/)
  .map((p) => p.trim())
  .filter(Boolean);
const CACHE_DIR = resolve(import.meta.dirname, '..', 'data-cache');

async function listRepos(): Promise<RepoListing[]> {
  const repos: RepoListing[] = [];
  for (const root of SCAN_ROOTS) {
    let entries: string[] = [];
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }
    for (const name of entries) {
      const path = join(root, name);
      if (!existsSync(join(path, '.git'))) continue;
      try {
        const s = await stat(path);
        if (!s.isDirectory()) continue;
        repos.push({ name, path, lastCommit: '' });
      } catch {
        /* skip */
      }
    }
  }
  repos.sort((a, b) => a.name.localeCompare(b.name));
  return repos;
}

export function extractorPlugin(): Plugin {
  return {
    name: 'repo-extractor',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        try {
          if (url.pathname === '/api/repos') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(await listRepos()));
            return;
          }
          if (url.pathname === '/api/extract') {
            const repoPath = url.searchParams.get('path');
            if (!repoPath || !existsSync(join(repoPath, '.git'))) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'not a git repo: ' + repoPath }));
              return;
            }
            const sha = await headSha(repoPath);
            await mkdir(CACHE_DIR, { recursive: true });
            const cacheFile = join(CACHE_DIR, `${basename(repoPath)}-${sha.slice(0, 12)}.json`);
            res.setHeader('Content-Type', 'application/json');
            if (existsSync(cacheFile)) {
              res.end(await readFile(cacheFile, 'utf8'));
              return;
            }
            const dataset = await extractRepo(repoPath);
            const json = JSON.stringify(dataset);
            await writeFile(cacheFile, json);
            res.end(json);
            return;
          }
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
          return;
        }
        next();
      });
    },
  };
}
