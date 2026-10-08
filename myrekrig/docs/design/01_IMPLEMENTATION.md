# Implementation specification

## Authority and changes from Amber Operations v1

User decisions in this v2 package supersede old visual instructions. Engine rules remain authoritative over either package.

| Earlier v1 instruction | Replace with |
|---|---|
| Colours assigned to battle slots A–J | Default to each race's stored `definedColor`; never derive colour from rank or slot |
| Automatically select scale using width and height | Explicit user-selected 1× / 2×, preserved during resize |
| Constrain layout to accommodate all panels in one screen | Full available page width with normal vertical document scrolling |
| Lead meter above standings | Live standings, then strength chart, then lead meter |
| Battle progress below map | Progress integrated into absolute top header |
| Pre-Halftime badge in header | Remove separate box; communicate milestones within the progress component |
| Recent-events panel and history drawer | Remove both; retain map effects, chart markers and accessible milestone notices |
| Amber Operations / ANTS51 / Ants42 | Ants 51 and selected Three Segments logo |

## Visual system

Theme tokens are authoritative in `assets/tokens.json`. Background: Obsidian `#030404`; Champagne `#f1e8ce`. Use warm, restrained accent colours; race colours carry data only. Both themes use the same layout, controls, terminology and component order.

Use Arial/Helvetica for body and headings and Consolas/Liberation Mono for figures. Standard body 14px; tables 12–13px; secondary labels no smaller than 11px. Use tabular numbers. Borders are 1px theme-line dividers; small control corners 3px. No large drop shadows, repeated rounded cards, chart glow, textured parchment, scanline overlays or decorative gradients. A very faint progress-accent glow is acceptable in Obsidian only. No glow on cells or graph curves.

Page padding 24px; 18px on small screens. No global max-width for battle/tournament pages. Reading-only About text may use max-width 760px. Main column gap 32px. Sidebar minimum width 310px; it grows to fill remaining width. Sidebar/table text must remain readable; move below rather than compress it smaller.

## Header and controls

Band 1: logo left, battle identifier below logo; battle progress expands across the remaining width. Show current/max turns, halftime marker and fulltime endpoint. The progress bar is not a seek slider in a live battle. Recorded replays may have an explicitly labelled seek control only when the replay adapter supports it.

Band 2: Resume/Pause, Step, speed and race count on left; map scale 1× / 2× and Distinct colours toggle on right. Retain Setup/Stop if they exist in the operator UI; place them alongside playback controls or in a clearly labelled compact menu. Do not rename or change their engine semantics.

Band 3: F1 Skip battle, F2 Interrupt, F3 End tournament, F4 Restart battle, F5 Last battle. Buttons remain visible, not in a collapsed overflow menu on desktop. They may wrap on narrow screens. Use the exact simulator command mapping in the controls spec.

These controls are at the top of the document. Sticky/fixed positioning is not required and must not cover a tall battlefield. Avoid a separate Pre-Halftime status box. Phase warning text may temporarily replace the progress caption without changing its height.

## User-selected integer scale and reflow

`mapWidth = gridWidth × selectedScale`; `mapHeight = gridHeight × selectedScale`. Initial default 1×; restore the user's last selection if available. Options 1× and 2×. Scale is display-only, not zoom: the complete world remains visible, with no pan, crop, inset magnifier or fractional fitting.

Measure content width **after** outer padding. If it is at least `mapWidth + 32 + 310`, display map left and the analysis column right. Otherwise stack analysis under the map. Centre the battlefield horizontally in the full content width in stacked mode. Do not judge fit by viewport height. A 2× 530-cell map is 1060px high and may require document scrolling; preserve the user's choice.

| Browser width, default 24px padding | 530-cell map at 1× | 530-cell map at 2× |
|---|---|---|
| 1024 | 976px content; map + right analysis | Map itself wider than content; show narrow-screen fallback |
| 1440 | Map + right analysis | 1392px content < 1402px required: map centred, analysis below |
| 1920 | Map + right analysis | 1872px content: map + right analysis |

For the reference's 448-cell map, 2× is 896px: stacked at 1024 browser width, beside analysis at 1440. Do not hard-code breakpoints against 448; use actual grid dimensions and scrollbar-adjusted container width. Rectangular boards preserve both dimensions.

Set the raster canvas backing store to W×H logical cells; CSS width/height exactly W×s and H×s; `image-rendering: pixelated`. Do not set its fluid width to 100%. Chart canvases have their own high-DPI backing stores and are independent of map resolution. Use a ResizeObserver and update only when relevant dimensions change to avoid feedback loops.

