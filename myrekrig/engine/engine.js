// MyreKrig JS engine.
//
// Implements the classic MyreKrig rules (v2.4.6 / v2.4.7) as described in
// SPEC.md section 3, including the exact random-number sequence, so that a
// battle with the same seed, parameters and ants plays out identically to the
// original engine. Section references (§) point into SPEC.md.
//
// The engine has no dependencies and runs in Node and in a browser worker.

export const NewBaseAnts = 25;
export const NewBaseFood = 50;
export const MaxSquareAnts = 100;
export const MaxSquareFood = 200;
export const BaseValue = NewBaseAnts + NewBaseFood;

const ZeroMemFactor = 10;
const MapSizeMin = 100;
const MapSizeMax = 200;
const TimeRate = 10;
const LastFoodMem = 42;
const BasePlaceTries = 10000;
// The original copies the brains of the ants on a square into one scratch
// buffer (AntTemp) shared by all teams; slots past the last brain keep stale
// bytes from earlier calls of any team. Some ants read one or more slots past
// the end (e.g. Inkal), so the engine keeps the same shared buffer and shows
// the ant this many extra slots of it.
const StaleSlots = 8;
const AntDataSize = 28; // sizeof(struct AntData) on 32-bit x86

// SysCheck() codes (what the viewer can ask for after a turn).
export const SYS = { CONTINUE: 0, SKIP: 1, INTERRUPT: 2, EXIT: 3, RESTART: 4, MAKELAST: 5 };
// Battle termination codes, printed as the letters W H I T E.
export const TERM = { CONTINUE: 0, WIN: 1, HALFTIME: 2, INTERRUPTED: 3, TIMEOUT: 4, ERROR: 5 };
const TERM_LETTERS = "WHITE";

// Battle parameters, in the order they are drawn (§3.4).
export const PARAMS = [
  "MapWidth", "MapHeight", "StartAnts", "NewFoodSpace", "NewFoodMin", "NewFoodDiff",
  "HalfTimeTurn", "TimeOutTurn", "WinPercent", "HalfTimePercent", "BattleSize",
];
const PARAM_LETTERS = "whafmdtopeb";

export function defaultArgs() {
  return {
    Min: { MapWidth: 0, MapHeight: 0, StartAnts: 15, NewFoodSpace: 10, NewFoodMin: 10, NewFoodDiff: 5,
      HalfTimeTurn: 10000, TimeOutTurn: 20000, WinPercent: 75, HalfTimePercent: 60, BattleSize: 0 },
    Max: { MapWidth: 0, MapHeight: 0, StartAnts: 40, NewFoodSpace: 50, NewFoodMin: 30, NewFoodDiff: 20,
      HalfTimeTurn: 10000, TimeOutTurn: 20000, WinPercent: 75, HalfTimePercent: 60, BattleSize: 0 },
    NumBattles: 100,
    GameSeed: (Math.floor(Date.now() / 1000)) >>> 0,
    WatchTeam: 0,
  };
}

