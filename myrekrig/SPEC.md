# MyreKrig JS — Proof-of-Concept Specification

**Status:** Draft 2. All open questions from draft 1 are answered (§11). Nothing is built yet.
**Scope:** A browser-only re-creation of MyreKrig that runs on a Chromebook, can run the
historic C ant races, and reproduces the original engine's behaviour closely enough that
someone who knows the game can confirm it plays the same.

---

## 1. Goals and non-goals

### Goals
1. **Faithful rules.** Implement the MyreKrig rules by Aske Simon Christensen exactly, including
   the random-number generator.
   - Source versions: **v2.4.6 (07.03.03)**, the copy from the time, and **v2.4.7 (26.06.03)**,
     from the 2011 GitHub fork.
   - These two **play identically.** 2.4.7 only changed how CPU time and some internal food
     statistics are counted, and neither affects a battle.
   - A battle started with the same seed, parameters and ants plays out identically to the
     original engine (see §7).
2. **Reproducible.** The same seed, parameters and ant list always give the same battles and the
   same results table, apart from the measured CPU-time columns (§8).
3. **Runs in a browser.** Plain Chrome on a Chromebook. No installation, no server and no build
   step for the person using it.
4. **Runs the historic ants.** The C ants from the original tournament run unmodified, compiled
   to WebAssembly.
5. **Lets you write new ants in JavaScript**, directly in the browser.
6. **Watch and measure.** A battle viewer modelled on the original X11/Windows viewer, and a
   tournament mode that prints the same results table as the original.

### Non-goals for the proof of concept
- Server, uploads, accounts, scheduled tournaments, public leaderboard.
- Security sandboxing of untrusted ants. All ants in the PoC are trusted.
- Ant languages other than C (precompiled) and JavaScript.
- Rule changes or "modern mode". We first prove we match the original, then discuss changes.

---

## 2. Architecture overview

```
┌──────────────────────── single HTML file ────────────────────────┐
│ Main thread (UI)                     Web Worker (simulation)      │
│  - setup screen (ants, params, seed)  - game engine (JS)          │
│  - battle viewer + graph    ◄──────►  - JS ants                   │
│  - tournament results table   msgs    - C ants (WebAssembly)      │
│  - JS ant editor                                                  │
└───────────────────────────────────────────────────────────────────┘
```

- **Engine in a Web Worker.** This keeps the page responsive, and a runaway ant can be stopped by
  terminating the worker.
- **The viewer** receives map changes and draws them on a canvas. For speed, many turns are
  simulated per animation frame.
- **Delivered as one self-contained HTML file.** The worker and WebAssembly ants are embedded
  inline.
  - You download it and open it in Chrome from the Chromebook's Files app. It also works offline.
  - A build script (run by Claude/CI, not by you) produces the file from the sources.

---

## 3. Game rules (classic)

This section is the authoritative description of the rules for the new engine. It describes
behaviour, not code.

### 3.1 Constants
| Name | Value | Meaning |
|---|---|---|
| `NewBaseAnts` | 25 | Ants consumed when building a base |
| `NewBaseFood` | 50 | Food consumed when building a base |
| `MaxSquareAnts` | 100 | Max own ants that can *move into* a square |
| `MaxSquareFood` | 200 | Max food that can be *carried into* a square |
| `BaseValue` | 75 | Score value of a base (= 25 + 50) |
| `TimeRate` | 10 | Every ant call draws one random number for time sampling (§3.10) |
| `LastFoodMem` | 42 | Food placement remembers the last 42 piles |
| `BasePlaceTries` | 10000 | Attempts when placing starting bases |

### 3.2 Battle parameters
Each battle draws every parameter uniformly from `[min, max]`.

| Parameter | Default min | Default max |
|---|---|---|
| MapWidth, MapHeight | see below | see below |
| StartAnts | 15 | 40 |
| NewFoodSpace | 10 | 50 |
| NewFoodMin | 10 | 30 |
| NewFoodDiff | 5 | 20 |
| HalfTimeTurn | 10000 | 10000 |
| TimeOutTurn | 20000 | 20000 |
| WinPercent | 75 | 75 |
| HalfTimePercent | 60 | 60 |
| BattleSize (teams per battle) | all teams | all teams |
| NumBattles (per tournament) | 100 | — |

