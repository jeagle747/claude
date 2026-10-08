# Events, controls and small animations

## Engine controls at the top

Preserve the current engine adapter. The supplied original simulator maps these buttons and function keys to worker messages `{type: "cmd", code}`. The new view must call the existing dispatcher, not duplicate tournament logic.

| Visible button | Keyboard | Existing code |
|---|---|---|
| Skip battle | F1 | 1 |
| Interrupt | F2 | 2 |
| End tournament | F3 | 3 |
| Restart battle | F4 | 4 |
| Last battle | F5 | 5 |

The old handler also maps Escape to code 3. Preserve only within the active simulation view when no menu/dialog is handling Escape; never end a tournament while a user is dismissing a dialog. Suppress global battle shortcuts while focus is in an input, textarea, select or contenteditable region. Only prevent browser defaults for commands actually handled. Browser/OS-reserved function keys may be unavailable; visible buttons always remain usable.

Retain existing availability/confirmation behaviour; do not add confirmations to ordinary display controls. Buttons disabled by engine state must be visibly disabled with an explanation. Pause/resume, step and speed use existing runtime APIs. Separate recorded-replay commands from live tournament commands: public visitors cannot skip, restart or terminate an operator's tournament. The private runner may show all F1–F5; public replay shows the actions its player supports.

Scale and palette changes never submit commands to the engine. Theme changes never rewrite game colours. The standalone reference only demonstrates the control positions and returns explicit preview feedback for engine actions.

## Notifications without an events log

There is no Recent events panel, persistent event list, log drawer or extra event card. Keep authoritative events in replay/result data for playback and debugging. Surface feedback where it is relevant: map overlays, chart markers, row emphasis, header progress and lead meter. A hidden polite live region supplies grouped accessible announcements.

| Event | Visual feedback | Duration |
|---|---|---|
| Base created | Thin race-coloured square outline expands from 6 to 24 CSS px around the real cell; chart square marker | 650ms |
| Base destroyed | Thin loss-coloured outline contracts from 16 to 6 CSS px; chart cross marker | 480ms |
| New unique leader | Subtle accent wash on the leader row; small chart chevron, no modal | 1200ms |
| Near halftime | Progress midpoint marker gently pulses; caption gives turns remaining | 1600ms cycle until boundary |
| Halftime reached | Update progress caption and effective victory threshold; marker emphasis once | 1200ms then steady |
| Near fulltime | Endpoint marker pulses, caption gives turns remaining; takes precedence over halftime notice | 1600ms cycle |
| Near victory | Lead meter's threshold tick gently pulses; exact ratio/threshold stay readable | Until it exits warning state |
| Battle ended | Persistent result text in header with engine outcome/reason; all warning pulses stop | Until next battle/replay |

Loss colour: use a restrained red such as `#d5555c` in Obsidian or `#ad3139` in Champagne. It encodes a lost-base event only, never the race identity. No explosions, particles, screen shake, full-map flashes or glows around ants. Transient outlines are transparent in the middle and must not obscure the affected cell.

The original mechanics remove an enemy base; do not label this as a captured base unless the actual engine explicitly implements capture. An outline's dimensions are CSS pixels, not a changed base footprint. Clip it to battlefield bounds and do not invent wrapped explosions.

## Milestone logic

Read thresholds, halftime and timeout turns from the active battle configuration. Current legacy defaults are 75% before halftime, 60% afterward, halftime 10,000, timeout 20,000, but these are not constants for the UI. The original engine checks timeout first; after halftime it can also check the normal win threshold. Reflect the real effective threshold; do not alter the winner calculation.

Suggested warning windows: halftime `min(200, max(1, floor(halftimeTurn × .02)))`; fulltime `min(400, max(1, floor(timeoutTurn × .02)))`. Only warn while remaining turns > 0. If fast playback skips a warning window, report the milestone once rather than replaying the obsolete warning. No wall-clock countdown based on uncertain simulation speed.

Near-victory enters when lead ratio is within 5 percentage points below threshold; exits below threshold minus 7 points, on termination or battle change. Re-evaluate on a threshold change. Use engine outcome as final authority. Ties do not produce alternating leader alerts; label joint leaders and preserve stable sorting.

## Scheduling and accessibility

- Emit from authoritative successful state transitions; deduplicate by battle ID + event ID.
- Observe all engine turns even if render frames are dropped. Skipped visual effects must not delete stored events.
- Cap at eight concurrent map effects; batch bursts by race/type over 250ms. Preserve exact event turns in chart data.
- On replay seeking, restore current snapshot immediately and discard in-flight effects. Do not replay every past notification.
- Pause new effects while the tab is hidden. On return, show current state rather than an animation backlog.
- Honour `prefers-reduced-motion` and the existing Motion toggle. Replace expanding/contracting effects with a stationary outline removed after 650ms; phase/threshold indicators stay solid. Never flash faster than the specified gentle cycle.
- Keep text steady during pulses. Group live-region announcements to at most once per second; announce warning entry, not every countdown decrement.
- Chart event markers expose details on hover, focus or touch. Dense events become a count marker. No permanently open log is needed.
- Keep focus attached to the same race ID during reordering. Freeze row movement during direct keyboard/pointer interaction where necessary.

The reference does not simulate this event pipeline; `assets/motion.css` supplies appearance examples to integrate with real events.
