// Simulation worker for Ants51. Runs the engine (engine.js, wasm-ant.js and
// js-ant.js are bundled in front of this file by tools/build-html.mjs) and
// sends the page frames following docs/design/DATA_CONTRACT.md: semantic map
// cells (full snapshot, then dirty updates), per-team stats, the strength
// history, and authoritative events observed from the engine.
//
// Messages from the page:
//   {type:"init", ants:[{name, bytes}], js:[{id, source}]}  compile the ants
//   {type:"addJs", id, source}               compile (or replace) a JS ant
//   {type:"start", ants:[names], argv:[...], jobs?, job?}  start a game; with
//        jobs > 1 this worker plays only battles i with i % jobs === job and
//        reports each battle's text separately (parallel runs)
//   {type:"run", show, budgetMs, maxTurns}   run a slice, then reply with a frame
//   {type:"view", on}                        start/stop sending map cells
//   {type:"cmd", code}                       F1..F5 (SYS codes)
//   {type:"finish", totals}                  print the final table for merged
//                                            totals (parallel runs)
//   {type:"stop"}                            abandon the game

/* global Game, defaultArgs, parseArgs, parseTitle, loadWasmAnt, compileJsAnt, BaseValue */

const defs = new Map();
let game = null, gen = null, done = true;
let pendingCmd = 0;
let out = "";
let warnings = [];
let parallel = false, battleTexts = [], startTeams = null, startArgv = null;

// Per-battle view state.
let battleId = 0, seq = 0, W = 0, H = 0, slots = 0;
let viewing = true, needFull = true;
let dirtyFlag = null, dirtyList = [];
let history = [], historySent = 0;
let events = [], eventSeq = 0, lastLeader = -1;
let outcome = null;

onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === "init") init(m);
    else if (m.type === "addJs") postMessage({ type: "jsAnt", info: addJs(m.id, m.source) });
    else if (m.type === "start") start(m);
    else if (m.type === "finish") finish(m);
    else if (m.type === "run") run(m);
    else if (m.type === "view") { viewing = !!m.on; if (viewing) needFull = true; }
    else if (m.type === "cmd") pendingCmd = m.code;
    else if (m.type === "stop") { game = gen = null; done = true; }
  } catch (err) {
    postMessage({ type: "error", message: String(err && err.stack || err) });
  }
};

function init(m) {
  const list = [];
  for (const a of m.ants) {
    try {
      const def = loadWasmAnt(new WebAssembly.Module(a.bytes));
      defs.set(a.name, def);
      const { name, color } = parseTitle(def.titleBytes);
      list.push({ id: a.name, name, color, memSize: def.memSize });
    } catch (err) {
      list.push({ id: a.name, error: String(err.message) });
    }
  }
  for (const j of m.js || []) list.push(addJs(j.id, j.source));
  postMessage({ type: "ants", list });
}

function addJs(id, source) {
  try {
    const def = compileJsAnt(source);
    defs.set(id, def);
    const { name, color } = parseTitle(def.titleBytes);
    return { id, name, color, memSize: def.memSize, js: true };
  } catch (err) {
    defs.delete(id);
    return { id, js: true, error: String(err.message) };
  }
}