**Default map size.**
1. Let `v` be the smallest integer with `v² ≥ floor((BattleSizeMin + BattleSizeMax) / 2) × 200²`.
2. The defaults are then width and height in `[floor(v × 100 / 200), v]`.
3. After drawing, each dimension is **rounded up to a multiple of 64**.

**Validation.** If BattleSizeMax is 0 or greater than the number of teams, it is set to the
number of teams. If BattleSizeMin is 0 or greater than the max, it is set to the max.

All parameters can be set in the UI. These are the same parameters as the original command line:
`w/W h/H a/A f/F m/M d/D t/T o/O p/P e/E b/B n s z`.

### 3.3 The map
- The map is a torus: `MapWidth × MapHeight` squares, wrapping in both directions.
- Each square holds:
  - `NumAnts` (8-bit unsigned)
  - `Base` (0/1)
  - `Team` (owner team id; **kept even after the square empties**)
  - `NumFood` (8-bit unsigned)
  - an **ordered list** of the ants on it
- All ants on one square belong to the same team.
- The list order matters, because it determines the order of `mem[1..]` given to an ant (§3.10).
  - New and moving ants are appended at the end.
  - A base builder is re-inserted at the front (§3.6).

### 3.4 Battle setup
The sequence below is listed in exact random-number order.

1. `BattleSeed ← GameSeed`.
2. **Draw parameters** in this order, each as `min + Random(max − min + 1)`, even when
   `min = max`:
   1. MapWidth
   2. MapHeight
   3. StartAnts
   4. NewFoodSpace
   5. NewFoodMin
   6. NewFoodDiff
   7. HalfTimeTurn
   8. TimeOutTurn
   9. WinPercent
   10. HalfTimePercent
   11. BattleSize

   Then round the map size up to a multiple of 64.
3. **Pick teams.** For each of BattleSize slots, draw `Random(NumTeams) + 1` until it gives a team
   not already picked.
   - If a *watch team* is set and is not among those picked, the battle is skipped. GameSeed
     still advances.
4. **Place bases.** Repeat 10000 times:
   1. For each slot in order:
      - **team #1** (the first ant in the team list) is always placed at
        `(W/2, H/2)`, with no random draw;
      - other teams get `x = Random(W)`, then `y = Random(H)`.
   2. Compute the smallest pairwise torus Manhattan distance.
   3. Keep this layout if that distance is **strictly greater** than the best so far (best starts
      at 0).
5. **Create starting ants.** For each slot in order, mark the square as that team's base and
   create StartAnts ants on it (§3.9).
6. **Build the team relabel table** (§3.11).
7. Turn counter = 0. No food is placed yet. Food first appears at the end of turn 1.
8. After the battle, `GameSeed ← GameSeed × 123456789 + 12345` (32-bit).

### 3.5 A turn
1. `turn ← turn + 1`.
2. **Every living ant acts once, in random order:**
   - Let `n` be the number of ants that have not yet acted this turn.
   - Pick one with `Random(n)` from the unmoved part of the global ant list.
   - Move it to the acted part, call it (§3.10), then perform its action (§3.6).
   - The exact list bookkeeping must be reproduced, because it determines which ant
     `Random(n)` selects:
     - The picked ant swaps places with the last unmoved ant.
     - New ants are appended after all others and **do not act until the next turn**.
     - Removing a killed ant moves another ant into its slot.
3. **Spawn food** (§3.8).
4. **Check for the end of the battle** (§3.12).

### 3.6 Ant actions
The ant function returns an integer `a`.

| `a & 7` | Move |
|---|---|
| 0 | stay |
| 1 | right (x + 1) |
| 2 | down (y + 1) |
| 3 | left (x − 1) |
| 4 | up (y − 1) |
| 5, 6, 7 | stay |

- `a & 8` means **carry one food** along with the move.
- `a == 16` exactly means **build a base**. With any other bits set it is not a build. For
  example, `17` just moves right.

**Building a base** (`a == 16`) succeeds only if all three hold:
- the square has `NumAnts > 25` (the builder counts, so at least 26 ants);
- the square has `NumFood ≥ 50`;
- the square has no base.

