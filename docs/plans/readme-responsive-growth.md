# Plan: README as a gallery page + mobile/responsive fixes + OSS example posters

> **Status: implemented** (2026-07-08). Stages 0–3 complete; Stage 4 publish is Kamil's step.
> Credit line on exports: **deferred** — awaiting explicit yes/no (Stage 0).
> Linux ridgelines skipped (GitHub promisor rate limits on blobless clone); shipped 5 OSS posters.

## Why

The npm package is live (`npx codebase-posters`) but the README is plain text — the
listing page has to *show* the art, not describe it. Reference for tone: Paxel
(paxel.ycombinator.com) — monochrome, terminal-native, one command front and center,
short lines, humor from real data instead of marketing adjectives. Meanwhile the app
itself breaks on narrow windows (topbar wraps into a 5-line mess, detail view assumes
a wide viewport). Fix both; use famous open-source repos as the example posters.

---

## Stage 0 — Decisions and prerequisites (blockers for later stages)

1. **Public GitHub home.** README images must be absolute
   `raw.githubusercontent.com/...` URLs or npmjs.com won't render them. That requires
   a **public** repo. Current origin is `github.com/unable12/visual_data` — decide:
   - (a) make `visual_data` public as-is, or
   - (b) recommended: create a public repo named **`codebase-posters`** (matches the
     package; people will search for it) and push there; keep or archive visual_data.
   Then set in package.json: `"repository": { "type": "git", "url": "https://github.com/unable12/codebase-posters" }`
   and `"homepage"` to the same.
