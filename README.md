<p align="center">
  <img src="https://raw.githubusercontent.com/unable12/codebase-posters/main/docs/posters/react-chrono-grid.png" width="30%" alt="react chrono-grid" />
  <img src="https://raw.githubusercontent.com/unable12/codebase-posters/main/docs/posters/zod-constellations.png" width="30%" alt="zod constellations" />
  <img src="https://raw.githubusercontent.com/unable12/codebase-posters/main/docs/posters/vite-heartbeat.png" width="30%" alt="vite heartbeat" />
</p>

# codebase posters

[![npm version](https://img.shields.io/npm/v/codebase-posters?style=flat-square&color=2a4fd7)](https://www.npmjs.com/package/codebase-posters)
[![npm downloads](https://img.shields.io/npm/dm/codebase-posters?style=flat-square&color=2a4fd7)](https://www.npmjs.com/package/codebase-posters)

every repository has a shape.
this paints it.

    npx codebase-posters

one command, inside any git repo.
your browser opens a gallery: ten posters, painted live from your commit history.
storms of additions and deletions. your working days as a calendar. the project's
heartbeat. the constellations you committed at 2am.

pick one. watch it paint itself. hang it on the wall.

by [@unable0_](https://x.com/unable0_)

## the gallery

| | |
| --- | --- |
| <img src="https://raw.githubusercontent.com/unable12/codebase-posters/main/docs/posters/react-chrono-grid.png" width="100%" alt="react chrono-grid" /><br>react. thirteen years of weather. | <img src="https://raw.githubusercontent.com/unable12/codebase-posters/main/docs/posters/express-rain.png" width="100%" alt="express rain" /><br>express. it's been raining since 2009. |
| <img src="https://raw.githubusercontent.com/unable12/codebase-posters/main/docs/posters/vite-heartbeat.png" width="100%" alt="vite heartbeat" /><br>vite. resting heart rate: not resting. | <img src="https://raw.githubusercontent.com/unable12/codebase-posters/main/docs/posters/zod-constellations.png" width="100%" alt="zod constellations" /><br>zod. one man's night sky. |
| <img src="https://raw.githubusercontent.com/unable12/codebase-posters/main/docs/posters/tailwind-poster-per-day.png" width="100%" alt="tailwind poster per day" /><br>tailwind. nine years of showing up. | <img src="https://raw.githubusercontent.com/unable12/codebase-posters/main/docs/posters/git-ridgelines.png" width="100%" alt="git ridgelines" /><br>git. the last 20,000 commits. |

each image is a real open-source repo at a fixed seed. same inputs, same pixels.

## yours stays yours

runs entirely on your machine.
no uploads. no telemetry. no account.
101 kB, zero dependencies. it reads your git log, paints, and forgets.

## save it

**print**: 3600×4800 px. that's 12×16 inches at 300 dpi. real poster, real wall.
**video**: the painting animation as an mp4, encoded in your browser.

every poster is deterministic: same repo, same seed, same pixels.

## read it

blue strokes are code arriving. green is code leaving.
the dots with dates are your biggest commits. they bend everything around them.
each poster explains itself in the gallery.

---

## hacking on it

```
npm install && npm run dev    # gallery with repo picker (scans ~/code_base)
npm run build                 # dist/app + dist/server.mjs for npx
node bin/cli.mjs              # run the packaged experience locally
```

add a poster: drop a file in `src/recipes/` exporting a `CanvasRecipe` (`src/core/types.ts`). it auto-registers.

inspired by [zeh fernandes' gencup](https://zehfernandes.com/posts/how-i-turned-world-cup-data-into-posters).
made by [kamil](https://x.com/unable0_). MIT.