function start(m) {
  const teams = m.ants.map((n) => {
    const d = defs.get(n);
    if (!d) throw new Error(`Unknown ant ${n}`);
    return d;
  });
  const args = parseArgs(defaultArgs(), m.argv);
  out = ""; warnings = []; pendingCmd = 0; battleId = 0;
  events = []; eventSeq = 0; outcome = null;
  parallel = (m.jobs || 1) > 1; battleTexts = []; startTeams = teams; startArgv = m.argv;
  viewing = !parallel && m.view !== false;
  let cur = "";
  game = new Game(teams, args, {
    noHeader: parallel && m.job !== 0,
    noResult: parallel,
    only: parallel ? (i) => i % m.jobs === m.job : undefined,
    afterBattle: parallel ? (g) => { battleTexts.push({ index: g.BattleCount, text: cur }); cur = ""; } : undefined,
    battleSkipped: parallel ? (g) => { battleTexts.push({ index: g.BattleCount, text: "" }); } : undefined,
    out: (s) => { if (parallel && game && game.Used && game.Used.BattleSize && !game.finished) cur += s; else out += s; },
    warn: (s) => { warnings.push(s); },
    battleInit: (g) => { newBattle(g); return true; },
    squareChanged: (x, y) => {
      if (!viewing || !dirtyFlag) return;
      const i = x + y * W;
      if (!dirtyFlag[i]) { dirtyFlag[i] = 1; dirtyList.push(i); }
    },
    baseBuilt: (x, y, team) => addEvent("base-created", { slot: game.TeamIndex[team], x, y }),
    baseLost: (x, y, owner, by) => addEvent("base-lost", { slot: game.TeamIndex[owner], by: game.TeamIndex[by], x, y }),
    drawMap: (g) => afterTurn(g),
    battleExit: (g, tc) => {
      const reason = tc ? "?WHITE"[tc] || "?" : g.skipped ? "S" : g.broken ? "X" : "R";
      outcome = { reason, winner: g.TeamIndex[g.Winner], turn: g.CurrentTurn };
      addEvent("battle-ended", { slot: outcome.winner, reason: outcome.reason });
    },
    check: () => { const c = pendingCmd; pendingCmd = 0; return c; },
  });
  gen = game.play();
  done = false;
  postMessage({ type: "started", numBattles: args.NumBattles, seed: args.GameSeed,
    teams: game.team.slice(1).map((t) => ({ name: t.name, color: t.color, memSize: t.memSize })) });
}

function newBattle(g) {
  battleId++; seq = 0;
  W = g.Used.MapWidth; H = g.Used.MapHeight; slots = g.Used.BattleSize;
  dirtyFlag = new Uint8Array(W * H); dirtyList = [];
  needFull = true;
  history = Array.from({ length: slots }, () => []); historySent = 0;
  // Unsent events of the previous battle (its end) stay queued; they carry
  // their own battleId.
  eventSeq = 0; lastLeader = -1; outcome = null;
}

function addEvent(kind, fields) {
  if (!game || !game.Used || parallel) return;
  events.push({ id: `${battleId}:${++eventSeq}`, battleId, turn: game.CurrentTurn, kind, ...fields });
}

// After every complete turn: strength history, leader changes, halftime.
function afterTurn(g) {
  const U = g.Used;
  let best = -1, bestSlot = -1, tie = false;
  for (let n = 0; n < slots; n++) {
    const s = g.stats[g.BattleTeams[n]];
    const v = s.NumAnts + BaseValue * s.NumBases;
    history[n].push(v);
    if (v > best) { best = v; bestSlot = n; tie = false; } else if (v === best) tie = true;
  }
  if (!tie && best > 0) {
    if (lastLeader >= 0 && bestSlot !== lastLeader) addEvent("leader-changed", { slot: bestSlot, previous: lastLeader });
    lastLeader = bestSlot;
  }
  if (g.CurrentTurn === U.HalfTimeTurn && slots > 1) addEvent("halftime", {});
}

// Runs turns for up to budgetMs (or maxTurns), then sends a frame.
function run(m) {
  if (!game) return;
  // Map cells are only tracked while the battle is shown; a full snapshot
  // follows when the display comes back.
  if (!m.show && viewing) { viewing = false; dirtyList = []; if (dirtyFlag) dirtyFlag.fill(0); }
  else if (m.show && !viewing && !parallel) { viewing = true; needFull = true; }
  const t0 = performance.now();
  let turns = 0, ended = 0;
  const startBattle = battleId;
  while (!done) {
    const r = gen.next();
    if (r.done) { done = true; break; }
    turns++;
    // When showing battles, stop at the end of a battle so its final state
    // is drawn before the next battle starts.
    if (m.show && r.value) {
      ended = r.value;
      outcome = { reason: "?WHITE"[r.value] || "?", winner: game.TeamIndex[game.Winner], turn: game.CurrentTurn };
      break;
    }
    if (m.maxTurns && turns >= m.maxTurns) break;
    if ((turns & 15) === 0 && performance.now() - t0 > m.budgetMs) break;
    if (m.show && battleId !== startBattle) break;
  }
  sendFrame(m.show, ended);
}

