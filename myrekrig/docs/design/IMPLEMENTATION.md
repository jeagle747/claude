# Implementation specification — Amber Operations 1.0

## 1. Scope and authority

Apply this presentation to the supplied MyreKrig simulator. Preserve rules, team execution order, random number generation, ant decisions and termination behaviour. UI selections must never change the simulation or random seed. This package defines appearance and presentation events; it is not an engine rewrite.

Order of authority: engine state and rules → this specification → source tokens/reference layout → rendered screenshots. The earlier image-generated sketches contained incorrect values, stretched map proportions, oversized bases and invented event labels. Do not implement those errors.

The reference includes synthetic data to exercise the layout. Event buttons are demonstration controls and must not appear on the production game screen. The reference uses system fonts and all local files, with no build process.

## 2. Final visual identity

Use near-black page `#090b0d`, charcoal panels `#111316`, thin warm borders `#343028`, ivory text `#efe9dc`, muted text `#a9a69e`, and amber `#ffbe48`. Race colours are defined in `assets/tokens.css` and `tokens.json`. Avoid glows on graph curves and occupied map cells; glow makes adjacent data harder to distinguish. Amber alerts may softly illuminate their border only.

Use Arial/Helvetica for general UI and Consolas/Liberation Mono/SFMono-Regular for figures and small headings. All font stacks have local fallbacks. No font download or paid font is required. Numbers use tabular spacing. Standard body 13px, table 11–12px, headings 11–12px, secondary labels 9–10px. Maintain browser text zoom and keyboard focus outlines. Long race names truncate with a full-name tooltip and accessible name. Reference names are placeholders, not an exhaustive list.

Panels have 5px corner radii, 1px borders, no deep shadows. Main spacing is 18px, internal spacing 12–14px. Only the selected row and urgent status receive accented backgrounds. A rank change must not recolour a team. Colour and A–J letters together identify teams; do not rely on colour alone.

## 3. Layout and responsive behaviour

Desktop has four bands:

1. Compact header: brand left; phase indicator middle; current turn, pause and speed right.
2. Metadata row: battle, grid dimensions, fixed display scale, active race count.
3. Main area: map left; analysis column right. Analysis order: leader-versus-runner-up meter; standings; strength history.
4. Lower row: turn timeline left and recent two events right. Full event history can open in a drawer.

Setup/upload/editor controls belong in a separate setup drawer or screen, not a permanent left sidebar during viewing. Keep play/pause accessible. Production header should say MYREKRIG or the final selected brand, not a concept number.

### Cell scale is an exact constraint

Let grid dimensions be W,H. Choose `s=2` only if there is room for both `2W` horizontally and `2H` vertically after all required controls. Otherwise use `s=1`. Keep the map's intrinsic Canvas dimensions W×H; style it as W*s by H*s CSS pixels with nearest-neighbour rendering (`image-rendering: pixelated`). Never assign a fluid `width:100%` or fractional CSS transform to the cell canvas. Canvas map cells stay square. Browser device-pixel ratio and OS scaling do not create additional logical cell detail.

Reserve approximately 260 CSS pixels vertically for header, map labels and essential lower controls, and at least 660px horizontally for analysis on a wide desktop. The reference switches to 2× only when both conditions fit. At 1440×900, a 530×530 map uses 1×; at 1920×1440 it uses 2×. A 530×530 map is 1060px tall at 2× and does not fit a normal 1080-high browser with surrounding controls. This is a deliberate consequence of integer scaling, not a reason to stretch to 1.5×.

The UI may be centred with unused outer margins on a large but short screen. Do not fill those margins by blurring the map. At widths ≤1120px, stack analysis below the full 1× map. Below roughly 558px, allow page overflow or a desktop-view notice; do not secretly shrink or crop the map. Full 530px fidelity cannot fit into a 390px viewport without compromise. Mobile optimisation is outside this first desktop release.

Rectangular grids such as 512×384 preserve their aspect ratio. Never force every battle into a square. The screenshots with square grids illustrate the maximum-size case only.

### Five to ten races

Use 30px rows at normal size, up to 36px on tall 2× layouts. All ten must remain visible without an inner scroll area. With five, leave rows compact and let the chart receive extra vertical room. Assign stable slot letters by battle entry order, never sorted rank. Sort standings by strength; keep ties in stable entry order. Refresh row order at most 4Hz; retain selected team by ID across reorders. For tied maximum strengths, display joint leadership; the reference tie-break is for layout stability only. Do not emit repeated leader-change notices on ties.

## 4. Battlefield renderer

