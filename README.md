# STRANGE GAME — a global thermonuclear simulation (beta)

A turn-based nuclear-strategy game in a single HTML file. Gameplay draws on *Nuclear War* (New World Computing, 1989); the look draws on the WOPR terminal and NORAD big board from *WarGames* (1983).

**Play:** open `index.html` in any modern browser. Works with keyboard, mouse, or touch, on desktop or phone. No build step, no dependencies.

---

## ARGUS

The game's AI is **ARGUS**, short for *Autonomous Response & Global Unified Strategy*. It's named after the hundred-eyed watchman of Greek myth. ARGUS runs the briefings, asks the questions, keeps your psych profile, and narrates the simulation.

## First Watch (first run)

A new player starts in **First Watch**: 3 nations, 12 turns, a gentler AI and a smaller arsenal. ARGUS brings systems online one turn at a time, each with a short explanation card:

| Turn | Comes online |
|---|---|
| 1 | Build (warhead research), diplomacy; the four-phase turn is explained |
| 2 | ARGUS's questions, stability |
| 3 | Intel sweep, cyber ops, fog of war |
| 4 | Disinformation, regime collapse |
| 5 | DEFCON, drone swarms, interceptors |
| 6 | Nuclear strikes, the Doomsday Clock, hypersonics |
| 7 | Early-warning alarms, world events |

AI leaders follow the same schedule, so nobody can do something you can't. Locked systems are hidden from the HUD; the command bar teases only the next one. The secret ending is held back for the full game. Finishing First Watch (win or lose) unlocks the full simulation: 5 nations, 25 turns, every system from turn 1, and the Daily Directive.

## The turn

Every turn has four phases, shown in the HUD:

1. **Briefing.** ARGUS reports new systems, consequences of earlier choices, its own remarks and world events, one card at a time in the feed. Then it may ask a question or sound an early-warning alarm.
2. **Orders.** You choose one action and a target. The order is staged, not executed; you can change it.
3. **Simulation.** Press **EXECUTE TURN** (or Enter). Every nation acts once, in an order shuffled each turn. The feed shows one nation per card: a large headline, then results typed out at reading speed. It auto-advances after a pause sized to the text (about 20 characters per second, 2.5–15 s; routine one-liners 1.8 s). Space skips ahead, F fast-forwards, and auto-advance can be switched off. A progress strip shows whose move it is.
4. **Report.** An after-action summary: population change per nation, new or broken pacts, eliminations, your warheads and stability, DEFCON and the clock, and the key events.

## Help

A **? HELP** button (or the `?` key) opens a one-page reference: goal, the four phases, every action with its odds and effects, weapon numbers (damage per yield, interceptor odds, what hypersonics do) and the status meters.

## Readability and pacing (measured)

Real-speed playtests use an instrumented bot that reads at human pace. Before tuning, long simulation steps advanced at 30–60 characters per second, banners replaced each other within 1.5 s, damage labels stacked on the same city, briefing events appeared only in the small log, and pressing Enter to close a pop-up also skipped the next feed step. Now:
- feed steps hold at about 12–20 characters per second
- banners queue, with at least 1.4 s each
- map damage labels stack in separate lanes and stay up for 2.6 s
- every briefing item, including world events, early-warning launches and consequences, gets its own feed card
- the feed ignores skip presses in the first 0.45 s of a pause

A turn takes about 60–100 s at full reading pace; FAST and Space shorten it.

## Nations

Short, memorable names. The humour sits in the leader names and their lines.

