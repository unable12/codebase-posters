# PLAN_V2 — go public, safely

> **Status: almost done.** Commit, push, rename, publicize, topics — DONE.
> Remaining for Kamil: `npm publish` (needs OTP), social preview upload, final verify.
> Delete this file after step 4 verifies.

## Done (2026-07-11)

| Step | Result |
| --- | --- |
| Safety audit | reconfirmed: zero secrets, no `data-cache` / settings.local in history |
| Maker's mark | `made with codebase-posters` in `typographyFooter` (15px, 35% ink) |
| Attribution | `x.com/unable0_` in package.json / README / `--help` |
| `.gitignore` | `.claude/settings.local.json` ignored |
| Commit + push | `624e880` on `main` → `unable12/codebase-posters` |
| Rename + public | `visual_data` → **`codebase-posters`**, visibility **PUBLIC** |
| Description + topics | set: generative-art, git, data-visualization, poster, cli |
| README images | `raw.githubusercontent.com/.../react-chrono-grid.png` → HTTP 200 |

## Remaining — Kamil only

1. **Publish 0.2.0** (OTP required — agent hit `EOTP`):
   ```bash
   npm publish
   npm view codebase-posters version   # expect 0.2.0
   ```
2. **Social preview** (GitHub Settings → Social preview): upload
   `docs/posters/react-chrono-grid.png`
3. **Verify** (incognito):
   - github.com/unable12/codebase-posters — five posters render
   - npmjs.com/package/codebase-posters — posters + Repository link + author
   - `npx codebase-posters@latest` — banner, autoplay, maker's mark on Save print

Then launch posts (hero video, X thread, Show HN, r/dataisbeautiful) — content, not code.
Delete this file after verify.