// Applies original-style arguments ("n10", "s12345", "b2", "W200", ...) to
// args. Lower case sets min and max, upper case only max. Arguments starting
// with '-' belong to the display module and are ignored here.
export function parseArgs(args, argv) {
  for (const arg of argv) {
    if (arg === "_____" || arg.startsWith("-")) continue;
    const letter = arg[0];
    const m = /^\d*/.exec(arg.slice(1))[0];
    const val = m ? Math.min(Number(m), 0xffffffff) >>> 0 : 0;
    const lo = PARAM_LETTERS.indexOf(letter);
    const hi = PARAM_LETTERS.toUpperCase().indexOf(letter);
    if (lo >= 0) { args.Min[PARAMS[lo]] = val; args.Max[PARAMS[lo]] = val; }
    else if (hi >= 0) args.Max[PARAMS[hi]] = val;
    else if (letter === "n") args.NumBattles = val;
    else if (letter === "s") args.GameSeed = val;
    else if (letter === "z") args.WatchTeam = val;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

// Fills in BattleSize and map-size defaults that depend on the number of
// teams (§3.2). Mutates and returns args.
function finishArgs(args, numTeams) {
  if (!args.Max.BattleSize || args.Max.BattleSize > numTeams) args.Max.BattleSize = numTeams;
  if (!args.Min.BattleSize || args.Min.BattleSize > args.Max.BattleSize) args.Min.BattleSize = args.Max.BattleSize;
  const target = Math.floor((args.Min.BattleSize + args.Max.BattleSize) / 2) * MapSizeMax * MapSizeMax;
  let val = 0;
  while (val * val < target) val++;
  if (!args.Min.MapWidth) args.Min.MapWidth = Math.floor(val * MapSizeMin / MapSizeMax);
  if (!args.Min.MapHeight) args.Min.MapHeight = Math.floor(val * MapSizeMin / MapSizeMax);
  if (!args.Max.MapWidth) args.Max.MapWidth = val;
  if (!args.Max.MapHeight) args.Max.MapHeight = val;
  return args;
}

const roundUp64 = (v) => ((v + 63) & -64) >>> 0;

// Team title and colour (§5.2). `title` is the raw title bytes (Latin-1).
// An explicit colour follows a '#'; otherwise it is derived from the name
// with the original formula.
export function parseTitle(titleBytes) {
  const hash = titleBytes.indexOf(0x23);
  if (hash >= 0) {
    const name = latin1(titleBytes.slice(0, Math.min(hash, 10)));
    const hex = /^[0-9a-fA-F]*/.exec(latin1(titleBytes.slice(hash + 1)))[0];
    return { name, color: (hex ? parseInt(hex.slice(-8), 16) : 0) >>> 0 };
  }
  let col, fac = 424242, l;
  do {
    col = 0;
    for (const b of titleBytes) {
      const c = b < 128 ? b : b - 256; // signed char
      col = ((col >> 5) + Math.imul(col, fac) + c) | 0;
    }
    fac++;
    l = ((col >> 16) & 0xff) * 2 + ((col >> 8) & 0xff) * 3 + (col & 0xff);
  } while (l < 500 || l > 1200);
  return { name: latin1(titleBytes.slice(0, 10)), color: col >>> 0 };
}

const latin1 = (bytes) => String.fromCharCode(...bytes);

// ScaleDiv(a, b, scale) = a*scale/b rounded, computed as the original did in
// 32-bit unsigned arithmetic (so it also matches on overflow).
export function scaleDiv(a, b, scale) {
  a >>>= 0; b >>>= 0; scale >>>= 0;
  while (a < 400000000 && b < 400000000 && scale > 1) { a = Math.imul(a, 10) >>> 0; scale = Math.floor(scale / 10); }
  if (b < scale) return 0;
  const d = Math.floor(b / scale);
  return Math.floor((((a + Math.floor(d / 2)) >>> 0)) / d);
}

// printf-style padding helpers for output identical to the original.
const padL = (v, w) => String(v).padStart(w);
const padR = (v, w) => String(v).padEnd(w);

function newTeamStats() {
  return {
    NumBorn: 0, NumAnts: 0, NumBases: 0, BasesBuilt: 0, SquareOwn: 0,
    Kill: 0, Killed: 0, DieAge: 0, TimesRun: 0, TimesTimed: 0, TimeUsed: 0,
  };
}

function newTotals() {
  return {
    NumBorn: 0, NumAnts: 0, NumBases: 0, BasesBuilt: 0, Kill: 0, Killed: 0, DieAge: 0,
    TimesRun: 0, TimesTimed: 0, TimeUsed: 0, NumTurns: 0, NumBattles: 0, NumWon: 0,
  };
}

const now = (typeof performance !== "undefined" && performance.now)
  ? () => performance.now()
  : () => Date.now();

// A game is a tournament of NumBattles battles.
//
// teams: array of team definitions, in team order (team 1 first). Each has
//   titleBytes: Uint8Array        raw title, as in DefineAnt
//   memSize: number               brain size in bytes
//   newBattle(info): runner       called at the start of every battle;
//     info = { battleSeed, slot, team }. The runner has
//     felt: Uint8Array(20)        5 squares x {NumAnts, Base, Team, NumFood}
//     mem: Uint8Array             room for 255 brains of memSize bytes
//     call(n): number             runs the ant with n brains in mem
//     usesGlobals?: boolean
//
// hooks (all optional), modelled on the original display interface:
//   out(text)                     text output (header, battle lines, table)
//   battleInit(game) -> bool      SysBattleInit
//   drawMap(game)                 SysDrawMap, after every turn
//   squareChanged(x, y)           SysSquareChanged
//   check(game) -> SYS code       SysCheck, after every turn
//   battleExit(game, tc)          after a battle (tc = termination code)
//   battleSkipped(game)           a battle was skipped (watch team not in it)
export class Game {
  constructor(teams, args, hooks = {}) {
    this.teams = teams;
    this.NumTeams = teams.length;
    if (this.NumTeams < 1 || this.NumTeams > 254) throw new Error("Need 1..254 teams");
    this.args = finishArgs(args, this.NumTeams);
    this.hooks = hooks;
    this.out = hooks.out || (() => {});

    this.Max = { ...this.args.Max };
    this.Max.MapWidth = roundUp64(this.Max.MapWidth);
    this.Max.MapHeight = roundUp64(this.Max.MapHeight);

    // Team data, indexed by team number 1..NumTeams (0 is unused, as in the
    // original, but still receives harmless bookkeeping).
    this.team = [null];
    let largestMem = 0;
    for (const t of teams) {
      const { name, color } = parseTitle(t.titleBytes);
      this.team.push({ def: t, name, color, memSize: t.memSize, runner: null });
      largestMem = Math.max(largestMem, t.memSize);
    }
    this.stats = Array.from({ length: this.NumTeams + 1 }, newTeamStats);
    this.totals = Array.from({ length: this.NumTeams + 1 }, newTotals);

    // Brain storage: every ant slot has room for the largest brain, and at
    // least 4 bytes for the random start value (§3.9).
    this.stride = Math.max(4, largestMem);
    // The shared scratch buffer, as large as the original's (calloc'ed once
    // per game, so it persists between battles).
    const antMem = largestMem <= 4 ? AntDataSize : AntDataSize - 4 + largestMem;
    this.antTemp = new Uint8Array(255 * antMem);

    this.BattleSeed = 0;
    this.Used = {};
    this.BattleCount = 0;
    this.BattleTeams = new Uint8Array(this.NumTeams);
    this.TeamIndex = new Uint8Array(this.NumTeams + 1);
    this.TeamShuffle = new Uint8Array(this.NumTeams * (this.NumTeams + 1));
    this.taken = new Uint16Array(this.NumTeams + 1);
    // Persist between battles, as in the original.
    this.Winner = 0;
    this.bestx = new Uint16Array(this.NumTeams + 1);
    this.besty = new Uint16Array(this.NumTeams + 1);
    this.LastFoodX = new Int16Array(LastFoodMem);
    this.LastFoodY = new Int16Array(LastFoodMem);

    this.skipped = false;
    this.NumBattlesSwap = 0;
    this.finished = false;
    this.capacity = 0;
  }

  // --- Random numbers (§3.13) ----------------------------------------------

  random(num) {
    const a = this.BattleSeed = (Math.imul(this.BattleSeed, 1805) + 7) >>> 0;
    return (((a << 19) + (a >>> 13)) >>> 0) % num;
  }

  // --- Main loop ------------------------------------------------------------

  // Runs the whole game. Equivalent to iterating play() to the end.
  run() {
    for (const _ of this.play()) { /* one turn per step */ }
  }

  // Generator that runs the game and yields after every turn, so a viewer can
  // run it in slices. Mirrors main() of the original.
  *play() {
    const args = this.args;
    this.printGameBegin();
    for (this.BattleCount = 0; this.BattleCount < args.NumBattles; this.BattleCount++) {
      let tc = TERM.CONTINUE, sc = SYS.CONTINUE;
      let watchTeamSeen = args.WatchTeam === 0;

      // Set up the parameters for the battle.
      this.BattleSeed = args.GameSeed;
      const Used = this.Used = {};
      for (const p of PARAMS) {
        Used[p] = (args.Min[p] + this.random((args.Max[p] - args.Min[p] + 1) >>> 0)) >>> 0;
      }
      Used.MapWidth = roundUp64(Used.MapWidth);
      Used.MapHeight = roundUp64(Used.MapHeight);

      // Pick the teams.
      for (let n = 0; n < Used.BattleSize; n++) {
        let t;
        do {
          t = this.random(this.NumTeams) + 1;
        } while (this.BattleTeams.subarray(0, n).includes(t));
        if (args.WatchTeam === t) watchTeamSeen = true;
        this.BattleTeams[n] = t;
        this.TeamIndex[t] = n;
      }

      if (watchTeamSeen) {
        this.printBattleBegin();
        if (!this.hooks.battleInit || this.hooks.battleInit(this)) {
          this.battleInit();
          do {
            try {
              this.doTurn();
            } catch (e) {
              // An ant crashed or called exit(): the battle ends with E (SPEC §4.3).
              this.warn(`battle ${this.BattleCount + 1}, turn ${this.CurrentTurn}: ${e.message}`);
              this.termCheck(); // decides the winner from the current state
              tc = TERM.ERROR;
              sc = SYS.CONTINUE;
              break;
            }
            if (this.hooks.drawMap) this.hooks.drawMap(this);
            tc = this.termCheck();
            sc = this.hooks.check ? this.hooks.check(this) : SYS.CONTINUE;
            if (sc === SYS.MAKELAST) {
              if (this.NumBattlesSwap === 0) {
                this.NumBattlesSwap = args.NumBattles;
                args.NumBattles = this.BattleCount + 1;
              } else {
                args.NumBattles = this.NumBattlesSwap;
                this.NumBattlesSwap = 0;
              }
            }
            yield tc;
          } while (tc === TERM.CONTINUE && (sc === SYS.CONTINUE || sc === SYS.MAKELAST || sc > 5));
          this.skipped = false;
          switch (sc) {
            case SYS.SKIP: this.skipped = true; break;
            case SYS.INTERRUPT: tc = TERM.INTERRUPTED; break;
            case SYS.EXIT: args.NumBattles = this.BattleCount--; this.broken = true; break;
            case SYS.RESTART: this.BattleCount--; break;
          }
        } else {
          tc = TERM.ERROR;
        }
        if (this.hooks.battleExit) this.hooks.battleExit(this, tc);
        if (tc) this.printBattleResult(tc);
      } else {
        sc = SYS.SKIP;
        if (this.hooks.battleSkipped) this.hooks.battleSkipped(this);
      }
      if (sc !== SYS.RESTART) args.GameSeed = (Math.imul(args.GameSeed, 123456789) + 12345) >>> 0;
    }
    this.printGameResult();
    this.finished = true;
  }

  // --- Battle setup (§3.4) --------------------------------------------------

  ensureCapacity(n) {
    if (n <= this.capacity) return;
    const cap = Math.max(n, this.capacity * 2, 1024);
    const grow = (Type, old, size) => { const a = new Type(size); if (old) a.set(old); return a; };
    this.aNext = grow(Int32Array, this.aNext, cap);
    this.aPrev = grow(Int32Array, this.aPrev, cap);
    this.aTeam = grow(Uint8Array, this.aTeam, cap);
    this.aX = grow(Uint16Array, this.aX, cap);
    this.aY = grow(Uint16Array, this.aY, cap);
    this.aAge = grow(Uint32Array, this.aAge, cap);
    this.aNextTurn = grow(Uint32Array, this.aNextTurn, cap);
    this.aIndex = grow(Int32Array, this.aIndex, cap);
    this.antList = grow(Int32Array, this.antList, cap);
    this.brains = grow(Uint8Array, this.brains, cap * this.stride);
    const free = new Int32Array(cap);
    if (this.freeList) free.set(this.freeList.subarray(0, this.freeCount));
    for (let i = this.capacity; i < cap; i++) free[this.freeCount++] = cap - 1 - (i - this.capacity);
    this.freeList = free;
    this.capacity = cap;
  }

  battleInit() {
    const U = this.Used, W = U.MapWidth, H = U.MapHeight, N = W * H;
    this.W = W; this.H = H;
    this.NumBorn = 0; this.NumAnts = 0; this.NumFood = 0; this.NumBases = 0; this.BasesBuilt = 0;
    this.CurrentTurn = 0; this.LastFoodIndex = 0; this.TurnAnts = 0;
    this.FoodLimit = Math.floor(N / U.NewFoodSpace);

    // The map.
    this.sqAnts = new Uint8Array(N);
    this.sqBase = new Uint8Array(N);
    this.sqTeam = new Uint8Array(N);
    this.sqFood = new Uint8Array(N);
    this.sqFirst = new Int32Array(N).fill(-1);
    this.sqLast = new Int32Array(N).fill(-1);

    // Ant slots.
    this.capacity = 0; this.freeList = null; this.freeCount = 0;
    this.aNext = this.aPrev = this.aTeam = this.aX = this.aY = null;
    this.aAge = this.aNextTurn = this.aIndex = this.antList = this.brains = null;
    this.ensureCapacity(this.NumTeams * U.StartAnts + this.FoodLimit + U.NewFoodMin + U.NewFoodDiff + 256);

    // Place the bases.
    const BS = U.BattleSize, x = new Uint16Array(BS), y = new Uint16Array(BS);
    let bestdist = 0;
    for (let i = 0; i < BasePlaceTries; i++) {
      let mindist = W + H;
      for (let n = 0; n < BS; n++) {
        if (this.BattleTeams[n] === 1) {
          x[n] = Math.floor(W / 2); y[n] = Math.floor(H / 2);
        } else {
          x[n] = this.random(W); y[n] = this.random(H);
        }
      }
      for (let n = 0; n < BS - 1; n++) {
        for (let m = n + 1; m < BS; m++) {
          let dx = Math.abs(x[m] - x[n]), dy = Math.abs(y[m] - y[n]);
          if (dx > Math.floor(W / 2)) dx = W - dx;
          if (dy > Math.floor(H / 2)) dy = H - dy;
          if (dx + dy < mindist) mindist = dx + dy;
        }
      }
      if (mindist > bestdist) {
        bestdist = mindist;
        for (let n = 0; n < BS; n++) { this.bestx[n] = x[n]; this.besty[n] = y[n]; }
      }
    }

    for (let t = 1; t <= this.NumTeams; t++) this.stats[t] = newTeamStats();
    this.stats[0] = newTeamStats();

    for (let n = 0; n < BS; n++) {
      const t = this.BattleTeams[n], st = this.stats[t];
      st.NumBases = 1; st.BasesBuilt = 1; st.SquareOwn = 1;
      this.NumBases++; this.BasesBuilt++;
      const sq = this.bestx[n] + this.besty[n] * W;
      this.sqTeam[sq] = t;
      this.sqBase[sq] = 1;
      for (let i = U.StartAnts; i-- > 0;) this.newAnt(this.bestx[n], this.besty[n]);
      this.squareChanged(this.bestx[n], this.besty[n]);
    }

    // Team relabel table (§3.11).
    const S = this.NumTeams + 1, taken = this.taken;
    taken.fill(0, 0, BS);
    for (let n1 = 0; n1 < BS; n1++) {
      const t1 = this.BattleTeams[n1], row = (t1 - 1) * S;
      taken[0]++;
      this.TeamShuffle[row] = 0;
      for (let n2 = 0; n2 < BS; n2++) {
        const t2 = this.BattleTeams[n2];
        if (n2 === n1) {
          this.TeamShuffle[row + t2] = 0;
        } else {
          let v;
          do { v = this.random(BS); } while (taken[v] > n1);
          this.TeamShuffle[row + t2] = v;
          taken[v]++;
        }
      }
    }

    // Fresh ant instances for the battle (resets globals and rand(), §4.3).
    for (let n = 0; n < BS; n++) {
      const t = this.BattleTeams[n], td = this.team[t];
      td.runner = td.def.newBattle({ battleSeed: this.BattleSeed, slot: n, team: t, game: this });
    }
  }

  // --- A turn (§3.5) --------------------------------------------------------

  doTurn() {
    const antList = this.antList, aIndex = this.aIndex;
    this.CurrentTurn++;
    this.TurnAnts = this.NumAnts;
    while (this.TurnAnts) {
      const ant = antList[this.random(this.TurnAnts)];
      const idx = aIndex[ant];
      const last = antList[--this.TurnAnts];
      antList[idx] = last; aIndex[last] = idx;
      antList[this.TurnAnts] = ant; aIndex[ant] = this.TurnAnts;
      this.doAction(ant, this.runAnt(ant));
    }
    while (this.NumAnts + this.NumFood + BaseValue * this.NumBases < this.FoodLimit) this.placeFood();
  }

  // Calls an ant (§3.10). Returns its action.
  runAnt(ant) {
    const timeflag = this.random(TimeRate) === 0;
    const W = this.W, H = this.H;
    const x = this.aX[ant], y = this.aY[ant], sq = x + y * W;
    const num = this.sqAnts[sq], team = this.sqTeam[sq];
    const td = this.team[team], runner = td.runner, size = td.memSize;
    const felt = runner.felt;
    const shuffle = this.TeamShuffle, row = (this.aTeam[ant] - 1) * (this.NumTeams + 1);

    const right = (x === W - 1 ? 0 : x + 1) + y * W;
    const down = x + (y === H - 1 ? 0 : y + 1) * W;
    const left = (x === 0 ? W - 1 : x - 1) + y * W;
    const up = x + (y === 0 ? H - 1 : y - 1) * W;
    this.fillSquare(felt, 0, sq, shuffle, row);
    this.fillSquare(felt, 4, right, shuffle, row);
    this.fillSquare(felt, 8, down, shuffle, row);
    this.fillSquare(felt, 12, left, shuffle, row);
    this.fillSquare(felt, 16, up, shuffle, row);

    // Copy in the brains: the caller first, then the others on the square in
    // square-list order (num - 1 of them), via the shared scratch buffer.
    const brains = this.brains, stride = this.stride, mem = runner.mem, temp = this.antTemp;
    let n = 1;
    const extent = Math.min(mem.length, temp.length, (num + StaleSlots) * size);
    if (size) {
      temp.set(brains.subarray(ant * stride, ant * stride + size), 0);
      for (let a = this.sqFirst[sq]; a !== -1 && n < num; a = this.aNext[a]) {
        if (a === ant) continue;
        temp.set(brains.subarray(a * stride, a * stride + size), n * size);
        n++;
      }
      mem.set(temp.subarray(0, extent), 0);
    }

    let retval;
    if (timeflag) {
      const t0 = now();
      retval = runner.call(num);
      this.stats[team].TimeUsed += now() - t0;
      this.stats[team].TimesTimed++;
    } else {
      retval = runner.call(num);
    }

    // Copy the brains back (and whatever the ant wrote past them).
    if (size) {
      temp.set(mem.subarray(0, extent), 0);
      brains.set(temp.subarray(0, size), ant * stride);
      n = 1;
      for (let a = this.sqFirst[sq]; a !== -1 && n < num; a = this.aNext[a]) {
        if (a === ant) continue;
        brains.set(temp.subarray(n * size, n * size + size), a * stride);
        n++;
      }
    }

    this.stats[team].TimesRun = (this.stats[team].TimesRun + 1) >>> 0;
    this.aAge[ant]++;
    this.aNextTurn[ant]++;
    return retval | 0;
  }

  fillSquare(felt, o, sq, shuffle, row) {
    const ants = this.sqAnts[sq], base = this.sqBase[sq];
    felt[o] = ants;
    felt[o + 1] = base;
    felt[o + 2] = ants || base ? shuffle[row + this.sqTeam[sq]] : 0;
    felt[o + 3] = this.sqFood[sq];
  }

  // Performs an ant's action (§3.6).
  doAction(ant, action) {
    const W = this.W, H = this.H;
    const x = this.aX[ant], y = this.aY[ant];
    let nx = x, ny = y;
    switch (action & 7) {
      case 1: nx = x === W - 1 ? 0 : x + 1; break;
      case 2: ny = y === H - 1 ? 0 : y + 1; break;
      case 3: nx = x === 0 ? W - 1 : x - 1; break;
      case 4: ny = y === 0 ? H - 1 : y - 1; break;
    }
    const sq = x + y * W, sq2 = nx + ny * W;
    const team = this.aTeam[ant];

    // Build a base?
    if (action === 16 && this.sqAnts[sq] > NewBaseAnts && this.sqFood[sq] >= NewBaseFood && this.sqBase[sq] === 0) {
      this.unlink(sq, ant);
      for (let t = NewBaseAnts; t-- > 0;) this.killAnt(this.sqFirst[sq], team);
      this.prepend(sq, ant);
      for (let t = this.sqFood[sq] - NewBaseFood; t-- > 0;) this.newAnt(x, y);
      this.NumFood -= this.sqFood[sq];
      this.sqFood[sq] = 0;
      this.sqBase[sq] = 1;
      this.stats[team].NumBases++;
      this.stats[team].BasesBuilt++;
      this.NumBases++;
      this.BasesBuilt++;
      this.squareChanged(x, y);
    }

    // Move?
    if (sq2 !== sq && (this.sqAnts[sq2] < MaxSquareAnts || this.sqTeam[sq2] !== team)) {
      this.unlink(sq, ant);
      this.sqAnts[sq]--;
      const owner = this.sqTeam[sq2];
      if (owner !== team) {
        while (this.sqAnts[sq2]) this.killAnt(this.sqFirst[sq2], team);
        if (this.sqBase[sq2]) {
          this.sqBase[sq2] = 0;
          this.stats[owner].NumBases--;
          this.NumBases--;
        }
        this.stats[owner].SquareOwn--;
        this.stats[team].SquareOwn++;
      }
      this.append(sq2, ant);
      this.aX[ant] = nx; this.aY[ant] = ny;
      this.sqTeam[sq2] = team;
      this.sqAnts[sq2]++;
      if ((action & 8) && this.sqFood[sq] && this.sqFood[sq2] < MaxSquareFood) {
        this.sqFood[sq]--;
        if (this.sqBase[sq2]) {
          this.newAnt(nx, ny);
          this.NumFood--;
        } else {
          this.sqFood[sq2]++;
        }
      }
      this.squareChanged(x, y);
      this.squareChanged(nx, ny);
    }
  }

  // Places one pile of food (§3.8).
  placeFood() {
    const W = this.W, H = this.H, U = this.Used;
    let bestx = 0, besty = 0, bestdist = -1;
    for (let i = 0; i < 20; i++) {
      let x, y, sq;
      do {
        x = this.random(W); y = this.random(H);
        sq = x + y * W;
      } while (this.sqAnts[sq] || this.sqFood[sq] || this.sqBase[sq]);

      let mindist = W + H;
      const known = Math.min(this.LastFoodIndex, LastFoodMem);
      for (let j = 0; j < known; j++) {
        let xdist = Math.abs(x - this.LastFoodX[j]), ydist = Math.abs(y - this.LastFoodY[j]);
        if (xdist > Math.floor(W / 2)) xdist = W - xdist;
        if (ydist > Math.floor(H / 2)) ydist = H - ydist;
        if (xdist + ydist < mindist) mindist = xdist + ydist;
      }
      if (mindist > bestdist) { bestdist = mindist; bestx = x; besty = y; }
    }
    const j = (this.LastFoodIndex++) % LastFoodMem;
    this.LastFoodIndex &= 0xffff; // u_short in the original
    this.LastFoodX[j] = bestx;
    this.LastFoodY[j] = besty;

    const num = U.NewFoodMin + this.random(U.NewFoodDiff + 1);
    const sq = bestx + besty * W;
    this.sqFood[sq] += num;
    this.NumFood += num;
    this.squareChanged(bestx, besty);
  }

  // --- Ants (§3.9) ----------------------------------------------------------

  newAnt(x, y) {
    const sq = x + y * this.W, team = this.sqTeam[sq];
    if (this.freeCount === 0) this.ensureCapacity(this.capacity * 2);
    const ant = this.freeList[--this.freeCount];
    this.aIndex[ant] = this.NumAnts;
    this.antList[this.NumAnts++] = ant;
    this.append(sq, ant);
    if (this.sqAnts[sq] === 255) this.warn(`more than 255 ants on square ${x},${y} (8-bit counter wraps, as in the original)`);
    this.sqAnts[sq]++;
    this.aTeam[ant] = team;
    this.aX[ant] = x; this.aY[ant] = y;
    this.aAge[ant] = 0;
    this.aNextTurn[ant] = this.CurrentTurn + 1;
    this.NumBorn++;
    this.stats[team].NumBorn++;
    this.stats[team].NumAnts++;
    // Random start value in the first 4 bytes (little endian), rest zeroed.
    const r1 = this.random(1 << 16);
    const r2 = this.random(1 << 16);
    const v = ((r1 << 16) + r2) >>> 0, o = ant * this.stride, b = this.brains;
    b[o] = v; b[o + 1] = v >>> 8; b[o + 2] = v >>> 16; b[o + 3] = v >>> 24;
    const size = this.team[team] ? this.team[team].memSize : 0;
    if (size > 4) b.fill(0, o + 4, o + size);
  }

  killAnt(ant, killerTeam) {
    const antList = this.antList, aIndex = this.aIndex;
    const idx = aIndex[ant];
    if (this.aNextTurn[ant] === this.CurrentTurn) {
      // The ant has not acted this turn yet.
      let moved = antList[--this.TurnAnts];
      antList[idx] = moved; aIndex[moved] = idx;
      moved = antList[--this.NumAnts];
      antList[this.TurnAnts] = moved; aIndex[moved] = this.TurnAnts;
    } else {
      const moved = antList[--this.NumAnts];
      antList[idx] = moved; aIndex[moved] = idx;
    }
    const sq = this.aX[ant] + this.aY[ant] * this.W;
    this.unlink(sq, ant);
    this.sqAnts[sq]--;
    const st = this.stats[this.aTeam[ant]];
    st.NumAnts--;
    st.DieAge = (st.DieAge + this.aAge[ant]) >>> 0;
    st.Killed++;
    this.stats[killerTeam].Kill++;
    this.freeList[this.freeCount++] = ant;
  }

  // Square lists (§3.3).
  append(sq, a) {
    const last = this.sqLast[sq];
    this.aPrev[a] = last; this.aNext[a] = -1;
    if (last !== -1) this.aNext[last] = a; else this.sqFirst[sq] = a;
    this.sqLast[sq] = a;
  }

  prepend(sq, a) {
    const first = this.sqFirst[sq];
    this.aNext[a] = first; this.aPrev[a] = -1;
    if (first !== -1) this.aPrev[first] = a; else this.sqLast[sq] = a;
    this.sqFirst[sq] = a;
  }

  unlink(sq, a) {
    const p = this.aPrev[a], n = this.aNext[a];
    if (p !== -1) this.aNext[p] = n; else this.sqFirst[sq] = n;
    if (n !== -1) this.aPrev[n] = p; else this.sqLast[sq] = p;
  }

  squareChanged(x, y) {
    if (this.hooks.squareChanged) this.hooks.squareChanged(x, y);
  }

  warn(msg) {
    if (this.hooks.warn) this.hooks.warn(msg);
  }

  // --- End of battle (§3.12) ------------------------------------------------

  termCheck() {
    const U = this.Used;
    if (U.BattleSize === 1) {
      this.Winner = this.BattleTeams[0];
      return this.NumFood === 0
        ? (this.CurrentTurn >= U.HalfTimeTurn ? TERM.HALFTIME : TERM.WIN)
        : (this.CurrentTurn >= U.TimeOutTurn ? TERM.TIMEOUT : TERM.CONTINUE);
    }
    let val1 = 0, val2 = 0;
    for (let n = 0; n < U.BattleSize; n++) {
      const t = this.BattleTeams[n];
      const val = this.stats[t].NumAnts + BaseValue * this.stats[t].NumBases;
      if (val > val1) { this.Winner = t; val2 = val1; val1 = val; }
      else if (val > val2) val2 = val;
    }
    if (this.CurrentTurn >= U.TimeOutTurn) return TERM.TIMEOUT;
    if (this.CurrentTurn >= U.HalfTimeTurn && val1 * 100 >= (val1 + val2) * U.HalfTimePercent) return TERM.HALFTIME;
    if (val1 * 100 >= (val1 + val2) * U.WinPercent) return TERM.WIN;
    return TERM.CONTINUE;
  }

  // --- Output, identical in format to the original --------------------------

  printGameBegin() {
    const a = this.args, out = this.out;
    out("MyreKrig version 2.4.7 (26.06.03)\n\n");
    out(`NumTeams:       ${padL(this.NumTeams, 7)}\n`);
    out(`NewBaseAnts:    ${padL(NewBaseAnts, 7)}\n`);
    out(`NewBaseFood:  ${padL(NewBaseFood, 9)}\n\n`);
    out("                MinVal MaxVal\n");
    const labels = ["MapWidth:       ", "MapHeight:      ", "StartAnts:      ", "NewFoodSpace:   ",
      "NewFoodMin:     ", "NewFoodDiff:    ", "HalfTimeTurn:   ", "TimeOutTurn:    ", "WinPercent:     ",
      "HalfTimePercent:", "BattleSize:     "];
    PARAMS.forEach((p, i) => out(`${labels[i]}${padL(a.Min[p], 6)} ${padL(a.Max[p], 6)}\n`));
    out(`NumBattles:     ${padL(a.NumBattles, 6)}\n`);
    out(`RandomSeed: ${padL(a.GameSeed, 10)}\n\n`);
    out("Team letters and ant memory sizes:\n");
    for (let t = 1; t <= this.NumTeams; t++) {
      out(`${String.fromCharCode(64 + t)} ${padR(this.team[t].name, 10)} ${padL(this.team[t].memSize, 4)}\n`);
    }
    out(`\nBatt Randomseed Widt Heig Ant Spc Min Dif ${padR("Teams", a.Max.BattleSize)} Turns T Winner\n`);
  }

  printBattleBegin() {
    const U = this.Used;
    let s = (this.skipped ? "\r" : "") + padL(this.BattleCount + 1, 4) + " " + padL(this.args.GameSeed, 10) + " " +
      padL(U.MapWidth, 4) + " " + padL(U.MapHeight, 4) + " " + padL(U.StartAnts, 3) + " " +
      padL(U.NewFoodSpace, 3) + " " + padL(U.NewFoodMin, 3) + " " + padL(U.NewFoodDiff, 3) + " ";
    for (let n = 0; n < U.BattleSize; n++) s += String.fromCharCode(64 + this.BattleTeams[n]);
    const maxBS = this.Max.BattleSize;
    s += "".padStart((maxBS <= 5 ? 5 : maxBS) - U.BattleSize + 1);
    this.out(s);
  }

  printBattleResult(tc) {
    this.out(`${padL(this.CurrentTurn, 5)} ${TERM_LETTERS[tc - 1]} ${String.fromCharCode(64 + this.Winner)} ${this.team[this.Winner].name}\n`);
    for (let n1 = 0; n1 < this.Used.BattleSize; n1++) {
      const t1 = this.BattleTeams[n1], s = this.stats[t1];
      for (const t2 of [0, t1]) {
        const g = this.totals[t2];
        g.NumBorn = (g.NumBorn + s.NumBorn) >>> 0;
        g.NumAnts = (g.NumAnts + s.NumAnts) >>> 0;
        g.NumBases = (g.NumBases + s.NumBases) >>> 0;
        g.BasesBuilt = (g.BasesBuilt + s.BasesBuilt) >>> 0;
        g.Kill = (g.Kill + s.Kill) >>> 0;
        g.Killed = (g.Killed + s.Killed) >>> 0;
        g.DieAge = (g.DieAge + Math.floor((s.DieAge + 500) / 1000)) >>> 0;
        g.TimesRun = (g.TimesRun + Math.floor((s.TimesRun + 500) / 1000)) >>> 0;
        g.TimesTimed += s.TimesTimed;
        g.TimeUsed += s.TimeUsed; // milliseconds (a float)
        g.NumTurns = (g.NumTurns + this.CurrentTurn) >>> 0;
        g.NumBattles += 1;
      }
    }
    this.totals[this.Winner].NumWon++;
    this.totals[0].NumWon++;
  }

  // The final table (§5.3). Time is in nanoseconds per timed call, measured
  // with the host's clock, so it differs from the original (and between runs).
  printGameResult() {
    const NT = this.NumTeams, G = this.totals;
    if (this.broken) this.out("\r" + "".padStart(70) + "\n");
    if (this.BattleCount === 0) return;
    const vict = [], base = [], comb = [], time = [], size = [];
    for (let t = 0; t <= NT; t++) {
      vict[t] = scaleDiv(G[t].NumWon, G[t].NumBattles, 1000);
      base[t] = scaleDiv(G[t].BasesBuilt, G[t].NumBattles, 10);
      comb[t] = scaleDiv(G[t].Kill, G[t].Kill + G[t].Killed, 1000);
      time[t] = G[t].TimesTimed ? Math.max(1, Math.round(G[t].TimeUsed * 1e6 / G[t].TimesTimed)) : 1;
      size[t] = t ? this.team[t].memSize : 0;
    }
    const median = (arr) => {
      const s = arr.slice(1).sort((a, b) => a - b);
      return Math.floor((s[Math.floor((NT + 1) / 2) - 1] + s[Math.floor((NT + 2) / 2) - 1]) / 2);
    };
    const slowmed = median(time), sizemed = median(size);
    const perf = [], pres = [];
    let perfsum = 0, pressum = 0;
    for (let t = 0; t <= NT; t++) {
      perf[t] = scaleDiv(Math.imul(vict[t], slowmed) >>> 0, time[t], 1);
      if (size[t] === 0) pres[t] = sizemed === 0 ? vict[t] : (vict[t] * sizemed * ZeroMemFactor) >>> 0;
      else pres[t] = scaleDiv(Math.imul(vict[t], sizemed) >>> 0, size[t], 1);
      if (t) { perfsum += perf[t]; pressum += pres[t]; }
    }
    perf[0] = Math.floor(perfsum / NT);
    pres[0] = Math.floor(pressum / NT);

    const pct = (v) => `${padL(Math.floor(v / 10), 4)}.${v % 10}%`;
    this.out("\nTeam    Battles  Won Bases  Ants  Size  Ages   Comb   Time   Vict   Perf   Pres\n");
    for (let i = 1; i <= NT + 1; i++) {
      const t = i % (NT + 1), g = G[t];
      this.out(padR(t ? this.team[t].name : "Tot./Aver.", 10) +
        padL(g.NumBattles, 5) + padL(g.NumWon, 5) +
        `${padL(Math.floor(base[t] / 10), 4)}.${base[t] % 10}` +
        padL(scaleDiv(g.NumBorn, g.NumBattles, 1), 6) +
        padL(scaleDiv(g.TimesRun, g.NumTurns, 1000), 6) +
        padL(scaleDiv(g.DieAge, (g.NumBorn - g.NumAnts) >>> 0, 1000), 6) +
        pct(comb[t]) + padL(time[t], 7) + pct(vict[t]) + pct(perf[t]) + pct(pres[t]) + "\n");
    }
  }
}