2. **Credit line on exported posters** (`made with codebase-posters`, small, in the
   footer's ink/mono style). This changes the exported artwork → needs an explicit
   yes/no from Kamil. If yes, it's 3 lines in `typographyFooter` (draw.ts) + one
   opt-out param. **Not assumed; ask before Stage 3 ships.**
3. **License file.** package.json says MIT but there's no LICENSE file — add one
   (required before promoting the repo publicly).
4. `tsconfig.tsbuildinfo` is tracked — add to `.gitignore` and `git rm --cached`.

**Done when:** public repo exists, `repository`/`homepage` set, LICENSE committed,
credit-line decision recorded at the top of this file.

---

## Stage 0.5 — Remove the contact sheet (seed variants strip)

Kamil's call after seeing it in practice: on sparse repos the six variants render
nearly identically, so the strip reads as six copies of the same blank page under the
artwork — clutter, not curation. Removing it also returns ~110px of height to the
poster and drops 6 queued canvas renders per detail view.

**Run this stage FIRST** — Stages 1 and 1.5 then never have to style/stack/animate it.

1. `src/app/Detail.tsx`: delete the `.contact-sheet` JSX block, `sheetPage` state,
   and `sheetSeeds`. The seed capability stays where it already lives: the number
   input + 🎲 dice in *edit parameters*.
2. `src/app/style.css`: delete the `.contact-sheet` / `.variant` / `.more-variants`
   rules; revert the placard-alignment vars to player-only:
   `--poster-h: calc(100vh - 200px)`, `--player-h: 43px` (they were grown to
   310px/155px specifically to make room for the strip).
3. Verify: poster is visibly larger; placard top/bottom still aligns with the poster
   edges (±2px, the established check); player width still matches the poster.

Note for later stages: ignore any `.contact-sheet`/`.variant` mentions below — they
were written before this decision and are void wherever they appear.

---

## Stage 1 — Mobile / narrow-width fixes (the screenshot problem)

The app is desktop-first with a hard viewport-height lock. Two real contexts to fix:
narrow desktop windows (the screenshot: stats wrapped to five lines) and phones
(people will open the gallery URL on whatever is at hand).

### 1a. Top bar (all widths)
- `.topbar h1` — add `white-space: nowrap` so "CODEBASE POSTERS" never wraps to two lines.
- `.stats` — add `white-space: nowrap`; **hide entirely below 1000px** (`display:none`)
  — it's flavor, not function.
- Below ~700px: drop the `.topbar-side` flex spacers' `flex: 1` so brand + repo name
  sit left-aligned; dots (detail mode) move to `order` after center, allowed to shrink
  (`gap: 5px`, 6px dots).

### 1b. Gallery (≤700px)
- Grid already auto-fits; reduce padding to 16px and gap to 14px.
- Thumbnail labels: keep one line, `text-overflow: ellipsis`.

### 1c. Detail view (≤900px) — the structural change
Current: horizontal flex `[‹][stage][›][placard 500px]`, `height: 100vh` lock,
placard height glued to `--poster-h`. On narrow screens this must become a normal
scrolling column:

```css
@media (max-width: 900px) {
  .app { height: auto; min-height: 100dvh; }        /* release the lock */
  .detail { flex-direction: column; overflow: visible; height: auto; padding: 16px; }
  .stage { --poster-h: none; }
  .stage canvas { max-height: none; width: 100%; }   /* poster = full width */
  .player, .contact-sheet { width: 100%; }
  .panel {
    width: 100%; height: auto; margin-bottom: 0;
    border-left: none; border-top: 1px solid #2c2c2c; padding: 16px 0 0;
  }
  .placard-body { overflow: visible; }
  .nav-arrow { display: none; }                      /* replaced by 1d */
}
```
Order top→bottom: poster → player → contact sheet → placard (title, description,
legend, actions). Everything scrolls as one page.

- Replace `100vh` with `100dvh` (+ `100vh` fallback line above it) everywhere it
  appears — mobile Safari's collapsing URL bar otherwise clips the player.

### 1d. Navigation without side arrows (≤900px)
Chevrons are hidden in the stacked layout. Add a minimal prev/next row INSIDE the
placard header: `‹ 4 / 10 ›` — reuses `onNavigate`, mono, quiet. (Swipe gestures:
out of scope, note as future.)

### 1e. What good looks like / verification
Use `preview_resize`:
- 375×812 (mobile): gallery = 1 column, no horizontal scroll anywhere
  (`document.body.scrollWidth <= innerWidth` check via eval); detail = stacked, poster
  full-width, placard readable, prev/next row works, edit drawer opens, scrub works.
- 768×1024 (tablet): 2-col gallery; detail stacked (900px breakpoint).
- 1100×800 (small laptop): desktop layout, stats hidden, no wrap in topbar.
- 1600×900: unchanged from today (regression check — placard/poster edge alignment
  still within a couple px).
- Screenshot each; fix what looks off before proceeding.

**Done when:** all four sizes screenshot clean, `tsc -b` clean, desktop unchanged.

---

## Stage 1.5 — UI motion polish (the Emil Kowalski pass)

Source: `emilkowalski/skills` → `emil-design-eng` (audited the full SKILL.md against our
CSS on 2026-07-05). His frame: animate by *frequency and purpose*, use strong custom
easing, press feedback everywhere, never `ease-in`, respect reduced motion. Our chrome
currently violates a handful of these; the poster rendering itself is ART, not UI —
his rules don't apply inside the canvas and nothing there changes.

Audit findings (from `src/app/style.css`): 11 `:hover` rules, only one transitioned
(`.nav-arrow`) — everything else color-snaps; **zero** `:active` states; **zero**
`prefers-reduced-motion`; drawer slide uses weak stock `ease`; slider-thumb hover
scale not gated for touch. Already right: the poster morph (custom strong ease-out,
340ms — within his 200–500ms modal band), no `transition: all` anywhere, no animation
on keyboard prev/next navigation.

### Additions — each justified, nothing else

First, two easing tokens at `:root` (his exact curves; stock CSS easings are too weak):

```css
:root {
  --ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);
}
```

| # | Change | Exact spec | Why (his rule → our case) |
|---|---|---|---|
| 1 | Press feedback on every pressable | `button { transition: transform 140ms var(--ease-out-strong); } button:active { transform: scale(0.97); }` — applied to `.panel button`, `.player .play`, `.variant`, `.more-variants`, `.dot`, `.back-link`, `.edit-link`, `.thumb` (thumb: `scale(0.99)` — a large card at 0.97 lurches) | "Buttons must feel responsive to press… the UI is truly listening." Frequency: tens/day → subtle+fast is correct. This is the single highest-value item: it touches every interaction and is invisible until you feel its absence. |
| 2 | Transition the hover states that currently snap | add `transition: border-color 150ms ease, background 150ms ease, color 150ms ease` to `.thumb canvas`, `.dot`, `.variant`, `.panel button`, `.player .play`, `.more-variants` | His easing tree: hover/color change → `ease`, ~150ms. Pure color moves — cheap, GPU-irrelevant, removes the "snap" feel across the whole app. |
| 3 | Gate hover effects for touch | wrap all `:hover` rules in `@media (hover: hover) and (pointer: fine) { … }` | Touch devices fire `:hover` on tap → sticky highlighted buttons on the phones Stage 1 just unlocked. Do this IN Stage 1's media-query sweep (same files, one pass). |
| 4 | Thumbnails fade in when painted | `RecipeCanvas` sets `data-painted` after `renderFrame` runs (queued mode only); CSS: `canvas { opacity: 0; transform: translateY(6px); transition: opacity 300ms var(--ease-out-strong), transform 300ms var(--ease-out-strong); } canvas[data-painted] { opacity: 1; transform: none; }` | "Elements appearing without transition feel broken" + his stagger principle. Our render queue already staggers the *timing* one-per-frame — we get a true cascade for free; each card just needs to stop popping from blank→full in one frame. Guard: applies only to gallery thumbs/variants, NOT the detail canvas (re-renders on every scrub/param change — animating that would fight the artwork). |
| 5 | Drawer slide gets a real curve | `.drawer { transition: grid-template-rows 260ms var(--ease-in-out-strong), opacity 260ms var(--ease-in-out-strong); }` | His tree: on-screen movement → strong ease-in-out; 300ms was also over his UI budget. 260ms + the stronger curve reads more deliberate AND faster. |
| 6 | `prefers-reduced-motion` | `@media (prefers-reduced-motion: reduce)`: skeleton sheen → static (keep a gentle opacity pulse at most); drawers → opacity-only (rows change instantly); view-transition morph → `::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation-duration: 0.01ms !important; }`; press-scale off. The poster PLAY button stays untouched — playing the artwork is an explicit user action on content, not ambient UI motion. | Accessibility is his non-negotiable and ours: "reduced motion means fewer and gentler animations, not zero." Currently we have literally none of this. |
| 7 | Save-button label swap ("Save video" → "encoding…") | on state change, content gets `filter: blur(2px); opacity: 0.7` for 200ms `ease`, then new label transitions in (his blur-mask trick, kept under 2px) | "Blur bridges two overlapping states into one perceived transformation." This swap happens at the exact moment the user is staring at the button waiting. Smallest item — do last, cut first if it reads gimmicky in practice. |

### Explicitly rejected (restraint is the taste)

- **Springs / Motion library** — his springs are for drag + interruptible gestures; we
  have none. Adding a physics lib to animate buttons would also dent the
  zero-dependency story that's literally in our README copy.
- **Hover scale/lift on gallery thumbnails** — prints on a gallery wall don't wiggle.
  Border-color shift is the correct amount of response for art.
- **Animating prev/next poster navigation** — repeated action; his frequency table
  says reduce/remove. We already decided snappy > syrupy here; the skill confirms it.
- **Animating the stats/counter text, skeleton→gallery crossfade, page-load hero
  motion** — decoration without purpose ("if the purpose is just 'it looks cool'…").
- **Anything inside the canvas** — reveal envelopes, brush speeds, and eased playback
  are the artwork's own system (already built) and stay under its rules, not the UI's.

### Verification
- Click every pressable at normal speed — press feedback present, nothing bounces.
- His "next day rule": review at 5× slow-mo in DevTools → no overlapping-state
  artifacts on the button label swap; drawer curve accelerates/decelerates cleanly.
- Toggle `prefers-reduced-motion` in DevTools rendering panel → no translating/scaling
  motion anywhere in chrome; gallery still fully usable.
- On the mobile viewport (Stage 1 matrix): tap buttons — no stuck hover states.
- Regression: same-seed poster exports byte-identical (nothing in this stage may touch
  render code paths except the `data-painted` attribute).

**Done when:** the table's 7 items land (or are consciously cut with a note), the
rejected list stays rejected, and the slow-mo + reduced-motion checks pass.

---

## Stage 2 — Example posters from famous open-source repos

### 2a. The cast (curated pairings — each repo chosen for what its data does to that recipe)

| Repo | Recipe | Why this pairing | Caption draft (verify numbers at generation) |
|---|---|---|---|
| `facebook/react` | Chrono-Grid Confrontation | 11+ years, thousands of authors → dense two-force weather | `react. eleven years of weather.` |
| `expressjs/express` | Rain | history since 2009, sparse recent years → long quiet rainfall | `express. it's been raining since 2009.` |
| `vitejs/vite` | Heartbeat | famously fast release cadence → violent pulse | `vite. resting heart rate: not resting.` |
| `colinhacks/zod` | Constellations | long solo stretches → clean star signs | `zod. one man's night sky.` |
| `tailwindlabs/tailwindcss` | One Poster Per Day | steady multi-year cadence → calendar confetti | `tailwind. six years of showing up.` |
| `torvalds/linux` (stretch) | Ridgelines | the meme pick; 20k-commit cap note becomes the caption | `linux. the last 20,000 commits. we ran out of poster.` |

Captions are drafts — regenerate with REAL numbers from each dataset (commit count,
year span) after extraction. Never ship a number we didn't see.

### 2b. Generation workflow
1. Clone into scratchpad (NOT the repo): `git clone --single-branch <url>` —
   full history needed (numstat), single branch keeps it lean. Linux: blobless
   partial clone or skip; it's the stretch pick.
2. Run the dev app (repo scan roots already cover only ~/code_base — either add a
   `SCAN_ROOTS` env or temporarily symlink clones into `~/code_base`; the symlink is
   less code).
3. For each repo: open its paired recipe → contact sheet → flip a few pages of seeds
   → pick the strongest composition (record the seed!) → tweak params only if needed
   (record them) → **Save print**.
4. Record a `docs/posters/manifest.md`: repo, HEAD sha, recipe, seed, params, date —
   posters are reproducible; this manifest is the receipts.
5. Downscale for the README: `sips -Z 1200 <in> --out docs/posters/<repo>-<recipe>.png`
   (macOS built-in; no new deps). Target ≤500KB each. Total budget for the README ≤3MB.
6. Commit under `docs/posters/`.

### 2c. Quality bar
- Every image is a poster someone would plausibly print — if a pairing looks weak
  with its repo, swap the recipe rather than shipping a mediocre example.
- All six on cream paper, footer stamp visible (repo name + stats legible at 1200px).
- At least one image shows a DENSE repo and one a SPARSE repo — proves range.

**Done when:** 4–6 posters in `docs/posters/` + manifest, each individually reviewed.

---

## Stage 3 — The README itself

### 3a. Voice rules (from Paxel, adapted)
- Short lines. Fragments allowed. No exclamation marks, no emoji.
- Humor comes from the data ("it's been raining since 2009"), never from adjectives.
- Banned words: seamless, powerful, beautiful, stunning, effortless, supercharge,
  unleash, dive in, blazing.
- The command appears in the first ten lines. Privacy in one breath, concrete numbers
  ("101 kB. zero dependencies.") — trust through specifics, not promises.
- Lowercase headings (matches the gallery's letterspaced-mono aesthetic more than
  Title Case; the wordmark itself stays CODEBASE POSTERS).

### 3b. Full copy draft (to be tuned, not padded)

```markdown
<p align="center">
  <img src=".../react-chrono-grid.png" width="30%" />
  <img src=".../zod-constellations.png" width="30%" />
  <img src=".../vite-heartbeat.png" width="30%" />
</p>

# codebase posters

every repository has a shape.
this paints it.

    npx codebase-posters

one command, inside any git repo.
your browser opens a gallery: ten posters, painted live from your commit history.
storms of additions and deletions. your working days as a calendar. the project's
heartbeat. the constellations you committed at 2am.

pick one. watch it paint itself. hang it on the wall.

## the gallery

<table of the 4–6 OSS posters, two per row, caption under each>

## yours stays yours

runs entirely on your machine.
no uploads. no telemetry. no account.
101 kB, zero dependencies. it reads your git log, paints, and forgets.

## save it

**print** — 3600×4800 px. that's 12×16 inches at 300 dpi. real poster, real wall.
**video** — the painting animation as an mp4, encoded in your browser.

every poster is deterministic: same repo, same seed, same pixels.

## read it

blue strokes are code arriving. green is code leaving.
the dots with dates are your biggest commits — they bend everything around them.
each poster explains itself in the gallery.

---

inspired by [zeh fernandes' gencup](https://zehfernandes.com/posts/how-i-turned-world-cup-data-into-posters).
MIT.
```

Notes:
- Badges (npm version + downloads, shields.io `?style=flat-square&color=2a4fd7`):
  ONE quiet row directly under the h1, or omitted — decide by eye when the images
  are in. Paxel would omit; npm users expect them. Try with, screenshot, judge.
- Dev/contributing section moves to the bottom (`## hacking on it`), three lines +
  pointer to `src/recipes/` for adding a poster.
- The old README's per-recipe list and dev docs get compressed, not deleted.

### 3c. Rendering constraints (why absolute URLs)
- npmjs.com strips/ignores relative image paths — use
  `https://raw.githubusercontent.com/<owner>/<repo>/main/docs/posters/....png`.
- GitHub renders the same URLs fine. Test BOTH after publish (npm caches README per
  version — bump to 0.1.1 to refresh it).
- GitHub dark mode: images are cream posters on white/dark — fine as-is; no
  `#gh-dark-mode-only` variants needed.

**Done when:** README renders correctly on GitHub (check on phone width too), copy
read aloud once without wincing, images total ≤3MB.

---

## Stage 4 — Ship + optional extras

1. Bump to `0.1.1`, `npm publish` (Kamil runs it) — verifies README on npmjs.com.
2. **Optional, pending Stage-0 decision:** footer credit line
   `made with codebase-posters` in exported prints — the growth loop. 3 lines in
   `typographyFooter` + `credit: boolean` param defaulting on.
3. **Optional:** animated hero GIF (one poster painting itself, ~3s, 480px, ≤4MB).
   Path: Save video → convert. Needs ffmpeg or gifski locally (`brew install ffmpeg`)
   — skip if not installed; a still hero is fine for v1.
4. Social: the assets ARE the campaign — six posters + captions are six posts.
   (No code work; noting so the images get sized for it: keep the 3600×4800 originals.)

---

## Execution order & effort

| Stage | Depends on | Rough size |
|---|---|---|
| 0 decisions | Kamil | 15 min |
| 0.5 remove contact sheet | — | 30 min, run before 1/1.5 |
| 1 responsive | 0.5 | one session, mostly CSS + verification |
| 1.5 motion polish | 1 (shares the hover media-query sweep) | half a session; item 7 is optional |
| 2 posters | 0 (public repo not needed to generate, only to link) | one session, mostly curation |
| 3 README | 2 | short, copy is drafted above |
| 4 ship | 0+3 | 15 min + optionals |

Stage 1 and 2 are independent — either order works. Run 1.5 immediately after 1
(same files, one verification pass).
