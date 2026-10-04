# STRANGE GAME — a global thermonuclear simulation (prototype)

A turn-based nuclear-strategy game in a single HTML file. Gameplay draws on *Nuclear War* (New World Computing, 1989); the look draws on the WOPR terminal and NORAD big board from *WarGames* (1983).

**Play:** open `index.html` in any modern browser. Works with keyboard, mouse, or touch, on desktop or phone. No build step, no dependencies.

---

## The loop

1. **Boot.** A WOPR-style terminal. You log on (try `HELP GAMES`, or the old backdoor password from the film), Cassandra asks how you feel, then offers the game list. Ask for Global Thermonuclear War and it suggests chess instead.
2. **Pick a side.** There are 10 leaders with pun names. Each runs a fictional nation and has its own perk, starting arsenal, and AI personality.
3. **Play turns.** You get one action per turn. Then each AI leader acts, then the world updates.
4. **Answer Cassandra.** Most turns open with a dilemma, a negotiation, or an early-warning alarm. Your answers change stats, AI relations, your psych profile, and which ending you can reach.
5. **Debrief.** The end screen shows the outcome, your psych profile, an XP count-up, rank and unlock progress, near-misses, and a classified dossier to decrypt.

### Actions
| Key | Action | What it does |
|---|---|---|
| 1 | Build | Warheads, hypersonics (~90% get through shields) or interceptors |
| 2 | Nuclear strike | Fire 1, 3, or 6 warheads, or 1 hypersonic. At DEFCON 3+ it counts as a **first strike**, and every nation turns on you. |
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

### Cassandra's questions
There are 17 dilemmas, each with 2–3 choices. Examples: pre-delegated "dead hand" launch authority, fabricated WMD evidence, disarmament protests, a drunk 3 AM red-phone call, giving the AI autonomous launch authority, bunker seat allocation, deepfakes, warhead tests, refugees, spies, coup plots, famine, a Mars-shuttle seat. Some have delayed consequences: an exposed lie hurts two turns later, and an ignored coup plot strikes the next turn.

**Petrov moments.** A false alarm gives you 15 seconds to retaliate or wait. Sometimes the attack is real.

**Incoming diplomacy.** AI leaders propose pacts, issue ultimatums, and offer intel trades. You can accept, refuse, call their bluff, or feed them fake numbers.

---

## Retention and reward design

These are standard progression and reward-loop techniques. None are predatory: there is no monetization, no purchases, and no penalty for stepping away.

- **XP and 8 ranks** (Cadet → Professor). Leaders unlock at ranks. The bar fills with a count-up and a promotion fanfare.
- **Ghost Protocol.** Four historical dictators show up as opponents but are locked as player choices. Eliminate one yourself to unlock them ("defeat to unlock").
- **Variable rewards.** After every game you decrypt a dossier with a random rarity (Confidential / Secret / Top Secret / Cosmic). Drops are lore files telling Cassandra's backstory, or terminal skins. The first decrypt is guaranteed Top Secret.
- **Collections.** 20 achievements (one secret), 12 lore files, 6 skins, 8 psych archetypes.
- **Daily Directive.** A seeded world with a daily modifier, the same for everyone that day. ×1.5 XP on first completion, and a streak bonus up to +50% XP. A missed day halves the streak instead of resetting it.
- **Near-miss feedback.** Shows the roll you needed versus what you got ("SO CLOSE"), plus an end-screen list of nearly-earned goals.
- **Moment-to-moment feedback.** XP toasts, multi-intercept callouts, banners, screen shake, CRT flashes, and synthesized audio.
- **Personal memory.** Cassandra greets you with your last session ("you launched 14 warheads… I remember"), and your lifetime profile shapes how the next world treats you.
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
| Flow | `startTurn` → `playerTurn` → `aiTurns` → `endTurn`, `checkEnd` |
| Meta | `showEnd`, `decrypt`, select screen, panels, boot terminal |

### Balance testing
`window.SG` exposes hooks for headless play. `tools/balance-sim.js` drives the real game in headless Chromium with scripted strategies:

```
npm i -D playwright   # once
node tools/balance-sim.js mixed 100
```

Current baseline, wins = victory + superpower: random ≈12%, hawk/smart ≈17%, mixed (pacts plus picking off the weak) ≈29%. A scripted, path-aware dove reaches the secret ending in about 30% of runs. A human who doesn't know the path should find it rarely.

---

## Ideas for next iterations
- Other game modes behind the classified menu entries (Cyber Skirmish, Drone Swarm Tactics, Disinformation Theater) and a pure "last nation standing" mode
- Hot-seat multiplayer or async daily leaderboards
- More leaders, dilemmas, and events; leader-specific dilemma chains
- Shareable end-of-game card ("I found the only winning move")
- Real-world map data and city-level targets
