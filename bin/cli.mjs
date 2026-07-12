#!/usr/bin/env node
// codebase-posters — your repository as generative art.
// Everything runs locally: nothing is uploaded, nothing is written to disk.

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
codebase-posters · your repository as generative art

usage:
  npx codebase-posters [path] [options]

  path         repository to visualize (default: current directory)

options:
  --port <n>   port to serve on (default: random free port)
  --no-open    don't open the browser automatically
  --version    print version and exit
  --help       show this help

privacy:
  everything runs locally. your code and git history never leave
  your machine. no uploads, no telemetry, no disk writes.

made by kamil · x.com/unable0_
`);
  process.exit(0);
}

const portFlag = args.indexOf('--port');
const port = portFlag >= 0 ? parseInt(args[portFlag + 1], 10) : 0;
const noOpen = args.includes('--no-open');
const pathArg = args.find((a, i) => !a.startsWith('--') && (portFlag < 0 || i !== portFlag + 1));

const startDir = resolve(pathArg ?? process.cwd());

let repoPath;
try {
  const { stdout } = await run('git', ['rev-parse', '--show-toplevel'], { cwd: startDir });
  repoPath = stdout.trim();
} catch {
  console.error(`\n  not a git repository: ${startDir}`);
  console.error('  run this inside a repo, or pass a path: npx codebase-posters ~/my-project\n');
  process.exit(1);
}

try {
  await run('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
} catch {
  console.error('\n  this repository has no commits yet. make one, then paint it.\n');
  process.exit(1);
}

const { startStandalone } = await import(join(here, '..', 'dist', 'server.mjs'));
const actualPort = await startStandalone({
  repoPath,
  appDir: join(here, '..', 'dist', 'app'),
  port: Number.isFinite(port) ? port : 0,
});

const url = `http://127.0.0.1:${actualPort}`;
console.log(`
  CODEBASE POSTERS · your repository as generative art

  repo:     ${repoPath}
  gallery:  ${url} (localhost only)
  reads:    commit history and file tree, via your local git
  privacy:  nothing is uploaded, nothing is written, no telemetry

  press ctrl+c to close the gallery.
`);

if (!noOpen) {
  if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url], () => {
      /* if the browser doesn't open, the URL is printed above */
    });
  } else {
    execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], () => {
      /* if the browser doesn't open, the URL is printed above */
    });
  }
}