Effect, in order:
1. The builder is set aside.
2. The **first 25 ants in the square's list** are killed. Each kill is credited as a kill *and* a
   death of the builder's own team.
3. The builder is re-inserted at the **front** of the list.
4. `NumFood − 50` new ants are created on the square.
5. The square's food becomes 0, and the base is created.

**Moving** happens if the target differs from the current square and either the target has
`NumAnts < 100` or the target's `Team` differs from the ant's team. Otherwise the move is
silently ignored. When the move happens:
1. **Combat.** If the target's `Team` differs from the ant's team:
   - **every ant on the target dies**, whatever their number, credited to the mover's team;
   - a base on the target is **destroyed**.

   The target's `Team` may be a stale value from an empty square. Kills then are zero, but a
   base on it is still destroyed.
2. The ant moves to the end of the target's list, and the target's `Team` becomes the ant's team.
3. **Food carry.** If `a & 8`, the square just left still has food, and the target has
   `NumFood < 200`:
   - one food leaves the old square;
   - if the target has a base, the food immediately becomes **one new ant** there;
   - otherwise the target gains one food.

**Implementation note.** The original has no limit on ants created *at a base*, either from
carried food or when a base is built. `NumAnts` is 8 bits and wraps at 256. The PoC reproduces
that behaviour and logs a warning if it ever happens.

### 3.7 Edge behaviour to preserve
- An empty square remembers its last owner.
- What an ant sees as `Team` is 0 for squares with no ants and no base (§3.10).
- A base with no ants on it is destroyed by any enemy ant stepping onto it.
- An ant can be killed before it acts in a turn. It then simply does not act.

### 3.8 Food spawning
At the end of each turn, the engine checks whether
`NumAnts + NumFood + 75 × NumBases < floor(W × H / NewFoodSpace)`. Each time the check passes,
it places one pile and checks again:

1. Make 20 candidates. For each, draw `x = Random(W)` and `y = Random(H)` repeatedly until the
   square has no ants, no food and no base.
2. Each candidate's score is its minimum torus Manhattan distance to the last
   `min(piles so far, 42)` pile positions. With no history, the score is `W + H`.
3. Keep the first candidate with the strictly highest score.
4. The pile size is `NewFoodMin + Random(NewFoodDiff + 1)`.

### 3.9 New ants
- A new ant gets age 0 and its brain is zeroed.
- Its first 4 bytes are then set to a random 32-bit value made from two random draws:
  `(first draw << 16) + second draw`, each draw being `Random(65536)`.
- **Draw order (decided).**
  - The original C code, `(Random(1<<16)<<16)+Random(1<<16)`, does not say which of the two
    draws happens first. The C language leaves that to the compiler.
  - Tested: both modern GCC and Clang make the **left** draw first, so the first draw becomes
    the high half. We use that order.
  - Only the two halves of the random value would swap with the other order. Everything else in
    the battle is the same either way.
  - The 2003 Windows build (MSVC) may have used the other order. That can't be checked any more.
- Brains smaller than 4 bytes only see the first bytes of that value.

### 3.10 Calling an ant
1. **One `Random(10)` is drawn first** (the original used it to decide whether to time this
   call). It must be drawn even though the result only affects timing.
2. The ant receives **5 squares**: here, right, down, left, up. Each has `NumAnts`, `Base`,
   `Team` and `NumFood`.
3. **Team relabelling.** A square with ants or a base shows its owner through the calling team's
   relabel table (§3.11): own team → 0, enemies → 1…BattleSize−1. A square with no ants and no
   base shows Team 0.
4. The ant receives the **brains** of all ants on its square:
   - `mem[0]` is itself;
   - `mem[1..n−1]` are the others, in square-list order, with the caller skipped.

   It may read and write all of them. Changes are kept.
5. The ant's age is increased by 1.

### 3.11 Team relabel table
Each battle builds, for each participating team, a mapping from real team to the label it
sees. This must be reproduced exactly:

```
taken[0..BattleSize-1] = 0
for n1 in 0..BattleSize-1:                 # viewer team, in slot order
    t1 = team in slot n1
    taken[0] += 1
    label[t1][t1] = 0
    for n2 in 0..BattleSize-1:             # observed team, in slot order
        t2 = team in slot n2
        if n2 == n1: label[t1][t2] = 0
        else:
            repeat v = Random(BattleSize) until taken[v] <= n1
            label[t1][t2] = v
            taken[v] += 1
```