When the selected map cannot itself fit the content width, preserve the selection and show a clear message offering 1× (when it fits) or a wider view. Do not silently shrink/crop. First release is desktop-first. Browser/OS zoom is separate from the game's display-scale setting.

In stacked mode, place standings and chart/lead group side-by-side below the map when both can remain at least 310px wide, otherwise stack them. In all cases, the lead meter stays directly below the chart.

## Race identity and colour — critical

Read `raceId` and `definedColor` from immutable race metadata. For legacy races, the existing simulator parses `#RRGGBB` from their title or applies the original name-derived formula when no explicit colour is supplied. Keep that adapter; do not change the parsing, hash, author name or stored value.

Use one `displayColor(raceId)` lookup for occupied ant pixels, table swatches, chart curves, tooltips and legends. Rank, battle-slot letter, list order, theme, reflow, pause and replay seeking must not reassign it. Two races are allowed to have similar or identical original colours. Do not automatically 'fix' them.

**Distinct colours** is OFF initially. When enabled, it replaces display values only; preserve the actual `definedColor`. Assign a palette deterministically using stable race IDs and retain the mapping for the active battle/tournament. Re-sort the standings without rebuilding it. Switching it off restores exact definitions. Never write the optional palette into uploaded code, stored metadata, seed or simulation state. Persist the user's mode preference separately from game data; document its state visibly.

`assets/presentation.js` contains a simple registry for up to ten races. Its first allocation is deterministic by ID and it preserves supplied earlier assignments. Do not feed an entire 50-entry tournament into the ten-colour helper. For more than ten simultaneous races, extend the scheme with labels/line styles and a reviewed palette. Colours across a very large league cannot all be perceptually unique; default identity colours still apply.

Example originals verified from the supplied simulator: A5 `#a4c5e9`, BayiMayi `#f02fd3`, Inkal `#00ff55`, NanoMyre `#8040ff`, Punk `#ff28e6`, Smiley `#ff8000`, Triumfant `#90e090`. These are examples, not a production hard-coded list. Two pink entries are intentionally similar.

## Battlefield and bases

Keep background `#050708` in both themes, preserving race-colour appearance. Occupied ant cells use exact display colour by default. No art sprite can faithfully occupy one 1×1 logical cell; do not substitute enlarged ants. The cell may represent multiple ants.

Keep food, territory and other semantic cell layers from the current renderer, with toggle access in compact View options. Do not recolour the whole colony because its rank changes. A subdued territory tint is a separate optional layer, not a new race identity.

Bases occupy exactly one logical square. Use optional corner brackets extending 2 CSS px outside it, with transparent interiors. Empty base core can be neutral ivory; occupied base core may use the existing contrasting tint to remain visible, without altering the race's stored/display identity elsewhere. This limited base-state cue is not a palette reassignment. Keep its behaviour the same in both themes and permit disabling the marker layer. Draw transient event outlines on a separate non-interactive overlay; never overwrite current raster data for an animation.

## Live standings, chart and lead meter

Display all 5–10 competing races without an inner table scrollbar. Row order is strength descending with stable tie handling. Columns: race identity, strength, ants, bases; overall share can be an optional column on wide screens. Use explicit stable IDs/letters in tooltips for similar colours. Rank is not an identifier. Long names may wrap or truncate with an accessible full-name label.

Strength comes from the engine: ants + `baseValue × bases`; do not hard-code the reference's current 75. The chart plots the same coherent snapshots as the table. Common Y scale starting at zero; X is recorded turns only; no future data, decorative smoothing or fabricated intermediate turns. Use 1.5px curves and about 2px for a focused race. Preserve min/max spikes when downsampling. Prefer direct row-to-series highlighting over duplicating a ten-item legend.

On chart hover/touch, show turn and visible race values using one shared crosshair and tooltip. Keyboard interaction must also allow reading values and race selection. Theme changes must preserve curve colours; improve surrounding contrast without changing identity. If dark original colours are illegible, let the user enable Distinct colours; pair values with text labels.

Lead over runner-up = `100 × leaderStrength / (leaderStrength + runnerUpStrength)`, NOT overall share and NOT win probability. Zero denominator yields an em dash. Show both race names and active threshold. With equal top strengths, show joint leadership. Let the engine decide winners and termination; the meter never triggers engine termination.

On a large tournament page, retain its useful existing result columns and allow the table/chart area to fill available width. Avoid a tiny narrow table inside a mostly empty full-width bordered panel. Tournament entrants may exceed ten even though each battle contains 5–10.

## Scope

Preserve engine execution order, memory, seeds, rules and keyboard command semantics. Do not introduce terrain, health, pheromones, capture rules or combat effects unsupported by the original mechanics. Use text links and expandable details for setup and data, not extra permanent battle panels.
