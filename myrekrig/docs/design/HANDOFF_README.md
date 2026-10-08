# Ants 51 — programmer handoff v2

8 October 2026 · Selected logo: **01 / Three Segments**

## Start here

1. Open `index.html` in a desktop browser. Switch **Obsidian / Champagne**, **1× / 2×**, and **Distinct colours**. No install, build or network required.
2. Read `spec/01_IMPLEMENTATION.md`. Its opening table explicitly replaces the conflicting Amber Operations v1 instructions.
3. Use `assets/logo/ants-51-on-black.svg` or `ants-51-on-cream.svg`. These transparent production redraws use outlined lettering, not a web font. The selected original sketch is included for provenance.
4. Read `spec/02_EVENTS_AND_CONTROLS.md` and `spec/03_DATA_CONTRACT.md` before wiring the view to the simulator.
5. Read `spec/04_WEBSITE_PAGES.md` for Home, Open League, LLM Benchmark, About and their nested archives.
6. Complete `spec/05_ACCEPTANCE.md` against the actual engine and all supported sizes.

## What the user decided

- Display the brand exactly **Ants 51**.
- Use the Three Segments logo; no legs, frame, alien face or alternative concept.
- Two matching minimalist themes: **Obsidian** (near-black) and **Champagne** (warm cream). No card-wall styling or ornamental neon effects.
- Race-defined colours are the default across map, chart and tables. Only a user-selected **Distinct colours** display mode may remap them.
- User chooses **1× or 2× display scale**. Never automatically reduce it because of viewport height.
- Use available page width. Standings and chart go to the **right** if they fit; otherwise **below** a centred battlefield.
- Keep **F1–F5 shortcut buttons at the top** with playback controls.
- Battle progress belongs in the top header. Remove the separate Pre-Halftime box.
- Remove the recent-events log and its drawer. Preserve brief map event effects and chart markers.
- Analysis order: **Live standings → Strength over turns → Lead over runner-up**.
- Keep the original game mechanics; presentation must not change the results.

## Package contents

| Location | Purpose |
|---|---|
| `index.html`, `reference/ui.css`, `reference/demo.js` | Offline visual reference, including real responsive reflow |
| `assets/logo/` | Transparent SVG wordmarks and icons; PNG fallbacks; favicon; asset gallery |
| `assets/tokens.css`, `tokens.json` | Exact matching theme values |
| `assets/presentation.js` | Pure layout, stable colour mapping and lead-ratio helper examples |
| `assets/motion.css` | Small event/alert animation definitions |
| `spec/` | Implementation, events, data, page structure, acceptance and brand usage |
| `reference/*.png` | Browser-rendered previews and selected logo sketch |
| `qa/` | Focused verification script and results |
| `credits/` | Asset origin and typeface notices |

## Reference limits

This is a **design handoff, not an integrated simulator release**. The map and histories are synthetic; race colours are taken from the original supplied simulator. Scale, theme and palette controls work. Engine action buttons show preview feedback; they do not run or terminate battles. The reference does not implement replay storage, upload handling, authentication, rating formulas, the event pipeline or production chart interaction. Those obligations are specified for the programmer.

Do not ship the reference banner, synthetic data, theme comparison toolbar, demo feedback or concept image on the production site. The production theme toggle belongs in the header/settings. Keep tournament administration controls in the operator's view; public recorded replays do not get controls that mutate a tournament.

This package is self-contained. Do not merge old layout/palette rules from v1. For any conflict, use this v2 specification and the existing authoritative engine mechanics.
