# MyreKrig JS — Proof-of-Concept Specification

**Status:** Draft 1, for review. Nothing is built yet.
**Scope:** A browser-only re-creation of MyreKrig that runs on a Chromebook, can run the
historic C ant races, and reproduces the original engine's behaviour closely enough that
someone who knows the game can confirm it plays the same.

Open questions are marked **[Q1]**, **[Q2]** … and collected in §11.

---

## 1. Goals and non-goals

### Goals
1. **Faithful rules.** Implement the rules of MyreKrig **v2.4.7 (26.06.03)** by Aske Simon
   Christensen exactly, including the random-number generator. A battle started with the same
   seed, parameters and ants should play out identically to the original engine (see §7).
2. **Runs in a browser.** Plain Chrome on a Chromebook. No installation, no server and no build
   step for the person using it.
3. **Runs the historic ants.** The C ants from the original tournament run unmodified, compiled
   to WebAssembly.
4. **Lets you write new ants in JavaScript**, directly in the browser.
5. **Watch and measure.** Includes a live battle viewer and a tournament mode that prints the
   same results table as the original.

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
│  - canvas battle viewer     ◄──────►  - JS ants                   │
│  - tournament results table   msgs    - C ants (WebAssembly)      │
│  - JS ant editor                                                  │
└───────────────────────────────────────────────────────────────────┘
```

- **Engine in a Web Worker.** This keeps the page responsive, and a runaway ant can be stopped by
  terminating the worker.
- **The viewer** receives map changes (dirty squares) and draws them on a canvas. For speed, many
  turns are simulated per animation frame.
- **Delivered as one self-contained HTML file.** The worker and WebAssembly ants are embedded
  inline. The file then opens straight from the Chromebook's Files app, the same way the
  repository's existing `index.html` does. A build script (run by Claude/CI, not by the user)
  produces that file from the sources. Hosting alternatives are in §9.

---

## 3. Game rules (classic, v2.4.7)

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

All parameters can be overridden in the UI. These are the same parameters as the original
command line: `w/W h/H a/A f/F m/M d/D t/T o/O p/P e/E b/B n s z`.

### 3.3 The map
- The map is a torus: `MapWidth × MapHeight` squares, wrapping in both directions.
- Each square holds:
  - `NumAnts` (8-bit unsigned)
  - `Base` (0/1)
  - `Team` (owner team id; **kept even after the square empties**)
  - `NumFood` (8-bit unsigned)
  - an **ordered list** of the ants on it
- All ants on one square belong to the same team.
- The list order matters, because it determines the order of `mem[1..]` given to an ant (§4.1).
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
   - Move it to the acted part, call it (§3.10), then perform its action (§3.6–3.8).
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
- Its first 4 bytes are then set to a random 32-bit value made from two draws of
  `Random(65536)`, as `(r1 << 16) + r2`.
- **[Q4]** The original's C code does not specify which of the two draws happens first, so it is
  compiler-dependent. We will fix the order to match the reference build (§7).
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
All randomness comes from one 32-bit generator per battle:

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
- The game seed defaults to the current time, or is set by the user.

---

## 4. Ant interface

### 4.1 C ants (historic and new)
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
- **C library.** The ants use a small set of library calls: `printf`/`fprintf` (debug output),
  `memset`, `sqrt`, `rand`/`srand` (GOA and borg), and `exit`. The PoC provides:
  - `printf`/`fprintf` → shown in a debug console, off by default;
  - `memset`, `sqrt` → compiled in;
  - `rand`/`srand` → **[Q5]** a copy of glibc's generator, so those ants behave as on Linux;
  - `exit` → stops the battle with error code **E**.
- **Global variables.** These persist across calls, as in the original. Each team gets its own
  module instance. Some historic ants use them: `myresyre` (shared food coordinates), `borg`, and
  `GridAnt`'s random state. This is allowed in the PoC. Those ants are labelled "uses global
  state" in the UI. **[Q6]**
- **Brain size** is the size of the brain type, as in the original. It is shown in the table and
  used for Prestige.

### 4.2 JavaScript ants
A JS ant is one file, also editable in the browser:

```js
export default {
  title: "MyAnt#39A0F0",            // name, optional #RRGGBB colour (as the original)
  brain: [                            // laid out like a C struct (C alignment rules)
    ["rnd",   "u32"],                 // first 4 bytes are random at birth (§3.9)
    ["x",     "i8"], ["y", "i8"],
    ["state", "u8"],
  ],
  step(squares, mem) {
    // squares[0..4]: {ants, base, team, food}  here, right, down, left, up
    // mem[0]: this ant's brain; mem[1..]: other ants on the square
    // return 0..4, plus 8 to carry food; or exactly 16 to build a base
    return 0;
  },
};
```

- The brain is stored as raw bytes with the declared C-style layout. Brain size is therefore
  well-defined and comparable with C ants.
- Field types: `i8`, `u8`, `i16`, `u16`, `i32`, `u32`, plus fixed-size arrays such as
  `["path", "u8", 16]`.
- **[Q3]** Should a raw-bytes variant also be offered for people who prefer it?
- JS ants could keep hidden state in variables outside `step`. In the PoC that is a matter of
  honour, same as globals in C.

---

## 5. Browser application

### 5.1 Setup screen
- Pick participating ants from the built-in list and from JS ants loaded or edited in the
  browser.
- Set parameters (all of §3.2) and the seed, with an option for a random seed.
- Choose a mode: **Watch one battle**, or **Run tournament** (N battles, no drawing).

### 5.2 Battle viewer
- The canvas draws the full map with zoom and pan.
- Colours:
  - ants and bases in their team colour (from the title, or derived from the name the same way
    as the original);
  - food in a neutral colour;
  - bases clearly marked.
- Controls: pause, single-step, and a speed slider from 1 turn per frame up to as fast as
  possible.
- Live side panel per team: ants, bases, kills, deaths.
- Hovering a square shows its contents.
- At the end, the result is shown as the original's battle line, e.g.
  `1 4087226510  128  128  22  31  18  12 ABC  6114 W A Legions`.

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

- **Time** is measured by timing batches of calls with `performance.now()`, because browser
  timers are too coarse for single calls.
  - It will not equal the original's numbers.
  - It is only comparable between ants on the same machine, and JS vs WebAssembly ants are not
    directly comparable. **[Q7]**
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
  ants/js/                JS ants (examples written by us / you)
  ants/c/                 your own C ants (if you add them)
  tools/                  build script (C → wasm, bundle single HTML),
                          reference-engine comparison harness
  tests/                  rule tests and comparison tests (Node)
  dist/myrekrig.html      built single-file app (not committed if it contains historic ants)
```