The renderer must receive actual semantic state, not only the existing palette-composited pixels. The current frame's `pixels` cannot distinguish every combination of food/base/ants or recover missed events. Add packed cell state or dirty-cell updates and a base list in the worker adapter.

Layer order:

1. Exact cell raster: no ant artwork or decorative terrain.
2. Optional base corner markers, with transparent interiors.
3. Brief event outlines, clipped at map boundaries.

### Pixel priority

For each square use the first applicable row:

| Condition | Cell appearance |
|---|---|
| Base with ants | Bright pastel version of owning team's colour, mixed 55% toward white |
| Empty base | Warm ivory `#efe9dc` |
| Ants and food | Team colour mixed 32% toward white |
| Ants without food | Full team colour |
| Food without ants/base | Neutral grayscale, rising with quantity |
| Owned empty square | Team colour at 14% RGB intensity |
| Empty unowned square | `#050708` |

These colours are a presentation proposal; they do not alter food, memory, territory or combat mechanics. The base core remains exactly one logical square (1×1 or 2×2 CSS pixels). With corner markers enabled, draw four tiny 1px L corners just outside that square: total bounding box `s+4` pixels. Corners are transparent UI annotation, not extra map occupancy. An occupied base keeps its pastel core plus the marker. Uncheck markers to inspect the exact raster unobstructed. Never render a filled 12px nest icon.

At 1×, neutral food brightness is clamped into 64–215 using quantity/32. Hover reports the exact quantity even after the display brightness saturates. Treat bases before food to avoid making a base indistinguishable from a food pile. The map's grayscale convention may differ from the original palette but state remains exact.

A cell can contain multiple ants; one screen block is not one ant. No fabricated density, trails or hit points. Keep the existing ants/territory layer toggles if desired, but their status must be visible and base markers must remain independently toggleable.

Selecting a race dims other teams to 38% intensity while preserving neutral food and unowned background. Maintain reasonable contrast; never remove opponents from the map. Selection can be made by keyboard on rows or chart legend. Clear focus restores all teams. The optional hover inspector shows `(x,y), team, ants, food, base`, without an enlarged inset. Convert pointer position by integer scale; use 0-based coordinates bounded by W,H.

## 5. Statistics and winning calculation

Current engine constants are `NewBaseAnts=25`, `NewBaseFood=50`, hence `BaseValue=75`. Strength S_i = ants_i + 75*bases_i. Read BaseValue from the engine adapter, not an independently maintained UI constant in production.

Sort all participating strengths descending: L is the largest, R the second largest. Display:

- **Lead over runner-up** = `100*L/(L+R)`, with subtitle `Leader ÷ (leader + runner-up)` and both IDs.
- **Overall share** = `100*S_i/sum(S)` in each race's table row.

The inspected engine checks TIMEOUT first. After halftime it checks `L*100 >= (L+R)*HalfTimePercent`, then checks the normal `WinPercent` condition. Before halftime the normal condition alone applies. Default parameters are 75% before turn 10,000 and 60% thereafter, timeout at 20,000; use the active battle's parameters instead of these defaults. If the halftime threshold is configured higher than the normal threshold, the normal condition still applies, so the effective displayed threshold is the lower after halftime. Honour engine termination reason and tie semantics; the UI must not end a battle itself.

If L+R=0, show em dash rather than 0% or 100%. If only one race remains with positive strength, the normal multi-team ratio can reach 100%; wait for the authoritative outcome. A truly single-participant battle has separate engine rules and is outside the 5–10-race UI; do not reuse this meter blindly. A race with zero ants but a surviving base is not necessarily eliminated. Mark Out only from an explicit engine status, or when ants and bases are both zero and the engine guarantees no revival.

Do not call the lead ratio “chance to win”. Do not plot a fixed strength threshold. It depends on the runner-up and can move. Expose exact numbers in hover/tooltips. Preserve any legacy table names internally while using these human-readable labels.

## 6. Charts

Default chart is raw strength versus turns, starting at zero or the selected history window, ending at the latest received turn. Never draw future values. Use one common Y scale for comparison; start at zero, choose nice rounded ticks and avoid clipping. Read current end values from the same snapshot as the standings. Do not animate invented intermediate turns.

Use a quiet charcoal grid; 1.35px race lines; 2px selected curve. Unselected curves retain 24% alpha when a race is selected. Without selection, top three can be slightly stronger, but all ten remain visible. Small A–J legend buttons map back to team names with tooltip and accessible label. Avoid ten overlapping names at the chart edge. No decorative spline smoothing or glowing tails. Min/max downsampling per pixel column should preserve sudden drops and spikes; do not simply discard every nth point.

