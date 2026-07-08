# Codebase Posters — `npx codebase-posters`: one command, your repo as art

> **Status:** implemented and verified in the working tree (standalone server,
> CLI, packaging, single-repo UI, README). Not yet committed or published.
> The only remaining step is the user's own `npm login` + `npm publish`.

## Context

The gallery is feature-complete locally (10 recipes, contact sheet, 300-DPI print export, in-browser MP4). Now make it distributable the way Paxel/YC did: a developer runs **one command inside any git repo**, their browser opens with THEIR codebase rendered as posters, and they save/share the print or video. Package name `codebase-posters` is **available on npm** (verified 404 on registry).

Non-negotiables (the skeptical-developer checklist): nothing leaves the machine, no telemetry, no disk writes by the server, no Docker/Puppeteer, tiny download, localhost-only with rebinding protection, git via `execFile` only (already true).

Note: the working tree has uncommitted changes from previous rounds (user commits himself). Continue that: **no commits, no publish** — prepare everything; the user publishes.

## Architecture

```
npx codebase-posters [path] [--port N] [--no-open]
        │
   bin/cli.mjs            resolve repo (arg or `git rev-parse --show-toplevel`),
        │                 friendly error if not a git repo
        ▼
   dist/server.mjs        zero-dep node:http server, bound to 127.0.0.1:<random free port>
        ├─ serves dist/app/            (prebuilt static frontend)
        ├─ GET /api/repos              → [ the one launched repo ]
        └─ GET /api/extract            → dataset for THAT repo only (?path ignored),
                                          extracted once, cached in memory
        ▼
   opens http://127.0.0.1:<port>       (child_process open/xdg-open/start — no dep)
```

The gallery, detail view, contact sheet, and both Save buttons work unchanged — they're all client-side.

## Work items

### 1. Standalone server — `server/standalone.ts`
Reuses `server/extract/derive.ts` + `gitlog.ts` verbatim. Node `http` only:
- Static file serving of the built app (index.html, hashed assets; correct MIME for js/css/html; SPA fallback to index.html).
- `GET /api/repos` → `[{ name, path, lastCommit }]` for the single launched repo.
- `GET /api/extract` → in-memory dataset (extract on first request; no `data-cache/` writes in this mode).
- **Security**: listen on `127.0.0.1`; reject requests whose `Host` header isn't `127.0.0.1[:port]`/`localhost[:port]` with 403 (DNS-rebinding guard); never honor a `path` query param.
- **Heavy-repo guard**: cap extraction at the most recent 20k commits (`git log -n 20000`); log a note when capped.

### 2. CLI entry — `bin/cli.mjs`
Plain JS (no build step for the bin). Parse `[path]`, `--port`, `--no-open`, `--help`. Resolve the git root via `execFile('git', ['rev-parse', '--show-toplevel'])`; clear error if absent ("not a git repository — run this inside a repo"). Pick a free port. Print the trust banner:

```
CODEBASE POSTERS — your repository as generative art
  repo:    /path/to/repo
  gallery: http://127.0.0.1:5317
  privacy: everything runs locally. nothing is uploaded, nothing is written.
```

Then open the browser (`open` / `xdg-open` / `start` by platform) unless `--no-open`.

### 3. Build + packaging
- `vite.config.ts`: `build.outDir = 'dist/app'`.
- New script `build:server`: bundle `server/standalone.ts` with **esbuild** (already present via Vite) → `dist/server.mjs` (`--bundle --platform=node --format=esm`).
- `package.json`: `"name": "codebase-posters"`, `"version": "0.1.0"`, `"bin": { "codebase-posters": "bin/cli.mjs" }`, `"files": ["bin", "dist"]`, `"engines": { "node": ">=18" }`, `"prepublishOnly": "npm run build"` where `build` = app + server builds (keep `tsc -b` first). Add `description`, `keywords`, `license` (MIT), `repository` placeholder.
- Verify tarball with `npm pack` — target well under 1 MB (frontend bundle + one server file; react+fflate+mp4-muxer are bundled into the app, not runtime deps... they stay as `dependencies` but `npm pack` ships only `files`; move ALL current deps to `devDependencies` since everything is bundled → **npx installs zero transitive deps** — the whole trust+speed story).

### 4. Frontend polish for single-repo mode
- `App.tsx`: when `repos.length === 1`, render the repo name as plain text instead of a one-item dropdown.
- README: rewrite top section around `npx codebase-posters`, add a **Privacy** section (local-only, what is read, what is never sent), keep dev instructions below.

### 5. Publish preparation (user's step)
- Dry-run: `npm pack`, inspect contents + size.
- Full rehearsal: install the tarball in a scratch dir (`npm i -g ./codebase-posters-0.1.0.tgz` or `npx ./tgz`) and run against a real repo.
- Actual `npm publish` is left to the user (needs their npm login). Document the two commands in README.

## What we're NOT doing (v1 scope)
- No headless `--save poster.png` (needs a browser engine in Node; the browser IS our renderer). Future: `--save` via the user's own Chrome over CDP.
- No hosted web version, no upload/share backend — the share artifact is the exported PNG/MP4.
- No multi-repo scanning in npx mode (scanning someone's home directory uninvited is exactly what makes devs distrust a tool).

## Verification
1. `npm run build` → dist/app + dist/server.mjs exist; `npx tsc -b` clean.
2. `node bin/cli.mjs ~/code_base/progress --no-open` → banner prints; `curl -s http://127.0.0.1:<port>/api/repos` returns exactly one repo.
3. Security checks: `curl -H 'Host: evil.com' …/api/extract` → 403; `curl '…/api/extract?path=/etc'` → serves the launched repo's data regardless (param ignored); server unreachable from non-loopback (bound address check).
4. Open the served URL in the preview browser: gallery renders all 10 recipes from the static build; detail view, contact sheet, Save print, and Save video all work (verifies the production bundle, not just dev).
5. `npm pack` → inspect file list (bin + dist only) and total size.
6. Rehearse the real flow: run the packed tarball from a scratch directory against a repo.
7. No commits, no publish — leave everything for the user.

## Remaining step

Everything above has been implemented and verified (build clean, CLI banner + API tested, security guards confirmed, `npm pack` inspected, full tarball rehearsal run against a real repo in a scratch directory). What's left, by design, is yours to do when ready:

```
npm login        # once
npm publish      # from the repo root — prepublishOnly rebuilds automatically
```

Small housekeeping to consider before publishing:
- `tsconfig.tsbuildinfo` is currently tracked in git — worth adding to `.gitignore` (it's a build artifact).
- The `repository` field in `package.json` is unset — point it at your GitHub URL so the npm package page links somewhere.
