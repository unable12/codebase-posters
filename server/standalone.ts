// Zero-dependency production server for `npx codebase-posters`.
// Serves the prebuilt frontend and exposes the extraction API for exactly
// one repository, the one the CLI was launched in. Everything stays local:
// binds to loopback only, validates the Host header (DNS-rebinding guard),
// ignores any path parameters, writes nothing to disk.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { basename, extname, join, normalize } from 'node:path';
import { extractRepo } from './extract/derive';
import type { RepoDataset } from '../src/core/schema';

const MAX_COMMITS = 20000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

export interface StandaloneOptions {
  repoPath: string;
  appDir: string;
  port: number;
}

export function startStandalone({ repoPath, appDir, port }: StandaloneOptions): Promise<number> {
  let dataset: Promise<RepoDataset> | null = null;
  const getDataset = () => {
    dataset ??= extractRepo(repoPath, MAX_COMMITS);
    return dataset;
  };

  const server = createServer(async (req, res) => {
    // DNS-rebinding guard: only accept requests addressed to loopback hosts
    const host = (req.headers.host ?? '').split(':')[0];
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
      res.statusCode = 403;
      res.end('forbidden');
      return;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    try {
      if (url.pathname === '/api/repos') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify([{ name: basename(repoPath), path: repoPath, lastCommit: '' }]));
        return;
      }
      if (url.pathname === '/api/extract') {
        // any ?path is deliberately ignored — this server knows one repo
        const data = await getDataset();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
        return;
      }

      // static frontend, with SPA fallback to index.html
      let filePath = normalize(url.pathname).replace(/^([/\\])+/, '');
      if (filePath === '' || filePath.includes('..')) filePath = 'index.html';
      let body: Buffer;
      let ext = extname(filePath);
      try {
        body = await readFile(join(appDir, filePath));
      } catch {
        body = await readFile(join(appDir, 'index.html'));
        ext = '.html';
      }
      res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
      res.end(body);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
  });
}