Hover shows a shared vertical cursor and sampled turn/value. All charts must use a common turn axis if later adding population/base views. Bases should be a step chart. Base/leader events use tiny icons and a faint vertical guide. Closely spaced events become a grouped marker with count; tooltip gives original turn and event details. Halftime is a labelled vertical boundary at the real configured turn when in range; it is not the victory threshold.

Use a device-pixel-ratio-sized backing store for charts/text. This differs from the map, whose backing store stays in logical cell resolution. Each chart refresh reads a coherent frame. The reference's generated histories are illustrative and must be replaced with engine samples.

## 7. Controls and event surfaces

Phase badge uses turn counts: `HALFTIME IN 180 TURNS`, `POST-HALFTIME · 60% TO WIN`, `FULLTIME IN 150 TURNS`. Never show a confident wall-clock countdown because speed and performance change. A playback pause stops simulated progress; decorative one-shot UI effects may finish in real time. Speed selection does not affect effect duration.

Near-victory status accents the leader meter, not arbitrary controls. Base notifications appear in recent events with team letter/colour, turn and coordinates in a tooltip or expanded view. A real button only blinks/pulses if it also has an action, such as opening event history; passive badges should not look clickable. No full-map flashes, screen shake or automatic camera movement.

Production recent events shows two newest entries plus access to history. A history drawer may hold 200 recent presentation entries while exported results retain authoritative engine events according to application policy. Use gentle real-time grouping and a log rather than flooding live announcements. Keep losses red, creations in team colour, phase alerts amber. See EVENTS.md for timings.

## 8. Integration sequence

1. Extract tokens and icon assets; build static layout against live existing stats without changing engine code.
2. Add view-adapter fields for semantic cells, immutable base positions and frame IDs. Map stable team IDs to display colours and letters.
3. Reimplement the pixel palette and marker overlay; validate exact base/food/ant collisions at both scales.
4. Add worker hooks after successful base creation and before base removal, preserving old owner and attacking team. Do not infer base destruction merely from an aggregate counter change.
5. Derive leader changes after an entire authoritative turn, not inside one ant action. Observe every simulation turn in the worker if display frames are skipped; emit a bounded event stream.
6. Add turn history, current metrics, chart pointer interaction and milestone state machine.
7. Attach real actions for pause/speed/setup, and remove reference controls, synthetic generators and inspection hooks.
8. Run acceptance checks and compare unchanged seed/parameters/ant outcomes before and after the presentation work.

## 9. Performance and accessibility

Keep simulation in the worker. Render at most once per animation frame; copy/transfer dirty rectangles or compact cell state, not all ant memories. Update text/standings around 4–10Hz; sample history in the worker so fast runs do not lose chart events. Buffer arrays must have explicit ownership when transferred. Check battle ID and monotonic sequence to drop stale frames from parallel runs. Viewing disabled should also disable expensive presentation work.

Do not perform synchronous reads of Canvas pixels per hover. Use the semantic cell snapshot. Group animations, cap concurrent overlays at eight, and preserve all event counts even when effects are dropped. Pause decorative work in hidden tabs; on return show a summary rather than replaying a backlog.

Respect `prefers-reduced-motion` and an in-app motion setting. In reduced motion use stationary outlines and persistent text rather than pulses. Keyboard focus must be visible; selected state uses outline/text as well as colour. Chart has a textual equivalent in the table. Use a polite live region for batched important events, not every ant action. Optional sound starts disabled and is not part of this package.

## 10. Acceptance checklist

- Full 530×530 and rectangular 512×384 maps have correct proportions and integer scaling; no zoom control or inset.
- Ten races fit without inner table scrolling; 5–9 do not create blank roster entries.
- Colours/letters remain attached to IDs after sorting or leader changes.
- Empty and occupied bases remain distinguishable from food; marker toggle restores exact pixels.
- Different teams cannot simultaneously occupy the same cell in a misleading depiction.
- Actual engine outcomes and ant execution are unchanged for an identical seeded battle.
- Victory meter matches top-two formula, threshold shifts at halftime, TIMEOUT wins precedence and ties do not spam notifications.
- Current strength, ants and bases agree algebraically; overall shares sum to 100% within rounding tolerance.
- Chart never extends beyond the latest data; sudden losses survive downsampling.
- A base created and destroyed between displayed frames produces both authoritative events.
- Effects last roughly the specified real-time durations at all speeds and cannot change simulated counts.
- Reduced motion, keyboard row selection, long names, viewport resizing and stale frames work.
- No synthetic data, demo buttons or QA inspection hooks ship in the production game.
