# Codebase Posters

**Your repository as generative art.** Run one command inside any git repo and
watch your codebase paint itself into a poster — commit storms, working-day
calendars, the project's heartbeat, your circadian coding rhythm.

```
npx codebase-posters
```

Your browser opens a gallery of 10 posters generated from *your* repo's history
and structure. Click into any piece, watch it paint itself, pick a variant you
like from the contact sheet, then:

- **Save print** — 3600×4800 PNG (12×16 in at 300 DPI, optional 3 mm bleed)
- **Save video** — the painting animation as an MP4, encoded in your browser

## Privacy

Everything runs locally. The tool:

- reads your git history (`git log`, `git ls-tree`) and samples up to 40 text
  files from HEAD to use as texture — all via local git commands
- serves the gallery on `127.0.0.1` only, with a random port and host-header
  validation; the API can only see the one repo you launched it in
- makes **zero network requests**, sends **no telemetry**, and writes
  **nothing to disk** — the extracted data lives in memory and dies with the process

## The posters

Chrono-Grid Confrontation · Commit Spiral · Heartbeat · Ridgelines · Sunflower ·
Treemap Fresco · One Poster Per Day · Constellations · Rain · Indentation Skyline

Each is a pure function of `(repo data, parameters, seed, time)`: `t = 1` is the
finished poster, sweeping `t` is the animation. Same inputs, same pixels — your
poster is reproducible.

Inspired by [GenCup](https://www.gencup.art/) — Zeh Fernandes' World Cup data
posters ([how it's made](https://zehfernandes.com/posts/how-i-turned-world-cup-data-into-posters)).

## Development

```
npm install
npm run dev        # dev server with repo picker (scans ~/code_base)
npm run build      # dist/app (frontend) + dist/server.mjs (standalone server)
node bin/cli.mjs   # run the npx experience locally
```

### Layout

```
bin/cli.mjs        npx entry: resolve repo, start server, open browser
server/            git extraction + standalone production server + Vite dev middleware
src/core/          schema, recipe contract, seeded rng/noise, render host, draw helpers
src/recipes/       one file per poster — the plugin surface
src/app/           React shell: gallery, detail view, contact sheet, controls
src/export/        print PNG + MP4 (WebCodecs) + PNG-frames fallback
```

### Adding a recipe

Drop one file in `src/recipes/` exporting a `CanvasRecipe` (see `src/core/types.ts`).
It auto-registers in the gallery, with an auto-generated control panel from its
param schema.

### Publishing

```
npm run build
npm pack           # inspect the tarball
npm publish
```
