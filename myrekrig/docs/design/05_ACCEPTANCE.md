# Programmer acceptance checklist

## Identity and colour

- Brand is **Ants 51**, with a space and selected Three Segments logo.
- Exact original race colours agree between battle map, chart, race rows and tournament results.
- Sort order, new leader, theme, resize, pause, replay seek and next battle do not accidentally change race identity colours.
- Near-identical original colours remain as authored until the user enables Distinct colours.
- Distinct mode is stable by race ID, synchronised across all visualisations, and reversible to exact originals; no engine metadata is mutated.
- Test with 5, 7 and 10 battle participants, including a tie and duplicate defined colours.

## Layout

- No fixed desktop page max-width on battle/tournament screens.
- Test 448×448, 530×530 and a rectangular battlefield at both 1× and 2×.
- Assert exact map CSS dimensions: W×s and H×s; no fluid/fractional rescaling.
- At available width = mapWidth + 342, analysis is right; one pixel below it moves below.
- At 1440 browser width with 530×530 and 2×, centre the 1060px map and put analysis below.
- At 1920 with that same board/scale, analysis returns to the right.
- Window height reduction never silently selects 1×; tall boards can scroll vertically.
- Narrow-screen fallback states the limitation without cropping or silently changing the selection.
- Standings and chart are readable; 10 battle rows are visible without an inner scrollbar.
- Header holds progress, playback, scale, palette and F1–F5; no Pre-Halftime box or Recent events panel remains.
- Lead meter is immediately below Strength over turns in right-column and stacked layouts.

## Rules and interactions

- F1–F5 dispatch the existing command codes and respect disabled state and editable focus.
- Theme, palette and scale controls never send game commands.
- Strength agrees with engine snapshots; lead ratio compares only the strongest two races, not total field strength.
- Engine outcome is authoritative; timeout, ties, zero denominator, elimination and custom thresholds display correctly.
- UI styling does not alter results for the same seed, submitted code, engine/rules version and parameters. Use the existing engine regression check rather than adding a competing rule implementation.
- Replay displays stored race versions, colours and events; wrong/stale frame IDs are discarded.
- Public recorded-replay controls cannot mutate operator tournaments.

## Events and accessibility

- Successful base events occur once; no inferred capture; current cell state stays intact during overlays.
- At high speed, deduplication/grouping/caps do not remove stored events.
- Reduced motion turns pulses into static indicators and removes expanding/contracting movement.
- Hover, keyboard and touch expose chart/row values without colour alone.
- Similar-colour races remain identifiable by name/ID. Long names do not clip essential numbers.
- No rapid flash, unexpected focus movement or live-region announcement for every frame.

## Website

- Four main pages only; archives reachable from their league without occupying main navigation.
- Home uses completed Open League battles and says Recorded replay.
- Autoplay pauses when hidden; unavailable replay and empty league states are honest.
- Current standings and replay-local standings cannot be confused.
- Historical ranking snapshots remain unchanged; benchmark conditions are versioned and shown.
- About has approved biography and verified original-creator attribution.
- Remove all synthetic reference data, preview notices and engine-action demo feedback before release.

## Handoff verification versus production acceptance

`qa/results.txt` reports tests on the supplied offline reference and pure helpers only. It does not certify the programmer's current repository, real engine event handling, backend, rating system, uploads, sandboxing or benchmark methodology. The above production gates remain integration work.
