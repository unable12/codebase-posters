# Codebase Posters

Generative art posters from local git repositories, inspired by [GenCup](https://www.gencup.art/) —
Zeh Fernandes' World Cup data posters ([how it's made](https://zehfernandes.com/posts/how-i-turned-world-cup-data-into-posters)).

The idea: a codebase's history and structure carry the same dramatic raw material as a football
match — bursts of activity, big moments, opposing forces (additions vs deletions), quiet stretches.
This tool turns that data into posters you can feel before you read.

## What it does

- Pick any local git repo (scans `~/code_base`)
- See it rendered through multiple visualization **recipes** in a gallery
- Click into one: tweak parameters live, change seed, scrub/play the **animation**
  (events replaying over the repo's lifetime)
- Export print-quality PNG (3000×4000) or a PNG frame sequence for video

## Core model

Every recipe is a **pure function of `(data, params, seed, t)`** that fully repaints each call:

- `t = 1` → the finished poster
- sweeping `t` 0→1 → the animation
- same inputs → pixel-identical output (deterministic seeded RNG + noise)

Recipes draw in fixed design units (1500×2000); the host scales for thumbnails, screen, and
high-res export — recipes never know about pixels.

## Data

A Vite dev-server middleware (`server/`) shells out to git and produces a normalized dataset:

- `events[]` — commits + per-file changes, with real-time (`t01`) and sequence (`s01`) positions,
  log-scaled magnitude, top-decile "goals" (gravity attractors)
- `tree` / `files[]` — structure at HEAD with churn/touch/age metrics
- `authors`, `languages`, `totals` — the "possession"-style shares
- `days[]`, `buckets[]` — per-day match slices and a smoothed drama/intensity curve
- `contentSamples[]` — raw file lines for text-as-texture recipes

Extraction is cached in `data-cache/` keyed by HEAD SHA.

## Current recipes

Chrono-Grid Confrontation · Commit Spiral · Heartbeat · Ridgelines · Sunflower ·
Treemap Fresco · One Poster Per Day · Constellations · Rain · Indentation Skyline

## Adding a recipe

Drop one file in `src/recipes/` exporting a `CanvasRecipe` (see `src/core/types.ts`).
It auto-registers in the gallery. Params declared in the recipe's schema get an
auto-generated control panel.

## Run

```
npm install
npm run dev
```

## Layout

```
server/           git extraction (Vite middleware + parsers + derived stats)
src/core/         schema, recipe contract, seeded rng/noise, render host, draw helpers
src/recipes/      one file per visualization — the plugin surface
src/app/          React shell: gallery, detail view, controls, scrubber
src/export/       PNG + frame-sequence export
```
