# Match Center LIVE Beta (G12 · 23 novembre 2026)

This directory is intentionally isolated within the Lega degli Eroi public GitHub Pages app. It does **not** replace `match.html`, `index.html`, `manifest.json`, the main `sw.js`, or any production services.

- Launch: https://ccezzionale.github.io/Test/match-center-beta/
- Mobile PWA installs under a distinct ID `/Test/match-center-beta/`, with its own scoped service worker.
- Original shared app icons are reused. The back links go to the official Arena home and Match Center.
- Static snapshot: real uploaded league G12 formations and already cached Highlightly Nov 23 player ratings, rounded to 0.5. Not automatic live updates; provisional 6* for unknown ratings.
- Incomplete Mantra substitutions, goalkeeper bonuses, defensive factor, and extra rules are deliberately excluded. Not official fantasy results.
- No Supabase key or API client is shipped. No writes, push notifications, or provider fetches.
- This is a **public, unlinked** test route on the main Pages deployment; do not upload credentials or confidential information here.
- For official launch, review the mobile UX, scoring/mappings, provider licensing and data access controls, then integrate separately into `match.html`.