function sendFrame(show, ended = 0) {
  const g = game;
  const frame = {
    type: "frame", done, out, warnings,
    battleId, seq: ++seq,
    battle: g.BattleCount + 1, numBattles: g.args.NumBattles,
    turn: g.CurrentTurn || 0, ended,
    numAnts: g.NumAnts || 0, numFood: g.NumFood || 0,
    totals: g.totals.slice(1).map((t) => ({ battles: t.NumBattles, won: t.NumWon, basesBuilt: t.BasesBuilt,
      born: t.NumBorn, kill: t.Kill, killed: t.Killed })),
  };
  const transfer = [];
  out = ""; warnings = [];
  if (parallel) { frame.battleTexts = battleTexts; battleTexts = []; }
  if (done) {
    frame.results = g.results || null;
    if (parallel) frame.rawTotals = g.totals;
  }
  if (g.Used && g.Used.BattleSize && g.stats && !parallel) {
    const U = g.Used;
    frame.params = { baseValue: BaseValue, halfTimeTurn: U.HalfTimeTurn, timeOutTurn: U.TimeOutTurn,
      winPercent: U.WinPercent, halfTimePercent: U.HalfTimePercent };
    frame.map = { width: W, height: H, startAnts: U.StartAnts, foodSpace: U.NewFoodSpace,
      foodMin: U.NewFoodMin, foodMax: U.NewFoodMin + U.NewFoodDiff };
    frame.teams = [];
    for (let n = 0; n < U.BattleSize; n++) {
      const t = g.BattleTeams[n], s = g.stats[t];
      frame.teams.push({ slot: n, team: t, name: g.team[t].name, color: g.team[t].color,
        ants: s.NumAnts, bases: s.NumBases, squares: s.SquareOwn, born: s.NumBorn, built: s.BasesBuilt,
        kill: s.Kill, killed: s.Killed, nsPerCall: s.TimesTimed ? Math.round(s.TimeUsed * 1e6 / s.TimesTimed) : 0 });
    }
    frame.history = { from: historySent, values: history.map((a) => a.slice(historySent)) };
    historySent = history.length ? history[0].length : 0;
    frame.events = events; events = [];
    frame.outcome = outcome;
    if (show && viewing && g.sqAnts && g.sqAnts.length === W * H) Object.assign(frame, cellPayload(g, transfer));
  }
  postMessage(frame, transfer);
}

// Semantic cells: slot (0 = unowned, 1.. = battle slot + 1), ants, food, base.
function cellPayload(g, transfer) {
  const slotOf = (sq) => (g.sqTeam[sq] ? g.TeamIndex[g.sqTeam[sq]] + 1 : 0);
  if (needFull) {
    needFull = false;
    const N = W * H, team = new Uint8Array(N);
    for (let i = 0; i < N; i++) team[i] = slotOf(i);
    const ants = g.sqAnts.slice(), food = g.sqFood.slice(), base = g.sqBase.slice();
    for (const i of dirtyList) dirtyFlag[i] = 0;
    dirtyList = [];
    transfer.push(team.buffer, ants.buffer, food.buffer, base.buffer);
    return { cells: { full: true, team, ants, food, base } };
  }
  const n = dirtyList.length;
  const idx = new Int32Array(n), vals = new Uint8Array(n * 4);
  for (let k = 0; k < n; k++) {
    const i = dirtyList[k];
    dirtyFlag[i] = 0;
    idx[k] = i;
    vals[k * 4] = slotOf(i); vals[k * 4 + 1] = g.sqAnts[i]; vals[k * 4 + 2] = g.sqFood[i]; vals[k * 4 + 3] = g.sqBase[i];
  }
  dirtyList = [];
  transfer.push(idx.buffer, vals.buffer);
  return { cells: { full: false, idx, vals } };
}

// Parallel runs: prints the final table for the totals merged by the page.
function finish(m) {
  let text = "";
  const g = new Game(startTeams, parseArgs(defaultArgs(), startArgv), { out: (s) => { text += s; } });
  g.totals = m.totals;
  g.BattleCount = g.args.NumBattles;
  g.printGameResult();
  postMessage({ type: "finished", out: text, results: g.results });
}
