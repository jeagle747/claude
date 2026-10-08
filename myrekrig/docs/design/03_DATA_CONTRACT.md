# Proposed view-adapter contract

This describes the information the UI needs. Adapt the existing simulator messages rather than rewriting its internals. Names below are proposed view fields, not claims about current backend APIs.

## Race identity

```ts
type Race = {
  raceId: string;         // stable across tournament rounds, not an array index
  versionId: string;      // identifies the submitted code being evaluated
  name: string;
  creator?: string;
  definedColor: number | string; // engine RGB integer or #rrggbb
};
type ViewPreferences = {
  theme: 'obsidian' | 'champagne';
  scale: 1 | 2;
  colorMode: 'defined' | 'distinct';
  motion: boolean;
  baseMarkers: boolean;
};
```

Persist preferences in a local settings namespace. They do not belong in simulation configuration. Maintain an immutable race metadata registry plus a separate optional palette registry; do not put display overrides into original race objects.

## Battle and coherent frame

```ts
type BattleMeta = {
  battleId: string;
  mode: 'live' | 'replay';
  gridWidth: number;
  gridHeight: number;
  raceIds: string[];
  seed: string;
  engineVersion: string;
  rulesVersion: string;
  baseValue: number;
  halftimeTurn: number;
  timeoutTurn: number;
  winPercent: number;
  halftimePercent: number;
};
type RaceStat = {
  raceId: string;
  ants: number;
  bases: number;
  strength: number;
  eliminated: boolean;  // authoritative status, not inferred solely from ants
};
type Frame = {
  battleId: string;
  sequence: number;     // monotonic; reject stale or wrong-battle frames
  turn: number;
  paused: boolean;
  stats: RaceStat[];
  // Packed semantic cell buffer or authoritative dirty-cell updates:
  // coordinates, race ownership/occupancy, ants, food and base state.
  cells: unknown;
  events: BattleEvent[];
  outcome?: { winnerRaceIds: string[]; reason: string };
};
type BattleEvent = {
  battleId: string;
  eventId: string;
  turn: number;
  type: 'base-created' | 'base-destroyed' | 'leader-changed' |
        'halftime' | 'timeout' | 'battle-ended';
  raceId?: string;
  previousOwnerRaceId?: string;
  attackerRaceId?: string;
  x?: number;
  y?: number;
};
```

Colour-composited pixels alone are insufficient for reliable base events, ownership changes and palette toggles. Prefer semantic cell data or keep a semantic buffer alongside pixels. Do not infer destroyed-base events solely from changes in aggregate base counts.

Worker updates should include frame identity and buffer ownership. Render at most once per animation frame. Update tables/text approximately 4–10 times per second rather than for every simulated turn. Sample history in the worker to preserve short spikes when playback is fast. Map pointer inspection should use semantic data, not synchronous canvas pixel reads.

## History/replay data

Retain race metadata, code version IDs, rules/engine versions, seed/configuration, snapshots or deterministic replay inputs, authoritative outcome and events. A seed alone is not enough if code, engine or random number behaviour changes. Recorded snapshots give reliable historical playback; deterministic reruns require version-pinned inputs and reproducibility checks.

At replay time use the race colour metadata stored with that battle. Today’s edited submission must not silently recolour or replace a historical entry. Optional distinct palette remains a view override. Seek requires a snapshot/reset mechanism; hide seek if unavailable. Never run untrusted submitted code in the frontpage's main UI thread merely to animate a replay.

## Rankings

League rating and battle strength are different fields. Define a versioned rating method before publication; the design's sample ratings are not an approved algorithm. Store immutable ranking snapshots with `snapshotId`, league/benchmark version, timestamp, entrant versions, rating method version and completed battle set. Mark historical views read-only.

For LLM runs retain model provider and exact version, prompt/harness version, code-generation run ID, budget, retry/tool policy, generated submission version, validation status and evaluation seed set. Do not imply that one lucky ant program is a definitive model ranking. Expose independent generation runs, failures and uncertainty when the methodology supports them.