### 3.12 End of a battle
**One team in the battle:**
- it wins when all food on the map is gone;
- the result is "halftime" (H) instead of a win (W) if that happens at or after
  `HalfTimeTurn`;
- the battle times out (T) at `TimeOutTurn`.

**Several teams:**
1. Each team's value is `ants + 75 × bases`.
2. The leader is the first team, in slot order, with the strictly highest value.
3. The runner-up value is the second-highest value.
4. After each turn, check in this order:
   1. `turn ≥ TimeOutTurn` → **T**, and the leader wins.
   2. `turn ≥ HalfTimeTurn` and `leader × 100 ≥ (leader + runner-up) × HalfTimePercent` →
      **H**.
   3. `leader × 100 ≥ (leader + runner-up) × WinPercent` → **W**.

Example: if every other team is wiped out, the runner-up value is 0 and the leader wins
immediately.

### 3.13 Random-number generator
All game randomness comes from one 32-bit generator per battle:

```
Random(num):
    BattleSeed = (BattleSeed × 1805 + 7) mod 2³²
    a = BattleSeed
    return (((a << 19) + (a >>> 13)) mod 2³²) mod num
```

Notes:
- 1805 is the original's `42*42-42/42+42`.
- All arithmetic is unsigned 32-bit, as on the 32-bit machines of 2003.
- The 2011 GitHub fork switched to 64-bit arithmetic, which changes every battle. **We follow the
  2003 32-bit behaviour.**
- The game seed defaults to the current time, or is set by the user. It is always displayed so a
  run can be repeated.

---

## 4. Ant interface

### 4.1 What an ant is, in plain words
This works the same in C and JavaScript.

- **An ant race is one function** plus a description of its **brain**.
- **The brain** is a few small numbers each ant carries around. Its memory.
- **Every turn the game asks each ant: "where do you go?"**, and calls your function with two
  things:
  1. **What the ant sees:** its own square and the 4 squares around it. For each square, how
     many ants are there, whether there is a base, which team, and how much food.
  2. **The brains of the ants on its own square.** Its own brain comes first. It can read and
     change all of them, and that is how ants talk to each other.
- **The function answers with one number:**
  - 0 = stay
  - 1 = right
  - 2 = down
  - 3 = left
  - 4 = up
  - add 8 to the move to carry one food along
  - exactly 16 = build a base here

### 4.2 JavaScript ants
A JavaScript ant is the same idea written in JavaScript. Here is **Rambo** in both languages:

**C (original):**
```c
#include "Myre.h"
struct rb {
};
int RB(struct SquareData *f, struct rb *m) {
	int i = 0;
	int max = 0;
	int best = 0;
	for(i = 1; i < 5; i++){
		if(f[i].Base == 1)
			return i;
	}
	for(i = 1; i < 5; i++){
		if(f[i].Team > 0){
			if (f[i].NumAnts > max){
				max = f[i].NumAnts;
				best = i;
			}
		}
	}
	return best;
}
DefineAnt(Rambo, "Rambo#FF0000", RB, struct rb);
```

**JavaScript (new):**
```js
export default {
  title: "Rambo#FF0000",
  brain: [],                          // Rambo remembers nothing (0 bytes)

  step(f, m) {
    let max = 0;
    let best = 0;
    for (let i = 1; i < 5; i++) {
      if (f[i].base == 1)
        return i;
    }
    for (let i = 1; i < 5; i++) {
      if (f[i].team > 0) {
        if (f[i].ants > max) {
          max = f[i].ants;
          best = i;
        }
      }
    }
    return best;
  },
};
```

The differences:

