# Proposed simulator-to-view adapter

The example JSON is a proposed transport shape, not an existing API. Keep the engine independent from the DOM. Translate its existing names in one adapter. Each completed presentation frame must refer to one coherent battle and turn.

## Frame fields

| Field | Meaning |
|---|---|
| `battleId` | Unique battle/restart identity; discard frames for a previous ID |
| `seq` | Monotonically increasing frame sequence for that battle |
| `turn` | Latest completed engine turn represented by all values |
| `map.width,height` | Actual logical dimensions, maximum 530×530 in release 1 |
| `teams[]` | Stable ID, immutable battle slot/order, name, assigned display colour, ants, bases, optional territory/kills/deaths |
| `params` | baseValue, halfTimeTurn, timeOutTurn, winPercent, halfTimePercent from the active battle |
| `bases[]` | Current base positions and owner IDs; state as of this frame |
| `events[]` | Every authoritative event since last acknowledged sequence, not inferred from display frames |
| `history[]` | Turn-indexed strength samples keyed by stable team ID; append-only per battle |
| `outcome` | null while running; else authoritative reason, winner ID(s) if applicable and turn |
| `mapRevision` | Changes when a cell update/full snapshot is issued |

The current simulator sends `frame.slots` with `ants,bases,squares,kill,killed` and palette `pixels`. Keep its worker-based execution. `frame.graph` already contains strength histories; preserve its indexing and translate slots to stable team IDs. Existing aggregated fields can populate the table, but a semantic map update is needed for occupied-base colouring. Existing pixel colours are insufficient to reconstruct all states.

## Semantic cell transport

Choose full typed arrays at initialization and ordered dirty updates afterward. Four semantic fields are sufficient: team index, ant count, food count, base flag. Team index 0 means unowned; 1..N maps into the battle's stable team list. Use typed arrays matching actual engine count semantics; do not narrow wider counters just for graphics. The current implementation uses 8-bit square counters with wrap behaviour; preserve the engine's values rather than “repairing” them in the view.

An illustrative dirty update can be `[cellIndex, teamIndex, ants, food, isBase]`. Batch updates with frame sequence and map revision. Transferable buffers become detached in the sender; use ping-pong buffers or explicit copies. Workers never share mutable view arrays without an intentional synchronization design. After a skipped revision, request a full resync rather than applying deltas to an unknown baseline.

Do not include individual brain memory unless an existing debugger independently requests it. The visual design does not require it.

## Events

Minimum object: `{id,battleId,turn,kind,teamId,x?,y?,previousTeamId?,attackerId?}`. Every event carries a unique sequence/ID. `kind` is one of `base-created`, `base-lost`, `leader-changed`, `halftime`, `battle-ended`; approaching/near-victory alerts are view state, not facts added to the simulation.

Add engine instrumentation at these observed source points in the uploaded HTML:

- Successful base build: the action-16 branch after `sqBase[sq] = 1` and counters update. Emit the creator, x and y. It requires `sqAnts > 25`, `sqFood >= 50`, no base, and the actual build action; available resources alone do not prove that a base will be built.
- Base destruction: movement to an enemy-owned square, inside the `if (sqBase[sq2])` block. Capture `owner`, attacking `team`, destination coordinates and turn before removing the flag. Emit loss, not capture.
- Leader changes: after a complete turn, using `NumAnts + BaseValue*NumBases`. Do not announce each intermediate score change within one ant loop.
- Milestones: detect boundary crossing even if the display skips many turns. Emit once per battle.
- Termination: use the engine outcome including TIMEOUT precedence. UI banners must not invent the winner from a rounded ratio.

A base can be created and destroyed between two visible frames. Both events must survive. A net zero base-count change is not evidence that nothing occurred. Engine event production should not call the DOM, render or alter PRNG usage.

## Computation example

At turn 9,820 with strengths `[1720,1180,1020,820,690]`, total strength is 5,430. A's overall share is 31.68%. The top-two lead ratio is `1720/(1720+1180) = 59.31%`. At the normal 75% threshold A has not won. At turn 10,000 with the same scores and a 60% halftime threshold, A still has not won. Increasing A to 1770 gives exactly 60% against runner-up 1180, and the engine's halftime test can end the battle. Use integer cross-multiplication for the actual rule comparison, as the engine does; rounded display percentages must never determine outcomes.

## Race colours

Display palette belongs to battle slots, independent of rank. Keep original program metadata colour available in details if desired. Some legacy colours are too similar or dark; an assigned spectator palette improves readability without changing program semantics. Always combine the colour with a stable letter/name. Names are untrusted text: use `textContent` or HTML escaping in production, never interpolate uploaded team names into raw HTML as the fixed-name demo does.

## Reset and parallel execution

On new battleId clear base overlays, chart buffers, warning latches, selection if its team is absent, and dedup state. Do not mix history from parallel workers. If an old frame arrives after a restart, ignore it even if its numeric turn is greater. Parallel tournament totals and the selected live battle are separate views; do not show merged totals as one battlefield's population.