| Leader | Nation |
|---|---|
| Donald Trumpet | **Freedonia** (after the Marx Brothers' *Duck Soup*) |
| Vlad Putinov | **Tsaria** |
| Xi Jinpooh | **Cathay** |
| Kim Jong-Fun | **Hermitia**, the Hermit Kingdom |
| Emmanuel Macroni | **Gallia** |
| Elongated Muskrat | **Muskovy**, a sovereign seastead |
| Josef Stalemate | **Comradia** |
| Benito Mussolinguini | **Aldentia** |
| Muammar Gaddafty | **Tentopia** |
| Idi Amok | **Medalia** |

## Engagement design

The design draws on self-determination theory (competence, autonomy and relatedness predict enjoyment and replay), game-feel ("juice") research, and roguelite meta-progression. There are no purchases, no timers that punish stepping away, and no streak that resets to zero.

- **Autonomy:**
  - **Doctrine draft:** pick 1 of 3 random doctrines at the start of each game. The pool grows from 6 to 10 with clearance; unlocks add variety, not raw power.
  - **36 decisions**, each option with a real upside and cost.
- **Competence:**
  - **3 directives per game:** optional goals with live progress and XP on completion.
  - Odds shown before every roll, and a live rank bar in the HUD.
  - **Hot streaks:** growing bonus XP for consecutive successful operations.
- **Public mood:** every answer is tagged popular or unpopular. Unpopular choices build anger, and each further unpopular choice costs more stability. Five units of anger trigger a general strike. Below 35 stability, construction runs at −25%.
- **Juice:**
  - **Particles and glow:** an additive-glow particle system draws launch flares, glowing smoke trails and a re-entry flare.
  - **Detonations scale with yield:** flash, fireball, double shockwave, a rising mushroom of cooling embers and smoke, and sparks.
  - **Cyan intercept bursts.**
  - **Scars and city lights:** glowing scars stay on the map and cool over several turns. Each nation has city lights that go dark as its population falls.
  - **Layered sound:** detonations get a crack, a sub-bass thump and a rumble scaled by yield.

## Variety and replayability

Measured with `tools/balance-sim.js`-style headless runs. Each figure is the share of log lines in a game that repeat (numbers ignored); structural headers are excluded.

| | Before | After |
|---|---|---|
| Varied play: lines repeated within a game | 30% | 15% |
| Passive play (pacts + interceptors): lines repeated | 37% | 24% |
| Passive play: wins | 72% | ~42% |
| Passive play: annihilated or deposed | 7% | ~27% |

What changed:
- **Early-warning alarms:** 8 scenarios drawn from real Cold War incidents (moonrise on radar, a training tape, a failed 46-cent chip, a bear at a fence, a weather rocket, and more).
  - No scenario repeats within a game. There are at least 3 turns between alarms and at most 4 per game.
  - ARGUS's confidence figure tracks the real odds, with noise.
  - **Each time you wait and it turns out false, the next alarm is more likely to be real** (+14% per wait).
  - A third option, SCRAMBLE DEFENSES, spends 2 interceptors for +25% interception this turn.
- **No repeats within a game:** world events, ARGUS remarks (three pools: calm, tense, dark), leader quotes (a varied reaction replaces a repeat), and incoming offers (each leader waits at least 4 turns between offers).
- **Variants:** AI moves, combat reports, drone raids, retaliation, cyber probes, DEFCON messages.
- **Questions not seen in earlier games** are preferred, 80% of the time.
- **Incoming offers have five kinds:** pact, ultimatum, intel trade, a request for interceptors, and a joint campaign against a third nation.
- **The jokes stop as the clock falls.** Below 60 seconds, leaders sometimes switch to sober lines; below 30 seconds, always. ARGUS's remarks darken the same way.

### Mechanisms against autopilot
- **Repetition penalty:** the same order two turns running is 25% weaker, three in a row 50%. Menus show the penalty.
- **Arms race:** each interceptor build costs −3 relations with everyone, and big shields push rivals toward hypersonics.
- **Shields don't deter:** only warheads and hypersonics make rivals hesitate.
- **Pacts expire** after 6–9 turns and must be renegotiated. Pacts no longer warm relations by themselves.
- **Surprises:**
  - military coups that void every treaty a nation signed
  - leaked diplomatic cables
  - hotline cuts
  - surprise election swings
  - stolen warheads (a recent intel sweep traces them in time)
  - accidents at oversized arsenals
  - maintenance scandals that scrap stockpiled interceptors
  - sudden hypersonic breakthroughs

## Clearance ladder

Each completed standard or daily simulation raises your clearance and adds a protocol, introduced with a briefing card:

| Games completed | Protocol |
|---|---|
| 1 | **Ballistic submarines.** Build up to 3. Each hides 2 warheads from drones and sabotage and fires back automatically when you're nuked. Rivals are deterred by them, and rivals build them too. |
| 2 | **Covert ops** (action 8). Plant a mole (permanent intel), steal their largest warhead design, or incite a coup (−25 stability). Failures are often traced back to you. |
| 3 | **Global crises.** Every 5–7 turns: an orbital weapon, grid collapse, emergency UN vote (possibly against you), global famine, or another nation's AI that wants to negotiate with ARGUS. |
| 5 | **Adaptive leaders.** Rivals study your habits across games and counter your favourite tactic. |

## Warhead lottery

Hypersonics are delivery vehicles, not bombs: each one carries one of your warheads, does that warhead's damage, and is intercepted only 10% of the time, against up to 78% for an ICBM.

Every warhead has a rolled yield: 1 MT tactical, 5 MT city-buster, 10 MT metro, 25 MT regional, or 50 MT Tsar-class. Bigger yields are rarer. Researching warheads runs several programs, revealed one by one. Each program produces a random payload; about 7% fail outright and about 4% hit a 50 MT breakthrough. When you strike, you choose which yield to fire. Bigger bombs kill more and move the Doomsday Clock further. Any warhead can misfire (about 4%). Intel reveals a rival's yields, not just its warhead count.

## The loop

1. **Boot.** A WOPR-style terminal. You log on (try `HELP GAMES`, or the old backdoor password from the film), ARGUS asks how you feel, then offers the game list. Ask for Global Thermonuclear War and it suggests chess instead.
2. **Pick a side.** There are 10 leaders with pun names. Each runs a fictional nation and has its own perk, starting arsenal, and AI personality.
3. **Play turns.** You get one action per turn. Then each AI leader acts, then the world updates.
4. **Answer ARGUS.** Most turns open with a dilemma, a negotiation, or an early-warning alarm. Your answers change stats, AI relations, your psych profile, and which ending you can reach.
5. **Debrief.** The end screen shows the outcome, your psych profile, an XP count-up, rank and unlock progress, near-misses, and a classified dossier to decrypt.

### Actions
| Key | Action | What it does |
|---|---|---|
| 1 | Build | Research warheads (random yields), hypersonics (~90% get through shields) or interceptors |
| 2 | Nuclear strike | Two steps: choose the warhead type (one yield, or mixed heaviest-first), then the count (1, 2, 3, 6 or all) and delivery (ICBM or hypersonic). Each option shows the maximum casualties and Doomsday Clock cost; with intel, the target's chance to intercept is also shown. At DEFCON 3+ it counts as a **first strike**, and every nation turns on you. |
| 3 | Drone swarm | Conventional counterforce strike. Destroys interceptors and warheads; DEFCON −1. |
| 4 | Cyber op | Knocks out shields, sabotages warheads, or causes a blackout, plus 3 turns of intel. |
| 5 | Disinfo | Steals a share of a rival's population and drains their stability. At 0 stability the regime collapses. |
| 6 | Diplomacy | Pact, threat, bluff, or aid. Shows your odds; hanging up keeps your turn. |
| 7 | Intel sweep | Reveals every arsenal, names your likeliest attacker, and calibrates early warning. |

### Systems
- **DEFCON 5→1.** Escalation lowers it; two quiet turns raise it. AIs only go nuclear at DEFCON 2 or below, unless they're very aggressive.
- **Doomsday Clock (100 s).** Every detonation costs time. Below 30 s, nuclear winter shrinks every population each turn. At 0, everyone loses.
- **Fog of war.** Rival arsenals show only as ranges until you gather intel (cyber, intel sweep, a turned spy, satellites).
- **Stability.** Nukes, blackouts, disinfo, and bad decisions erode it. At 0 you are deposed, and so are AI regimes.
- **Psych profile.** Aggression, deception, and caution build up from your answers and actions. They change how AIs target you, how credible your diplomacy is, and how the next game starts. A lifetime profile carries over: "the world remembers your last war."
- **AI leaders** have aggression, paranoia, and deceit traits. They hold grudges, retaliate, fear stronger arsenals, pick off wounded nations, sign pacts with each other, and sometimes betray them. Some games seed historic rivalries between AI nations.

### Endings
| Ending | How |
|---|---|
| Victory | You are the last nation standing |
| Superpower | Turn 25 ends with you as the largest surviving nation |
| Cold Peace | Turn 25 ends with someone else on top |
| Annihilated / Deposed | Your population falls below 10%, or your stability hits 0 |
| Midnight | The Doomsday Clock hits zero, and everyone loses |
| **A Strange Game** *(secret)* | Never fire a nuke, hold pacts with every survivor, earn deep trust (relations ≥ 60, from turn 8). Then disarm at the Geneva summit and **do nothing** when the alarm says 214 ICBMs are inbound. |

### ARGUS's questions
There are 17 dilemmas, each with 2–3 choices. Examples: pre-delegated "dead hand" launch authority, fabricated WMD evidence, disarmament protests, a drunk 3 AM red-phone call, giving the AI autonomous launch authority, bunker seat allocation, deepfakes, warhead tests, refugees, spies, coup plots, famine, a Mars-shuttle seat. Some have delayed consequences: an exposed lie hurts two turns later, and an ignored coup plot strikes the next turn.

**Petrov moments.** A false alarm gives you 15 seconds to retaliate or wait. Sometimes the attack is real.

**Incoming diplomacy.** AI leaders propose pacts, issue ultimatums, and offer intel trades. You can accept, refuse, call their bluff, or feed them fake numbers.

---

## Retention and reward design

These are standard progression and reward-loop techniques. None are predatory: there is no monetization, no purchases, and no penalty for stepping away.

- **XP and 8 ranks** (Cadet → Professor). Leaders unlock at ranks. The bar fills with a count-up and a promotion fanfare.
- **Ghost Protocol.** Four historical dictators show up as opponents but are locked as player choices. Eliminate one yourself to unlock them ("defeat to unlock").
- **Variable rewards.** After every game you decrypt a dossier with a random rarity (Confidential / Secret / Top Secret / Cosmic). Drops are lore files telling ARGUS's backstory, or terminal skins. The first decrypt is guaranteed Top Secret.
- **Collections.** 20 achievements (one secret), 12 lore files, 6 skins, 8 psych archetypes.
- **Daily Directive.** A seeded world with a daily modifier, the same for everyone that day. ×1.5 XP on first completion, and a streak bonus up to +50% XP. A missed day halves the streak instead of resetting it.
- **Near-miss feedback.** Shows the roll you needed versus what you got ("SO CLOSE"), plus an end-screen list of nearly-earned goals.
- **Moment-to-moment feedback.** XP toasts, multi-intercept callouts, banners, screen shake, CRT flashes, and synthesized audio.
- **Personal memory.** ARGUS greets you with your last session ("you launched 14 warheads… I remember"), and your lifetime profile shapes how the next world treats you.
- **Locked teasers.** Classified game modes in the boot menu hint at future builds.

Progress is saved in `localStorage` (per browser). The game still works if storage is unavailable.

---

## Code map (`index.html`)

| Section | Contents |
|---|---|
| `DATA` | `LEADERS`, `RANKS`, `ACH`, `DOSSIERS`, `SKINS`, `ARCH`, `MODS` |
| `MAP` | Canvas dot-matrix world (hand-traced polygons), missile arcs, intercepts, swarms, beams, explosions |
| Combat & ops | `strike`, `detonate`, `eliminate`, `drones`, `cyber`, `disinfo`, `intelSweep`, diplomacy |
| AI | `hostility`, `aiAct`, `aiDiplo`, `incomingDiplo` |
| Questions | `DILEMMAS`, `falseAlarm`, `EVENTS`, `summit` |
| Flow | `startTurn` (briefing) → `getOrders` → `simulate` → `endTurn` → `turnReport`, `checkEnd` |
| Yields & First Watch | `YIELDS`, `research`, `takeWarheads`, `FIRST_RUN`, `has()` feature gates |
| Meta | `showEnd`, `decrypt`, select screen, panels, boot terminal |

### Balance testing
`window.SG` exposes hooks for headless play. `tools/balance-sim.js` drives the real game in headless Chromium with scripted strategies:

```
npm i -D playwright   # once
node tools/balance-sim.js mixed 100
```

Add `first` as a third argument to simulate First Watch.

Beta baseline, standard mode, wins = victory + superpower: random ≈8%, hawk ≈6%, mixed (pacts plus picking off the weak) ≈19%. A scripted, path-aware dove reaches the secret ending in about 25% of runs; a human who doesn't know the path should find it rarely. First Watch is deliberately gentle: very few nukes fly and almost no nation is eliminated within 12 turns.

---

## Ideas for next iterations
- Other game modes behind the classified menu entries (Cyber Skirmish, Drone Swarm Tactics, Disinformation Theater) and a pure "last nation standing" mode
- Hot-seat multiplayer or async daily leaderboards
- More leaders, dilemmas, and events; leader-specific dilemma chains
- Shareable end-of-game card ("I found the only winning move")
- Real-world map data and city-level targets