The historic ants are **not** copied into this repository (see §10). The build script fetches
them from the public 2011 repository at build time.

---

## 7. Verification against the original

1. **Reference engine.** Build the original v2.4.7 engine from the 2011 repository in **32-bit
   mode**. Add only a trace module, written using the original's own display-module hooks
   (`SysDrawMap`, `SysSquareChanged`), so the engine's logic is untouched. The trace prints a
   checksum of the full map state every turn, plus the battle result lines.
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
     StartAnts, NewFoodSpace 1).
5. **Your verification.** You watch battles with ants you know, and run your own ants, to confirm
   the game *feels* right. This catches anything the reference build itself might differ on from
   the 2003 binaries.
6. **Known limits.**
   - The reference is a modern compiler build, not the 2003 binary, so compiler-dependent details
     (§3.9) follow the modern build.
   - Some historic ants did not compile in the 2011 fork. The build will list them, and we can
     decide whether to patch them.

---

## 8. Milestones

1. **Engine + reference comparison** (Node, no UI): rules, RNG, C ant loading, trace comparison
   passing for the test matrix.
2. **Tournament runner in the browser**: setup screen and results table, as a single HTML file.
3. **Battle viewer.**
4. **JS ants + in-browser editor.**
5. **Your review round**, then fixes.

Each milestone is committed separately for review.

---

## 9. Hosting options for the PoC

| Option | Works on Chromebook | Notes |
|---|---|---|
| **Download the single HTML file and open it** | Yes | Simplest. Works offline. |
| **Private claude.ai artifact link** | Yes | Nothing to set up; private by default. |
| **GitHub Pages** from this repo | Yes | Needs a public repo, or a paid plan for a private one; would publish historic ants (§10). |

Recommendation: a single HTML file, optionally also as a private artifact. **[Q8]**

---

## 10. Licensing

- The original engine and the historic ants carry copyright notices but **no licence**.
- The new engine is written fresh from the rules in this document, not translated from the
  original source. Game rules and algorithms as such are not protected by copyright.
- The historic ants are used **for local testing only**. They are not committed to this repo and
  not published, unless their authors agree.
- Recommended: contact Aske Simon Christensen. His permission, or an open licence on the original,
  would remove all doubt.

---

## 11. Open questions

- **Q1. Version.** Is v2.4.7 (2003) the version you know? Did the website version you played
  later use different rules or defaults, for example a different ant API, other languages, or
  other limits? Any differences you remember are valuable.
- **Q2. Your ants.** Which ant races did you write, and do you still have the source? Are any of
  them among the 52 in the 2011 repository? Your own ants are the best test cases.
- **Q3. JS brain format.** Typed fields as in §4.2 (recommended), raw bytes, or both?
- **Q4. Order of the two random draws for a new ant's first 4 bytes.** Fine to settle it from the
  reference build?
- **Q5. `rand()` in C ants.** Reproduce glibc's generator (recommended), or a simpler stand-in?
- **Q6. Global state in C ants.** Allow, as in the original (recommended for the PoC)?
- **Q7. Time and Perf columns.** Keep them, knowing they are only roughly comparable in a
  browser?
- **Q8. Hosting.** Downloaded single HTML file, private artifact, or GitHub Pages?
- **Q9. Viewer.** Anything from the original X11 viewer you'd like recreated, such as its look,
  keyboard controls, or showing only one team (the "watch team")?
