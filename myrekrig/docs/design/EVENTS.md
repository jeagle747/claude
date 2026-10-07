# Events, motion and notifications

This is a presentation layer. Emit events from successful engine transitions; predictions must not become fictional game events. All durations below are wall-clock milliseconds, independent of turns per second. Retain the original event turn even if notification display is delayed.

| Event | Authoritative trigger | Map effect | Other UI | Duration |
|---|---|---|---|---|
| Base created | Base flag changes 0→1 after a successful build action | One team-coloured square expands from 6px to 24px total width; 1px stroke, fading | Base count updates from snapshot; log entry + chart square | 650ms |
| Base lost | Existing base removed by the engine | Red thin square contracts 16px→6px, tiny cross, fading; core uses new state immediately | Loss entry with old owner; optional attacker detail; chart cross | 480ms |
| Leader changed | Unique maximum-strength team differs from prior unique leader at a completed turn | None | New row amber wash once, log entry, chart chevron | 1200ms, never continuous |
| Halftime approaching | Remaining turns enters warning window while >0 | None | Phase badge border gently breathes; exact turns remain readable | 1600ms breathing cycle until boundary |
| Halftime reached | Turn crosses configured halftime boundary | None | Phase text and threshold change; one log entry; chart boundary | 1200ms emphasis, then steady |
| Fulltime approaching | Remaining turns enters warning window while >0 | None | Amber phase badge, takes priority over halftime warning | Same slow breathing |
| Near victory | Leader ratio is within 5 percentage points below effective threshold | None | Leader meter border breathes; show exact ratio and threshold | Until exit/termination |
| Battle ended | Engine returns termination reason | None | Stop phase pulse; persistent result label; enable next/replay controls as supported | Persistent |

## Base appearance

The permanent base occupies one logical cell, never the width of the animation. Optional 1px corner annotations extend 2px outside that cell at either display scale. A base with ants uses a pastel version of the occupying team's colour; empty base uses ivory. Do not alternate the cell between two colours every frame. The event overlay is a separate transparent canvas, clipped to battlefield bounds and never hit-testable. At a toroidal edge, do not fabricate wrapped explosion geometry; the exact affected cell is sufficient. Display coordinates in event details.

There is no “base captured” event in the inspected movement path: an enemy base is removed. Call it Base lost or Base destroyed; retain previous owner and optional attacker. If future rules add capture, that is a separate explicit event, not a synonym.

## Warning windows and thresholds

Default halftime warning window: `min(200, max(1, floor(HalfTimeTurn*0.02)))` turns. Default fulltime warning window: `min(400, max(1, floor(TimeOutTurn*0.02)))` turns. Settings may change these, but they are presentation settings only. If a fast step skips the entire warning window, emit the milestone event once; do not retroactively animate an “approaching” alert.

The victory ratio is `100*L/(L+R)` for the strongest two teams. Enter near-victory when ratio is in `[threshold-5, threshold)`; exit below `threshold-7`, at termination, or when the battle changes. This 2pp hysteresis avoids flicker. Reset the state when the effective threshold changes. After halftime the engine still checks the normal threshold, so custom parameter combinations must follow its real logic. Show no ratio for a zero denominator. Exact victory is an engine event, never declared by the UI meter.

For a changed leader, debounce presentation for 500ms of real time. Keep engine events if the leadership changes faster, but summarize “3 lead changes” in one notification. A tie means Joint leaders, not a new winner. Keep stable table sorting and skip sound/flash on ties. Base event sequence remains authoritative even if display is suppressed.

## Notification scheduling

- Event ID is unique per battle and sequence. Deduplicate before animation or announcement.
- Retain recent history separately from map effects. A dropped animation must not drop its event.
- At most eight concurrent map overlays. If more arrive within 250ms, summarize by team/type: “C · 4 bases created”. Render the most recent visible anchors up to the cap.
- Priority: battle ended > fulltime milestone > halftime milestone > base loss > base creation > leader change. A low-priority entry may remain in history without displacing the primary badge.
- Show at most two recent entries in the compact panel. Expand opens a keyboard-accessible history drawer. Do not automatically move focus.
- At high speed, events can be observed after their mapped cell has changed again. Keep the current raster exact and identify overlays as events; never restore old cell colours to show the past.
- When paused, current one-shot effects may finish. No new simulation-driven events arrive. Backgrounded tabs discard effect playback and show a count summary on return.
- Live-region announcements are polite and grouped at most once per second. Countdown must not announce every decrement. Announce entry into warning state and arrival at milestone only.

## Motion style

No rapid blinking, strobing, camera shake, particles or whole-screen flash. Alert text stays steady while only border/background alpha slowly varies. One-shot toast entry is 4px upward movement over 160ms ease-out; exit fades over 120ms. Row rank changes can interpolate vertically over 180ms if this does not disturb keyboard focus; freeze row order while a user is clicking/keyboard-navigating, then refresh on release. This optional rank-motion is not implemented in the reference.

Respect both system reduced motion and the in-app toggle. Reduced motion replaces expanding/contracting effects with a stationary 10px outline for 650ms, followed by a persistent log entry; alert badges have a solid amber border. No interpolated counters. Counters always display actual values, never simulated tween values presented as data.

## Reference versus production

The offline demo implements the core appearance, base-effect timelines, milestone transitions, near-meter pulse, team focus, chart cursor and reduced-motion handling. It uses synthetic histories and exposes explicit demo controls. It does not implement the production queue, full history drawer, 500ms leader debounce, near-victory hysteresis, event grouping, elimination status or engine hooks. Those requirements above are implementation work for the programmer, not claims about the reference.