| C | JavaScript |
|---|---|
| `DefineAnt(Rambo, "Rambo#FF0000", RB, ...)` | `title: "Rambo#FF0000"` |
| `struct rb { ... }` (the brain) | `brain: [ ... ]` (see below) |
| `int RB(struct SquareData *f, struct rb *m)` | `step(f, m)` |
| `int i = 0;` | `let i = 0;` (no types in JavaScript) |
| `f[i].NumAnts`, `f[i].Base`, `f[i].Team`, `f[i].NumFood` | `f[i].ants`, `f[i].base`, `f[i].team`, `f[i].food` |
| `f->NumAnts` (= `f[0].NumAnts`) | `f[0].ants` |
| `m->x` (= `m[0].x`) | `m[0].x` |
| `m[a].x` (another ant's brain) | `m[a].x` |

Loops, `if`, `return`, arithmetic and comparisons are written the same way in both languages.

**The brain.** In C, the brain is a `struct`. In JavaScript you list the same fields with a name
and a size. Here is **Legions'** brain:

```c
struct LegionsBrain {
	signed char x,y,z,w;
	unsigned char v;
};
```
```js
brain: [
  ["x", "i8"], ["y", "i8"], ["z", "i8"], ["w", "i8"],   // signed char  = i8
  ["v", "u8"],                                         // unsigned char = u8
],
```

| C type | JS size name | Range |
|---|---|---|
| `signed char` / `char` | `i8` | −128 … 127 |
| `unsigned char` / `u_char` | `u8` | 0 … 255 |
| `short` | `i16` | −32768 … 32767 |
| `unsigned short` / `u_short` | `u16` | 0 … 65535 |
| `int` / `long` | `i32` | about ±2.1 billion |
| `unsigned int` / `u_long` | `u32` | 0 … about 4.3 billion |
| `u_char path[16]` (array) | `["path", "u8", 16]` | use as `m[0].path[3]` |

Brain fields behave like the C types:
- Storing 300 in a `u8` gives 44, exactly as in C.
- The brain size is counted the same way as in C, so Prestige is comparable between C and JS
  ants.
- A newborn ant's brain starts at 0, except **the first 4 bytes, which start random** (§3.9),
  just as in C. SkyNET's 1-byte brain and Legions' 5-byte brain behave exactly as before.

**Reproducibility rules for JS ants.**
- `Math.random()` inside an ant is replaced by a generator seeded from the battle seed, so it is
  reproducible.
- Clocks (`Date`, `performance`) are not available to ants.
- Variables outside `step` persist for the whole battle, like C globals. They are reset at the
  start of every battle.

### 4.3 C ants (historic and new)
- **Source compatibility.** Source files compile unchanged against a `Myre.h` that provides the
  same `struct SquareData`, constants and `DefineAnt(name, title, func, braintype)` macro as the
  original.
- **Build.** Each ant is compiled with `clang --target=wasm32 -O2 -fsigned-char` into a separate
  WebAssembly module.
  - wasm32 has 32-bit `int`, `long` and pointers, and signed `char`, matching the original
    32-bit Linux build.
  - **One possible difference:** wasm32 aligns `long long` and `double` to 8 bytes, while i386
    used 4. A brain struct containing those types may get a different size. The build will
    report each ant's brain size so these cases can be checked.
- **Per call**, the engine copies the brains into the module's memory, calls the function, and
  copies them back. This is exactly what the original did.
- **C library.** The ants use a small set of library calls, provided by a minimal built-in C
  library:
  - `printf`/`fprintf` → shown in a debug console, off by default;
  - `memset`, `sqrt` → compiled in;
  - `exit` → stops the battle with error code **E**;
  - `rand`/`srand` (used by GOA and borg) → **decided:** a copy of the Linux (glibc) generator,
    so the numbers look the same as on Linux. Each team gets its own generator, **reset at the
    start of every battle** as if the program had just started.

    The original shared one generator across all ants and all battles. That made a battle
    depend on the battles before it, so the original wasn't fully reproducible for these two
    ants. Resetting per battle keeps every battle reproducible from its seed.
- **Global variables** keep their values between calls, as in the original. **Decided:** they are
  allowed in the PoC.
  - Each team gets its own module instance, which is reset at the start of every battle.
  - Ants that use them (`myresyre`, `borg`, `GridAnt`) are labelled "uses global state" in the UI.
- **Brain size** is the size of the brain type, as in the original. It is shown in the table and
  used for Prestige.

---

## 5. Browser application

### 5.1 Setup screen
- Pick participating ants from the built-in list and from JS ants loaded or edited in the
  browser.
  - The order of the list matters, because it decides team letters A, B, C… and which team starts
    in the centre. The order is shown and can be changed.
- Set parameters (all of §3.2) and the seed, with an option for a random seed.
- Choose a mode: **Watch battles**, or **Run tournament** (no drawing, full speed).

### 5.2 Battle viewer
Modelled on the original X11/Windows viewer (`MK_XWin.c` 0.12.3, `MK_MSWin.c`), with a few
modern additions.

**Map: one pixel per square, colours as in the original:**

| Square | Colour |
|---|---|
| has a base | white |
| ants carrying food (ants and food on the square) | light team colour |
| ants without food | team colour |
| empty but owned (territory), no food | dark team colour (= colour ÷ 4) |
| food only | grey, brighter with more food (7 shades), white from 29 food up |
| nothing | black |

- Team colours come from the `#RRGGBB` in the title, or are derived from the name with the
  original formula.
- The light version is `colour ÷ 2 + 128`.

**Team stats under the map:** one row per team, showing
- the name;
- the number of bases;
- territory (squares owned);
- the number of ants;
- a bar made of territory (dark colour), bases × 75 (white) and ants (team colour);
- a scale with a line every 100;
- the red **win line**, which marks where the leader would win.

**Timeline graph** (separate panel): each team's `ants + 75 × bases` over turns, plus the win
line, rescaling every 1000 turns or 1000 points.

**Title line:** battle number / total, and turn.

**Keys (as the original):**

| Key | Action |
|---|---|
| F1 | skip battle |
| F2 | interrupt battle (counted as result I) |
| F3 / Esc | stop tournament |
| F4 | restart battle |
| F5 | make this the last battle (press again to undo) |

Chromebooks have no F-keys, so each of these also gets a button.

**Display options (as the original's command-line switches):**
- hide territory (`-t`);
- hide ants without food (`-a`);
- hide graph (`-g`);
- team-stats update interval (`-s`);
- map update interval (`-u`).

**Modern additions:**
- zoom (whole pixels: 1×, 2×, 3×…);
- pause and single-step;
- a speed slider;
- hovering over a square shows its exact contents.

**Result line** at the end of each battle, in the original format:
`Batt Randomseed Widt Heig Ant Spc Min Dif Teams Turns T Winner`.

### 5.3 Tournament runner
- Runs N battles in the worker and prints the original header block, one line per battle, and
  the final table.
- Columns: `Team Battles Won Bases Ants Size Ages Comb Time Vict Perf Pres`, with the original
  definitions:

  | Column | Meaning |
  |---|---|
  | Bases | bases built per battle |
  | Ants | ants born per battle |
  | Size | average living ants per turn |
  | Ages | average age at death |
  | Comb | kills ÷ (kills + deaths) |
  | Time | ns per ant call |
  | Vict | win % |
  | Perf | Vict × median time ÷ own time |
  | Pres | Vict × median brain size ÷ own brain size (size 0 counts as 10 × median) |

- **Time / Perf (decided):** kept, and marked as approximate.
  - Time is measured by timing batches of calls with `performance.now()`, because browser timers
    are too coarse for single calls.
  - The numbers will not equal the original's. They are only comparable between ants on the same
    machine, and JS vs WebAssembly ants are not directly comparable.
  - Time and Perf are the only values that can differ between two runs with the same seed.
- Results can be copied as plain text.

### 5.4 Performance target
- A typical 2–4 team battle should be watchable in real time on a mid-range Chromebook.
- A 100-battle tournament with ~10 teams should finish in minutes, not hours.
- These will be measured during the PoC and reported, not guaranteed up front.

---

## 6. Repository layout (proposal)

```
myrekrig/
  SPEC.md                 this document
  engine/                 game engine (JS, no dependencies)
  ui/                     viewer, setup, tournament UI
  ants/c/                 Legions, SkyNET, Rambo (yours; see §10)
  ants/js/                JS ants (Rambo port as the first example, more later)
  tools/                  build script (C → wasm, bundle single HTML),
                          reference-engine comparison harness
  tests/                  rule tests and comparison tests (Node)
```

- The other historic ants are **not** copied into this repository (see §10). The build script
  fetches them from the public 2011 repository at build time.
- The built HTML file is not committed. Claude sends it to you directly.

---

## 7. Verification against the original

1. **Reference engine.** Build the original v2.4.7 engine (gameplay-identical to your 2.4.6) with
   32-bit arithmetic. Add only a trace module, written using the original's own display-module
   hooks (`SysDrawMap`, `SysSquareChanged`, like `MK_Quiet.c`), so the engine's logic is
   untouched. The trace prints a checksum of the full map state every turn, plus the battle
   result lines.
2. **New engine.** Run with the same seed, parameters and ants, and produce the same trace.
3. **Comparison.**
   - The turn-by-turn checksums must match exactly.
   - The first difference pinpoints the turn and square, which makes bugs quick to find.
4. **Test matrix:**
   - every historic ant that compiles, alone (BattleSize 1);
   - pairs;
   - groups of 4–8;
   - all at once;
   - several seeds and parameter settings, including edge settings (tiny maps, huge
     StartAnts, NewFoodSpace 1);
   - **your ants (Legions, SkyNET, Rambo) in every category.**
5. **Your verification.** You watch battles with ants you know, and run your own ants, to confirm
   the game *feels* right.
6. **Known limits.**
   - The reference is a modern compiler build, not the 2003 binary. The only known
     compiler-dependent detail is §3.9.
   - Some historic ants did not compile in the 2011 fork. The build will list them, and we can
     decide whether to patch them.

---

## 8. Reproducibility

The same:
- engine version,
- ant list (in the same order),
- parameters, and
- game seed

always give:
- the same battles, turn by turn;
- the same battle result lines;
- the same results table, except **Time** and **Perf**, which are measurements.

How this is guaranteed:
- All game randomness comes from the seeded generator (§3.13).
- C ants' `rand()` is reset per battle (§4.3).
- JS ants' `Math.random()` is seeded, and clocks are hidden from ants (§4.2).
- Global state in C and JS ants is reset at the start of each battle.
- No part of the game depends on timing, the browser, or the machine.

The game seed is always shown, and the full setup (ants, order, parameters, seed) can be copied
as text and pasted back in to repeat a run exactly.

---

## 9. Hosting

**Decided for the PoC:** a single HTML file you download and open in Chrome on the Chromebook.
It needs no internet and no installation.

**Later option:** publish to a subdirectory of AK47.dk, with GitHub in between. A GitHub Action
would build the page on every change and upload it to the web host, for example via SFTP.
- A public page can only include ants we may publish: yours, new ones, and any historic ants
  whose authors agree (§10).
- Your private copy can still include all historic ants.

---

## 10. Licensing

- The original engine and the historic ants carry copyright notices but **no licence**.
- The new engine is written fresh from the rules in this document, not translated from the
  original source. Game rules and algorithms as such are not protected by copyright.
- **Your ants (Legions, SkyNET, Rambo)** are your own work. They can be committed to this repo and
  published.
- **Other historic ants** are used for testing only. They are not committed and not published,
  unless their authors agree. The HTML file Claude sends you may include them for your private
  testing.
- Recommended before any public version: contact Aske Simon Christensen. His permission, or an
  open licence on the original, would remove all doubt.

---

## 11. Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Which version | Rules of 2.4.6/2.4.7 (identical gameplay). You don't remember any rule changes. |
| Q2 | Your ants | Legions, SkyNET, Rambo. Included in the repo and used as key test cases. |
| Q3 | JS brain format | Typed field list, explained in plain words in §4.1–4.2. |
| Q4 | Random draw order for new ants | Left draw first, as in modern GCC and Clang (§3.9). |
| Q5 | `rand()` in C ants | Linux-compatible, per team, reset every battle. Fully reproducible (§4.3, §8). |
| Q6 | Global state in C ants | Allowed in the PoC, labelled in the UI. |
| Q7 | Time / Perf columns | Kept, marked approximate. |
| Q8 | Hosting | Downloadable single HTML file. AK47.dk via GitHub later. |
| Q9 | Viewer | Recreate the original viewer, with stats bars, graph, keys and switches (§5.2). |

**Still open** (not blocking the start):
- Whether to patch historic ants that don't compile. Decided when we see the list.
- AK47.dk hosting details (access method, subdirectory name). Not needed for the PoC.
