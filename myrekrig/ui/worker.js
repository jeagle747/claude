// Simulation worker for the browser app. Runs the engine (engine.js and
// wasm-ant.js are bundled in front of this file by tools/build-html.mjs) and
// sends the page frames: the map as pixels, team stats, graph points and
// the text output.
//
// Messages from the page:
//   {type:"init", ants:[{name, bytes}], js:[{id, source}]}  compile the ants
//   {type:"addJs", id, source}               compile (or replace) a JS ant
//   {type:"start", ants:[names], argv:[...]} start a game
//   {type:"run", show, budgetMs, maxTurns}   run a slice, then reply with a frame
//   {type:"cmd", code}                       F1..F5 (SYS codes)
//   {type:"options", territory, ants}        display options
//   {type:"probe", x, y}                     contents of a square
//   {type:"stop"}                            abandon the game

/* global Game, defaultArgs, parseArgs, parseTitle, loadWasmAnt, compileJsAnt, BaseValue */

const defs = new Map();
let game = null, gen = null, done = true;
let pendingCmd = 0;
let opts = { territory: true, ants: true };
let out = "";
let warnings = [];

// Per-battle view state.
let W = 0, H = 0, pix = null, palette = null, slots = 0;
let graph = [], graphWin = [], graphSent = 0;
let battleSerial = 0;

onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === "init") init(m);
    else if (m.type === "addJs") postMessage({ type: "jsAnt", info: addJs(m.id, m.source) });
    else if (m.type === "start") start(m);
    else if (m.type === "run") run(m);
    else if (m.type === "cmd") pendingCmd = m.code;
    else if (m.type === "options") { opts = { ...opts, ...m.options }; if (game && pix) repaint(); }
    else if (m.type === "probe") probe(m);
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
  out = ""; warnings = []; battleSerial = 0; pendingCmd = 0;
  game = new Game(teams, args, {
    out: (s) => { out += s; },
    warn: (s) => { warnings.push(s); },
    battleInit: (g) => { newBattleView(g); return true; },
    squareChanged: (x, y) => { if (pix) pix[x + y * W] = colorOf(x + y * W); },
    drawMap: (g) => { recordGraph(g); },
    check: () => { const c = pendingCmd; pendingCmd = 0; return c; },
  });
  gen = game.play();
  done = false;
  postMessage({ type: "started", numBattles: args.NumBattles, seed: args.GameSeed,
    teams: game.team.slice(1).map((t) => ({ name: t.name, color: t.color, memSize: t.memSize })) });
}

// Runs turns for up to budgetMs (or maxTurns), then sends a frame.
function run(m) {
  if (!game) return;
  const t0 = performance.now();
  let turns = 0, ended = 0;
  const startSerial = battleSerial;
  while (!done) {
    const r = gen.next();
    if (r.done) { done = true; break; }
    turns++;
    // When showing battles, stop at the end of a battle so its final state
    // is drawn before the next battle starts.
    if (m.show && r.value) { ended = r.value; break; }
    if (m.maxTurns && turns >= m.maxTurns) break;
    if ((turns & 15) === 0 && performance.now() - t0 > m.budgetMs) break;
    if (m.show && battleSerial !== startSerial) break;
  }
  sendFrame(m.show, ended);
}

function sendFrame(show, ended = 0) {
  const g = game;
  const frame = {
    type: "frame",
    done,
    out, warnings,
    battle: g.BattleCount + 1,
    numBattles: g.args.NumBattles,
    turn: g.CurrentTurn || 0,
    serial: battleSerial,
    ended,
  };
  out = ""; warnings = [];
  if (g.Used && g.Used.BattleSize && g.stats) {
    const U = g.Used;
    frame.used = { ...U };
    frame.slots = [];
    for (let n = 0; n < U.BattleSize; n++) {
      const t = g.BattleTeams[n], s = g.stats[t];
      frame.slots.push({ letter: String.fromCharCode(64 + t), name: g.team[t].name, color: g.team[t].color,
        ants: s.NumAnts, bases: s.NumBases, squares: s.SquareOwn });
    }
    frame.graph = graph.map((a) => a.slice(graphSent));
    frame.graphWin = graphWin.slice(graphSent);
    frame.graphFrom = graphSent;
    graphSent = graphWin.length;
  }
  if (show && pix) {
    frame.W = W; frame.H = H;
    frame.pixels = pix.slice().buffer;
    postMessage(frame, [frame.pixels]);
  } else {
    postMessage(frame);
  }
}

// --- Map colours, as in the original X11/Windows viewer (SPEC §5.2) -------

const rgba = (r, g, b) => (255 << 24 | b << 16 | g << 8 | r) >>> 0; // little-endian ImageData

function newBattleView(g) {
  battleSerial++;
  W = g.Used.MapWidth; H = g.Used.MapHeight; slots = g.Used.BattleSize;
  pix = new Uint32Array(W * H);
  palette = new Uint32Array(9 + slots * 3);
  for (let c = 0; c < palette.length; c++) {
    if (c === 0) palette[c] = rgba(0, 0, 0);
    else if (c <= 8) { const v = 0x27 + 0x18 * c; palette[c] = rgba(v, v, v); }
    else {
      const col = g.team[g.BattleTeams[Math.floor(c / 3) - 3]].color;
      const r = (col >>> 16) & 0xff, gr = (col >>> 8) & 0xff, b = col & 0xff;
      if (c % 3 === 0) palette[c] = rgba(r >> 2, gr >> 2, b >> 2);
      else if (c % 3 === 1) palette[c] = rgba(r, gr, b);
      else palette[c] = rgba((r >> 1) + 128, (gr >> 1) + 128, (b >> 1) + 128);
    }
  }
  pix.fill(palette[0]);
  graph = Array.from({ length: slots }, () => []);
  graphWin = [];
  graphSent = 0;
}

function colorOf(i) {
  const g = game;
  const ants = g.sqAnts[i], food = g.sqFood[i], team = g.sqTeam[i];
  const ti = g.TeamIndex[team] * 3;
  let c;
  if (g.sqBase[i]) c = 8;
  else if (ants && food) c = ti + 11;
  else if (ants && opts.ants) c = ti + 10;
  else if (opts.territory && team && !food) c = ti + 9;
  else c = food < 29 ? (food + 3) >> 2 : 8;
  return palette[c];
}

function repaint() {
  if (!game.sqAnts || game.sqAnts.length !== W * H) return;
  for (let i = 0; i < W * H; i++) pix[i] = colorOf(i);
}

function recordGraph(g) {
  const U = g.Used;
  let max = 0;
  for (let n = 0; n < slots; n++) {
    const s = g.stats[g.BattleTeams[n]];
    const v = s.NumAnts + BaseValue * s.NumBases;
    graph[n].push(v);
    if (v > max) max = v;
  }
  const pct = g.CurrentTurn >= U.HalfTimeTurn ? U.HalfTimePercent : U.WinPercent;
  graphWin.push(Math.floor(max * 100 / pct) - max);
}

function probe(m) {
  const g = game;
  if (!g || !g.sqAnts || m.x < 0 || m.y < 0 || m.x >= W || m.y >= H) return;
  const i = m.x + m.y * W;
  const team = g.sqTeam[i];
  postMessage({ type: "probe", x: m.x, y: m.y, ants: g.sqAnts[i], food: g.sqFood[i], base: g.sqBase[i],
    team: team ? g.team[team].name : "", letter: team ? String.fromCharCode(64 + team) : "" });
}
