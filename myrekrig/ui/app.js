// Ants51 browser app: setup, live battle view and tournament results, in the
// Amber Operations design (docs/design/). The simulation runs in a worker
// (ui/worker.js); this file only presents the frames and events it sends and
// never affects the game.

const PARAMS = [
  ["MapWidth", "w", "auto"], ["MapHeight", "h", "auto"], ["StartAnts", "a", "15–40"],
  ["NewFoodSpace", "f", "10–50"], ["NewFoodMin", "m", "10–30"], ["NewFoodDiff", "d", "5–20"],
  ["HalfTimeTurn", "t", "10000"], ["TimeOutTurn", "o", "20000"], ["WinPercent", "p", "75"],
  ["HalfTimePercent", "e", "60"], ["BattleSize", "b", "all"],
];
const YOURS = ["Legions", "SkyNET", "Rambo"];
const BY_CLAUDE = ["Kompas", "Probe", "Probe.js"];
const USES_GLOBALS = ["myresyre", "borg", "GridAnt"];
// Termination letters of the original (W H I T E) plus the ways a shown
// battle can stop early.
const REASONS = { W: "WIN", H: "HALFTIME WIN", I: "INTERRUPTED", T: "TIMEOUT", E: "ERROR",
  S: "SKIPPED", R: "RESTARTED", X: "TOURNAMENT ENDED", "?": "ENDED" };

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => Number(n).toLocaleString("en-US");
const hexOf = (c) => "#" + (c & 0xffffff).toString(16).padStart(6, "0");
const icon = (id) => `<svg class="ic" aria-hidden="true"><use href="#ao-${id}"/></svg>`;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const letterOf = (n) => (n < 26 ? String.fromCharCode(65 + n) : String(n + 1));
const pct1 = (num, den) => (den ? (100 * num / den).toFixed(1) : "0.0");
const swatch = (c) => `<span class="sw" style="background:${hexOf(c)}"></span>`;

// Display colours belong to battle slots A–J (tokens.css); from the 11th
// slot on, the ant's own colour is used.
const SLOT_COLORS = "abcdefghij".split("").map((l) => parseInt(css(`--team-${l}`).slice(1), 16));
const DANGER = css("--danger") || "#ff6975";
const AMBER = css("--amber") || "#ffbe48";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const motionOn = () => $("motion").checked && !reducedMotion.matches;

// --- State --------------------------------------------------------------------

let ants = [];            // [{id, name, color, memSize}]
let teams = [];           // selected ant ids, in order
let running = false, paused = false, inflight = false, hasRun = false;
let showing = true;       // the current run shows battles
let view = "setup";
let outText = "";
let teamInfo = [];        // [{name, color, memSize}] by team number - 1
let startTime = 0, turnsSeen = 0, lastTurnFrame = null, numBattles = 0, seed = "";
let liveTotals = null, lastTour = 0;

// --- Worker -------------------------------------------------------------------

const DATA = JSON.parse($("ants-data").textContent);
const WASM = DATA.wasm.map((a) => {
  const bin = atob(a.wasm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { name: a.name, bytes };
});
const BUILTIN_JS = DATA.js;   // [{id, source}] shipped with the app
const STORE_KEY = "ants51.jsAnts", OLD_STORE_KEY = "myrekrig.jsAnts";
const workerUrl = URL.createObjectURL(new Blob([$("worker-src").textContent], { type: "text/javascript" }));
let firstLoad = true;

// Your JS ants, kept in this browser (localStorage) as [{id, source}].
function loadStoredJs() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY) || "[]"); } catch { return []; }
}
function saveStoredJs(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}
let storedJs = loadStoredJs();
const allJs = () => [...BUILTIN_JS.filter((b) => !storedJs.some((s) => s.id === b.id)), ...storedJs];

function initMessage() {
  // Copies of the bytes, so the originals stay usable for the next worker.
  return { type: "init", ants: WASM.map((a) => ({ name: a.name, bytes: a.bytes.slice() })), js: allJs() };
}

let worker;
function createWorker() {
  if (worker) worker.terminate();
  worker = new Worker(workerUrl);
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "ants") onAnts(m.list);
    else if (m.type === "jsAnt") onJsAnt(m.info);
    else if (m.type === "started") onStarted(m);
    else if (m.type === "frame") { if (par) onParallelFrame(0, m); else onFrame(m); }
    else if (m.type === "finished") onFinished(m);
    else if (m.type === "error") { addWarnings([m.message]); stopGame(); }
  };
  worker.onerror = (e) => { addWarnings([`Worker error: ${e.message}`]); };
  worker.postMessage(initMessage());
}
createWorker();

let jsErrors = {};
function onAnts(list) {
  ants = list.filter((a) => !a.error);
  jsErrors = {};
  const failed = list.filter((a) => a.error);
  for (const a of failed) if (a.js) jsErrors[a.id] = a.error;
  const wasmFailed = failed.filter((a) => !a.js);
  if (wasmFailed.length) addWarnings([`Could not load: ${wasmFailed.map((a) => a.id).join(", ")}`]);
  renderAddSelect();
  renderJsList();
  $("status").textContent = `${ants.length} ants loaded`;
  if (firstLoad) { teams = [...YOURS]; firstLoad = false; }
  teams = teams.filter((id) => antInfo(id));
  renderTeams();
}

function addWarnings(list) { $("warnings").textContent += list.join("\n") + "\n"; }

function renderAddSelect() {
  const rank = (a) => (YOURS.includes(a.id) ? 0 : a.js ? 1 : 2);
  const sorted = [...ants].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  $("addSelect").innerHTML = sorted.map((a) =>
    `<option value="${esc(a.id)}">${YOURS.includes(a.id) ? "★ " : ""}${esc(a.id)} (${a.memSize} B)</option>`).join("");
}

// --- Setup ----------------------------------------------------------------------

function antInfo(id) { return ants.find((a) => a.id === id); }

function renderTeams() {
  const ul = $("teamList");
  if (!teams.length) {
    ul.innerHTML = `<li class="empty">No races. Add at least one.</li>`;
  } else {
    ul.innerHTML = teams.map((id, i) => {
      const a = antInfo(id);
      const tags = [YOURS.includes(id) ? "yours" : "", BY_CLAUDE.includes(id) ? "Claude" : "", a.js ? "JS" : "",
        USES_GLOBALS.includes(id) ? "global state" : "", `${a.memSize} B`].filter(Boolean).join(" · ");
      return `<li><span class="letter">${letterOf(i)}</span>
        <span class="swatch" style="background:${hexOf(a.color)}"></span>
        <span class="name" title="${esc(a.name)}">${esc(id)}</span><span class="tag">${tags}</span>
        <button data-up="${i}" ${i ? "" : "disabled"} title="Move up" aria-label="Move ${esc(id)} up">▲</button>
        <button data-down="${i}" ${i < teams.length - 1 ? "" : "disabled"} title="Move down" aria-label="Move ${esc(id)} down">▼</button>
        <button data-del="${i}" title="Remove" aria-label="Remove ${esc(id)}">${icon("close")}</button></li>`;
    }).join("");
  }
  const z = $("pz"), old = z.value;
  z.innerHTML = `<option value="">(none)</option>` +
    teams.map((id, i) => `<option value="${i + 1}">${letterOf(i)} ${esc(id)}</option>`).join("");
  if (old && Number(old) <= teams.length) z.value = old;
  updateLine();
}

$("teamList").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b || running) return;
  const d = b.dataset;
  if (d.up) { const i = +d.up; [teams[i - 1], teams[i]] = [teams[i], teams[i - 1]]; }
  if (d.down) { const i = +d.down; [teams[i + 1], teams[i]] = [teams[i], teams[i + 1]]; }
  if (d.del) teams.splice(+d.del, 1);
  renderTeams();
};
$("addBtn").onclick = () => { const id = $("addSelect").value; if (id && !teams.includes(id) && teams.length < 250) { teams.push(id); renderTeams(); } };
$("addYours").onclick = () => { for (const id of YOURS) if (!teams.includes(id)) teams.push(id); renderTeams(); };
$("addAll").onclick = () => { teams = allOrder(); renderTeams(); };
$("clearTeams").onclick = () => { teams = []; renderTeams(); };

$("paramTable").innerHTML = `<tr><td></td><td class="hint">min</td><td class="hint">max</td></tr>` +
  PARAMS.map(([name, , def]) =>
    `<tr><td>${name}</td><td><input type="number" min="0" id="min-${name}" placeholder="${def}" aria-label="${name} min"></td>` +
    `<td><input type="number" min="0" id="max-${name}" placeholder="${def}" aria-label="${name} max"></td></tr>`).join("");

function buildArgv() {
  const argv = [];
  for (const [name, l] of PARAMS) {
    const lo = $(`min-${name}`).value.trim(), hi = $(`max-${name}`).value.trim();
    if (lo !== "") argv.push(`${l}${lo}`);              // lower case sets min and max
    if (hi !== "" && hi !== lo) argv.push(`${l.toUpperCase()}${hi}`);
  }
  if ($("pn").value.trim() !== "") argv.push(`n${$("pn").value.trim()}`);
  if ($("ps").value.trim() !== "") argv.push(`s${$("ps").value.trim()}`);
  if ($("pz").value !== "") argv.push(`z${$("pz").value}`);
  return argv;
}

// All C ants in the command line's order (mk --all): sorted by name.
const allOrder = () => ants.filter((a) => !a.js).map((a) => a.id)
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

// The setup line uses the command-line syntax: mk [--all | --ants A,B,C] params
function updateLine() {
  const all = allOrder();
  const isAll = teams.length === all.length && teams.every((t, i) => t === all[i]);
  $("setupLine").value = `mk ${isAll ? "--all" : `--ants ${teams.join(",")}`} ${buildArgv().join(" ")}`.trim();
}

function applyLine(line) {
  let names = null, params = [];
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens[0] === "mk" || tokens[0] === "./mk") tokens.shift();
  const sep = tokens.indexOf("--");
  if (sep >= 0) {                       // older form: Ant1 Ant2 -- params
    names = tokens.slice(0, sep);
    params = tokens.slice(sep + 1);
  } else {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "--all") names = null;
      else if (t === "--ants") names = (tokens[++i] || "").split(",").filter(Boolean);
      else if (t.startsWith("--ants=")) names = t.slice(7).split(",").filter(Boolean);
      else if (/^-j\d*$/.test(t)) { if (t === "-j") i++; }
      else params.push(t);
    }
  }
  if (!names) names = allOrder();       // no ants given: all ants, as on the command line
  const unknown = names.filter((n) => !antInfo(n));
  if (unknown.length) { alert(`Unknown ants: ${unknown.join(", ")}`); return false; }
  for (const [name] of PARAMS) { $(`min-${name}`).value = ""; $(`max-${name}`).value = ""; }
  $("pn").value = ""; $("ps").value = ""; $("pz").value = "";
  const z = [];
  for (const arg of params) {
    const l = arg[0], v = arg.slice(1);
    const p = PARAMS.find(([, pl]) => pl === l || pl.toUpperCase() === l);
    if (p) {
      if (l === p[1]) { $(`min-${p[0]}`).value = v; $(`max-${p[0]}`).value = v; }
      else $(`max-${p[0]}`).value = v;
    } else if (l === "n") $("pn").value = v;
    else if (l === "s") $("ps").value = v;
    else if (l === "z") z.push(v);
    else { alert(`Unknown argument: ${arg}`); return false; }
  }
  teams = names;
  renderTeams();
  if (z.length) { $("pz").value = z[z.length - 1]; updateLine(); }
  return true;
}

$("setupView").addEventListener("input", (e) => { if (e.target.id !== "setupLine" && e.target.id !== "code") updateLine(); });
$("pz").onchange = updateLine;
$("applyLine").onclick = () => applyLine($("setupLine").value);
$("copyLine").onclick = () => navigator.clipboard && navigator.clipboard.writeText($("setupLine").value);
$("newSeed").onclick = () => { $("ps").value = Math.floor(Math.random() * 4294967296); updateLine(); };

// --- Views ----------------------------------------------------------------------

function setView(v) {
  view = v;
  const live = v === "run" && showing && !par;
  $("setupView").classList.toggle("hidden", v === "run");
  $("liveView").classList.toggle("hidden", !live);
  $("liveFooter").classList.toggle("hidden", !live);
  $("tourView").classList.toggle("hidden", v !== "run");
  $("setupBtn").disabled = v === "setup" && !hasRun;
  $("setupBtn").querySelector("span").textContent = v === "setup" ? "Battle" : "Setup";
  $("setupBtn").title = v === "setup" ? "Back to the battle" : "Setup";
  $("brandSub").textContent = `MYREKRIG RULES / ${v === "setup" ? "SETUP" : live ? "LIVE BATTLE" : "TOURNAMENT"}`;
  if (live) { resize(); scheduleRender(); }
}
$("setupBtn").onclick = () => setView(view === "setup" ? "run" : "setup");

// --- Running --------------------------------------------------------------------

// Parallel runs (no display): extra workers, each playing every jobs-th
// battle; the page prints the battles in order and merges the totals.
let par = null;   // {jobs, workers, texts, next, totals, live, doneCount}
const cores = () => Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2)));

$("startBtn").onclick = () => {
  if (!teams.length) { alert("Add at least one race."); return; }
  if ($("ps").value.trim() === "") $("ps").value = Math.floor(Math.random() * 4294967296);
  updateLine();
  outText = ""; $("out").textContent = ""; $("warnings").textContent = "";
  $("resultsBox").classList.add("hidden");
  $("standTable").innerHTML = ""; $("progress").textContent = "";
  startTime = performance.now(); turnsSeen = 0; lastTurnFrame = null; liveTotals = null;
  resetLive();
  const argv = buildArgv();
  const jobs = !$("show").checked && $("parallel").checked ? cores() : 1;
  if (jobs > 1) {
    par = { jobs, workers: [worker], texts: new Map(), next: 0, totals: [], live: [], doneCount: 0 };
    for (let j = 1; j < jobs; j++) par.workers.push(createHelper(j));
    par.workers.forEach((w, j) => w.postMessage({ type: "start", ants: teams, argv, jobs, job: j }));
  } else {
    par = null;
    worker.postMessage({ type: "start", ants: teams, argv, view: $("show").checked });
  }
};
// Stop replaces the workers, so it also works when an ant is stuck in a loop.
$("stopBtn").onclick = () => {
  stopHelpers(); stopGame(); createWorker();
  $("status").textContent = "Stopped";
  setPhase("STOPPED", "ended");
};

function createHelper(job) {
  const w = new Worker(workerUrl);
  w.onmessage = (e) => {
    const m = e.data;
    if (m.type === "frame") onParallelFrame(job, m);
    else if (m.type === "error") addWarnings([m.message]);
  };
  w.postMessage(initMessage());
  return w;
}

function stopHelpers() {
  if (par) par.workers.slice(1).forEach((w) => w.terminate());
  par = null;
}

function onStarted(m) {
  running = true; paused = false; inflight = false; hasRun = true;
  teamInfo = m.teams; numBattles = m.numBattles; seed = m.seed;
  showing = $("show").checked && !par;
  $("startBtn").disabled = true; $("stopBtn").disabled = false;
  setPauseLabel();
  $("pauseBtn").disabled = !!par; $("stepBtn").disabled = true;
  document.querySelectorAll("#setupView input, #setupView select, #setupView button").forEach((el) => {
    if (el.id !== "show" || par) el.disabled = true;
  });
  $("seedLabel").textContent = `SEED ${seed}`;
  $("battleLabel").textContent = `${fmt(numBattles)} BATTLE${numBattles === 1 ? "" : "S"}`;
  $("raceCount").textContent = `${teamInfo.length} RACES`;
  $("mapInfo").textContent = "";
  $("status").textContent = `Seed ${seed}`;
  setPhase(par ? `TOURNAMENT · ${par.jobs} WORKERS` : showing ? "STARTING" : "TOURNAMENT");
  setView("run");
  if (par) par.workers.forEach((w) => w.postMessage({ type: "run", show: false, budgetMs: 150, maxTurns: 0 }));
  else pump();
}

function stopGame() {
  running = false; inflight = false; paused = false;
  setPauseLabel();
  $("startBtn").disabled = false; $("stopBtn").disabled = true;
  $("pauseBtn").disabled = true; $("stepBtn").disabled = true;
  document.querySelectorAll("#setupView input, #setupView select, #setupView button").forEach((el) => { el.disabled = false; });
  renderTeams();
  renderJsList();
}

function setPauseLabel() {
  $("pauseBtn").innerHTML = paused ? `${icon("play")}<span>Resume</span>` : `${icon("pause")}<span>Pause</span>`;
  $("pauseBtn").setAttribute("aria-pressed", String(paused));
}
$("pauseBtn").onclick = () => {
  if (!running || par) return;
  paused = !paused;
  setPauseLabel();
  $("stepBtn").disabled = !paused;
  if (!paused) pump();
};
$("stepBtn").onclick = () => {
  if (paused && !inflight) { inflight = true; worker.postMessage({ type: "run", show: showing, budgetMs: 50, maxTurns: 1 }); }
};
$("show").onchange = () => {
  if (!running || par) return;
  showing = $("show").checked;
  if (view === "run") setView("run");
};

function pump() {
  if (!running || paused || inflight || par) return;
  inflight = true;
  // In a hidden tab the battle keeps running without map updates; a full
  // snapshot is sent when it becomes visible again.
  const show = showing && !document.hidden;
  const turns = +$("speed").value;
  worker.postMessage({ type: "run", show, budgetMs: show ? 25 : 120, maxTurns: show ? turns : 0 });
}

function onFrame(f) {
  inflight = false;
  if (f.out) appendOut(f.out);
  if (f.warnings && f.warnings.length) addWarnings(f.warnings);
  if (lastTurnFrame && f.battleId === lastTurnFrame.battleId) turnsSeen += Math.max(0, f.turn - lastTurnFrame.turn);
  else turnsSeen += f.turn;
  lastTurnFrame = { battleId: f.battleId, turn: f.turn };
  liveTotals = f.totals;
  if (f.teams && showing) applyBattleFrame(f);
  if (f.done) {
    if (f.results) renderResults(f.results);
    renderTour(f.numBattles, true);
    finishRun();
    return;
  }
  renderTour(f.battle - 1, false);
  $("status").textContent = `Battle ${f.battle} / ${f.numBattles} · turn ${f.turn}`;
  if (!showing) setPhase(`BATTLE ${f.battle} / ${f.numBattles} · TURN ${fmt(f.turn)}`);
  if (!running || paused) return;
  if (!showing || document.hidden) setTimeout(pump, 0);
  else if (f.ended) setTimeout(pump, 1200);   // let the final state of a battle be seen
  else requestAnimationFrame(pump);
}

function finishRun() {
  stopGame();
  $("status").textContent = "Finished";
  if (!B || !B.outcome) setPhase("TOURNAMENT FINISHED", "ended");
  scheduleRender();
}

function onParallelFrame(job, f) {
  if (!par) return;
  if (f.out) appendOut(f.out);                       // the header (job 0)
  if (f.warnings && f.warnings.length) addWarnings(f.warnings);
  for (const b of f.battleTexts || []) par.texts.set(b.index, b.text);
  let text = "";
  while (par.texts.has(par.next)) { text += par.texts.get(par.next); par.texts.delete(par.next); par.next++; }
  if (text) appendOut(text);
  par.live[job] = f.totals;
  if (f.done) { par.totals[job] = f.rawTotals; par.doneCount++; }
  liveTotals = mergeLive(par.live);
  renderTour(Math.min(par.next, f.numBattles), par.doneCount === par.jobs);
  setPhase(`TOURNAMENT · ${Math.min(par.next, f.numBattles)} / ${f.numBattles} BATTLES`);
  if (par.doneCount === par.jobs) {
    // Merge (32-bit sums, as the original) and let worker 0 print the table.
    const merged = par.totals[0].map((t) => ({ ...t }));
    for (const tot of par.totals.slice(1)) {
      tot.forEach((g, i) => { for (const k of Object.keys(g)) merged[i][k] = k === "TimeUsed" ? merged[i][k] + g[k] : (merged[i][k] + g[k]) >>> 0; });
    }
    worker.postMessage({ type: "finish", totals: merged });
    return;
  }
  if (!f.done && running) par.workers[job].postMessage({ type: "run", show: false, budgetMs: 150, maxTurns: 0 });
}

function onFinished(m) {
  appendOut(m.out);
  renderResults(m.results);
  stopHelpers();
  finishRun();
}

function appendOut(s) {
  outText = (outText + s).replace(/[^\n]*\r/g, "");
  const pre = $("out");
  const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
  pre.textContent = outText;
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}

// --- Battle state -----------------------------------------------------------------

let B = null, prevB = null;      // the shown battle, and the one before it
let focusTeam = 0;               // focused race by tournament team number (0 = none)
let scale = 1;
let rafPending = false, lastTables = 0, lastChart = 0;
let lastEvent = { b: 0, s: 0 };  // dedup: events arrive in (battleId, seq) order

function resetLive() {
  B = prevB = null;
  lastEvent = { b: 0, s: 0 };
  log = []; totalEvents = 0;
  if (leaderPending) { clearTimeout(leaderPending.timer); leaderPending = null; }
  renderEvents();
  $("rows").innerHTML = ""; $("standHead").innerHTML = ""; $("legend").innerHTML = "";
  $("leadValue").textContent = "—"; $("pair").textContent = "";
  $("leadFill").style.width = "0"; $("leadPanel").classList.remove("near");
  const oc = $("overlay").getContext("2d"); oc.clearRect(0, 0, $("overlay").width, $("overlay").height);
}

const focusSlot = (S = B) => (S && focusTeam ? S.teams.findIndex((t) => t.team === focusTeam) : -1);

function newBattleState(f) {
  prevB = B;
  const W = f.map.width, H = f.map.height, N = W * H;
  const map = $("map");
  map.width = W; map.height = H;
  const ctx = map.getContext("2d");
  const img = ctx.createImageData(W, H);
  B = {
    id: f.battleId, seq: 0, battle: f.battle, W, H, map: f.map, params: f.params, teams: f.teams, turn: f.turn,
    team: new Uint8Array(N), ants: new Uint8Array(N), food: new Uint8Array(N), base: new Uint8Array(N),
    haveCells: false, bases: new Set(), history: f.teams.map(() => []), outcome: null, marks: [],
    colors: f.teams.map((t, n) => (n < 10 ? SLOT_COLORS[n] : t.color & 0xffffff)),
    ctx, img, px: new Uint32Array(img.data.buffer), pal: null,
    mapDirty: true, overlayDirty: true, chartDirty: true, tablesDirty: true,
    rows: [], fx: [], near: false, nearThr: 0, phaseKey: "", events: 0,
  };
  if (focusSlot() < 0) focusTeam = 0;
  buildPalette();
  B.px.fill(PAL_EMPTY);
  buildRows();
  renderLegend();
  renderFocusLabel();
  resize();
}

function applyBattleFrame(f) {
  const evs = f.events || [];
  // Events of an earlier battle (its end) come before the new battle's state.
  for (const e of evs) if (B && e.battleId === B.id && e.battleId !== f.battleId) onEvent(e, B);
  if (B && f.battleId < B.id) return;                   // stale frame
  if (!B || f.battleId !== B.id) newBattleState(f);
  if (f.seq <= B.seq) return;
  B.seq = f.seq;
  B.turn = f.turn; B.params = f.params; B.teams = f.teams;
  B.numAnts = f.numAnts; B.numFood = f.numFood;
  if (f.outcome) B.outcome = f.outcome;
  const h = f.history;
  if (h) h.values.forEach((vals, n) => {
    const a = B.history[n];
    if (a.length > h.from) a.length = h.from;
    for (const v of vals) a.push(v);
  });
  if (f.cells) applyCells(f.cells);
  for (const e of evs) if (e.battleId === B.id) onEvent(e, B);
  B.chartDirty = B.tablesDirty = true;
  scheduleRender();
}

// --- Battlefield --------------------------------------------------------------------

const word = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const PAL_EMPTY = word(5, 7, 8);
const PAL_IVORY = word(0xef, 0xe9, 0xdc);
const PAL_IVORY_DIM = word(0xef * 0.38 | 0, 0xe9 * 0.38 | 0, 0xdc * 0.38 | 0);
// Food without ants: neutral grey rising with quantity (quantity / 32, 64–215).
const PAL_FOOD = Array.from({ length: 256 }, (_, f) => { const v = Math.round(64 + 151 * Math.min(1, f / 32)); return word(v, v, v); });

function buildPalette() {
  const fs = focusSlot();
  B.pal = [null];
  B.colors.forEach((c, n) => {
    const r = (c >>> 16) & 255, g = (c >>> 8) & 255, b = c & 255;
    const k = fs >= 0 && n !== fs ? 0.38 : 1;
    const mix = (f, m = 1) => word(Math.round((r + (255 - r) * f) * k * m), Math.round((g + (255 - g) * f) * k * m), Math.round((b + (255 - b) * f) * k * m));
    B.pal.push({ full: mix(0), food: mix(0.32), base: mix(0.55), terr: mix(0, 0.14), dim: k < 1 });
  });
}

// Pixel priority (IMPLEMENTATION.md §4).
function colorAt(i) {
  const t = B.team[i], a = B.ants[i], f = B.food[i], P = B.pal[t];
  if (B.base[i]) return a && P ? P.base : P && P.dim ? PAL_IVORY_DIM : PAL_IVORY;
  if (a && P) {
    if (f) return P.food;
    if (optAnts) return P.full;
  }
  if (f) return PAL_FOOD[f];
  if (P && optTerritory) return P.terr;
  return PAL_EMPTY;
}

let optAnts = true, optTerritory = true, optMarkers = true;

function repaintAll() {
  if (!B) return;
  const N = B.W * B.H, px = B.px;
  for (let i = 0; i < N; i++) px[i] = colorAt(i);
  B.mapDirty = B.overlayDirty = true;
  scheduleRender();
}

function applyCells(c) {
  if (c.full) {
    B.team.set(c.team); B.ants.set(c.ants); B.food.set(c.food); B.base.set(c.base);
    B.bases.clear();
    for (let i = 0; i < B.base.length; i++) if (B.base[i]) B.bases.add(i);
    B.haveCells = true;
    repaintAll();
    return;
  }
  if (!B.haveCells) { worker.postMessage({ type: "view", on: true }); return; }   // ask for a snapshot
  const idx = c.idx, v = c.vals, px = B.px;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    B.team[i] = v[k * 4]; B.ants[i] = v[k * 4 + 1]; B.food[i] = v[k * 4 + 2];
    const had = B.base[i], has = v[k * 4 + 3];
    if (had !== has) { B.base[i] = has; if (has) B.bases.add(i); else B.bases.delete(i); B.overlayDirty = true; }
    px[i] = colorAt(i);
  }
  if (idx.length) B.mapDirty = true;
}

// Integer cell scale: 2× only when both 2W and 2H fit next to the analysis.
function resize() {
  if (!B) return;
  const fit2 = 2 * B.W + 660 + 100 <= innerWidth && 2 * B.H + 260 <= innerHeight;
  scale = fit2 ? 2 : 1;
  document.querySelector(".shell").style.setProperty("--map-size", `${B.W * scale}px`);
  document.body.dataset.large = String(scale === 2);
  const map = $("map"), ov = $("overlay"), dpr = devicePixelRatio || 1;
  map.style.width = `${B.W * scale}px`; map.style.height = `${B.H * scale}px`;
  ov.style.width = map.style.width; ov.style.height = map.style.height;
  ov.width = Math.round(B.W * scale * dpr); ov.height = Math.round(B.H * scale * dpr);
  $("mapInfo").textContent = `${B.W} × ${B.H} · ${scale}× SCALE`;
  $("sizeNotice").textContent = innerWidth < 558 ? "DESKTOP LAYOUT · THE MAP IS NEVER SHRUNK, SCROLL SIDEWAYS" : "";
  B.overlayDirty = B.chartDirty = true;
  scheduleRender();
}
addEventListener("resize", () => { if (B) resize(); });

// Base corner markers and the short event outlines, on a transparent canvas
// clipped to the battlefield.
function drawOverlay(now) {
  const ov = $("overlay"), ctx = ov.getContext("2d"), dpr = devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ov.width, ov.height);
  const s = scale, fs = focusSlot();
  if (optMarkers) {
    for (const i of B.bases) {
      const x = (i % B.W) * s, y = Math.floor(i / B.W) * s, t = B.team[i];
      ctx.globalAlpha = fs >= 0 && t && t - 1 !== fs ? 0.38 : 1;
      ctx.fillStyle = t ? hexOf(B.colors[t - 1]) : "#efe9dc";
      const bx = x - 2, by = y - 2, bs = s + 4, L = 2;
      ctx.fillRect(bx, by, L, 1); ctx.fillRect(bx, by, 1, L);
      ctx.fillRect(bx + bs - L, by, L, 1); ctx.fillRect(bx + bs - 1, by, 1, L);
      ctx.fillRect(bx, by + bs - 1, L, 1); ctx.fillRect(bx, by + bs - L, 1, L);
      ctx.fillRect(bx + bs - L, by + bs - 1, L, 1); ctx.fillRect(bx + bs - 1, by + bs - L, 1, L);
    }
  }
  B.fx = B.fx.filter((e) => now - e.t0 < e.dur);
  ctx.lineWidth = 1;
  for (const e of B.fx) {
    const p = Math.max(0, (now - e.t0) / e.dur);
    const cx = e.x * s + s / 2, cy = e.y * s + s / 2;
    let size;
    if (e.still) { size = 10; ctx.globalAlpha = 1; }
    else { size = e.kind === "base-created" ? 6 + 18 * p : 16 - 10 * p; ctx.globalAlpha = 1 - p; }
    ctx.strokeStyle = e.color;
    ctx.strokeRect(Math.round(cx - size / 2) + 0.5, Math.round(cy - size / 2) + 0.5, Math.round(size) - 1, Math.round(size) - 1);
    if (e.kind === "base-lost" && !e.still) {
      ctx.beginPath();
      ctx.moveTo(cx - 2, cy - 2); ctx.lineTo(cx + 2, cy + 2);
      ctx.moveTo(cx + 2, cy - 2); ctx.lineTo(cx - 2, cy + 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  B.overlayDirty = B.fx.length > 0;
}

function addEffect(e, S) {
  if (S !== B || !showing || document.hidden || view !== "run") return;
  const color = e.kind === "base-lost" ? DANGER : hexOf(S.colors[e.slot] || 0xefe9dc);
  const still = !motionOn();
  B.fx.push({ kind: e.kind, x: e.x, y: e.y, color, t0: performance.now(), dur: still ? 650 : e.kind === "base-created" ? 650 : 480, still });
  if (B.fx.length > 8) B.fx.splice(0, B.fx.length - 8);    // at most eight at a time, newest kept
  B.overlayDirty = true;
}

// Hover inspector: reads the semantic cells, never the canvas.
$("mapWrap").addEventListener("mousemove", (e) => {
  if (!B || !B.haveCells) return;
  const r = $("map").getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / scale), y = Math.floor((e.clientY - r.top) / scale);
  if (x < 0 || y < 0 || x >= B.W || y >= B.H) return;
  const i = x + y * B.W, t = B.team[i];
  const who = t ? `${letterOf(t - 1)} ${B.teams[t - 1].name}` : "unowned";
  $("probe").textContent = `(${x},${y}) · ${who} · ants ${B.ants[i]} · food ${B.food[i]}${B.base[i] ? " · BASE" : ""}`;
});
$("mapWrap").addEventListener("mouseleave", () => { $("probe").textContent = "Hover a cell to inspect counts · click a race row to focus it"; });

$("optTerritory").onchange = () => { optTerritory = $("optTerritory").checked; repaintAll(); };
$("optAnts").onchange = () => { optAnts = $("optAnts").checked; repaintAll(); };
$("markers").onchange = () => { optMarkers = $("markers").checked; if (B) { B.overlayDirty = true; scheduleRender(); } };
function applyMotion() { document.documentElement.dataset.motion = $("motion").checked ? "on" : "off"; }
$("motion").onchange = applyMotion;
applyMotion();

// --- Rendering ------------------------------------------------------------------------

function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(render);
}

function render() {
  rafPending = false;
  if (!B || view !== "run" || !showing) return;
  const now = performance.now();
  if (B.mapDirty) { B.ctx.putImageData(B.img, 0, 0); B.mapDirty = false; }
  if (B.overlayDirty) drawOverlay(now);
  renderHeader();
  renderLead();
  if (B.tablesDirty && now - lastTables >= 250) { renderStandings(); lastTables = now; B.tablesDirty = false; }
  if (B.chartDirty && now - lastChart >= 120) { drawChart(); lastChart = now; B.chartDirty = false; }
  if (B.overlayDirty || B.tablesDirty || B.chartDirty) scheduleRender();
}

function setPhase(text, cls = "") {
  const el = $("phase");
  el.textContent = text;
  el.className = `phase ${cls}`.trim();
}

// Effective threshold: after halftime the engine checks both conditions.
function threshold(S, turn = S.turn) {
  const P = S.params;
  return turn >= P.halfTimeTurn ? Math.min(P.winPercent, P.halfTimePercent) : P.winPercent;
}

function renderHeader() {
  const P = B.params, t = B.turn;
  $("turnLabel").textContent = `TURN ${fmt(t)}`;
  $("battleLabel").textContent = `BATTLE ${B.battle} / ${fmt(numBattles)}`;
  $("raceCount").textContent = `${B.teams.length} RACES`;
  const warnH = Math.min(200, Math.max(1, Math.floor(P.halfTimeTurn * 0.02)));
  const warnF = Math.min(400, Math.max(1, Math.floor(P.timeOutTurn * 0.02)));
  let key, text, cls = "";
  if (B.outcome) {
    const o = B.outcome, w = o.winner >= 0 && B.teams[o.winner];
    key = "ended";
    text = `BATTLE ENDED · ${REASONS[o.reason] || o.reason}${w && "WHT".includes(o.reason) ? ` · ${letterOf(o.winner)} ${w.name.toUpperCase()}` : ""}`;
    cls = "ended";
  } else if (t < P.halfTimeTurn && P.halfTimeTurn < P.timeOutTurn) {
    const rem = P.halfTimeTurn - t;
    if (rem <= warnH) { key = "warnH"; text = `HALFTIME IN ${fmt(rem)} TURNS`; cls = "near"; }
    else { key = "pre"; text = `PRE-HALFTIME · ${P.winPercent}% TO WIN`; }
  } else {
    const rem = P.timeOutTurn - t;
    if (rem <= warnF) { key = "warnF"; text = `FULLTIME IN ${fmt(rem)} TURNS`; cls = "near"; }
    else { key = t >= P.halfTimeTurn ? "post" : "pre"; text = `${t >= P.halfTimeTurn ? "POST-HALFTIME" : "PRE-HALFTIME"} · ${threshold(B)}% TO WIN`; }
  }
  if (B.phaseKey !== key) {
    if (key === "warnH") announce(`Halftime in ${turnsLeft(P.halfTimeTurn, t)} turns`);
    if (key === "warnF") announce(`Fulltime in ${turnsLeft(P.timeOutTurn, t)} turns`);
    B.phaseKey = key;
  }
  setPhase(text, cls);
  // Timeline
  const TO = Math.max(1, P.timeOutTurn);
  const at = (v) => `${Math.min(100, 100 * v / TO)}%`;
  $("progressFill").style.width = at(t);
  $("playhead").style.left = at(t);
  const showHalf = P.halfTimeTurn < P.timeOutTurn;
  $("halfMarker").style.display = $("halfLabel").style.display = showHalf ? "" : "none";
  $("halfMarker").style.left = $("halfLabel").style.left = at(P.halfTimeTurn);
  $("halfLabel").textContent = `HALFTIME ${fmt(P.halfTimeTurn)}`;
  $("fullLabel").textContent = `FULLTIME ${fmt(P.timeOutTurn)}`;
  $("remaining").textContent = B.outcome ? `ENDED AT TURN ${fmt(B.outcome.turn)}` : `${fmt(Math.max(0, P.timeOutTurn - t))} TURNS TO FULLTIME`;
}
const turnsLeft = (to, t) => fmt(Math.max(0, to - t));

const strength = (S, t) => t.ants + S.params.baseValue * t.bases;

// Leader over runner-up: L / (L + R), with near-victory hysteresis.
function renderLead() {
  const vals = B.teams.map((t, n) => ({ n, v: strength(B, t) })).sort((a, b) => b.v - a.v || a.n - b.n);
  const thr = threshold(B);
  $("thresholdTick").style.left = `${thr}%`;
  $("thresholdLabel").textContent = `${thr}% TO WIN`;
  if (vals.length < 2 || vals[0].v + vals[1].v === 0) {
    $("leadValue").textContent = "—"; $("pair").textContent = ""; $("leadFill").style.width = "0";
    B.near = false; $("leadPanel").classList.remove("near");
    return;
  }
  const L = vals[0], R = vals[1], ratio = 100 * L.v / (L.v + R.v);
  const tie = L.v === R.v;
  $("pair").textContent = tie ? `${letterOf(L.n)} = ${letterOf(R.n)} · JOINT LEADERS` : `${letterOf(L.n)} VS ${letterOf(R.n)}`;
  $("leadValue").textContent = `${ratio.toFixed(1)}%`;
  $("leadValue").title = `${B.teams[L.n].name} ${fmt(L.v)} ÷ (${fmt(L.v)} + ${B.teams[R.n].name} ${fmt(R.v)})`;
  $("leadFill").style.width = `${ratio}%`;
  $("leadFill").style.background = hexOf(B.colors[L.n]);
  if (B.nearThr !== thr) { B.near = false; B.nearThr = thr; }
  if (B.outcome) B.near = false;
  else if (!B.near && ratio >= thr - 5 && ratio < thr) B.near = true;
  else if (B.near && ratio < thr - 7) B.near = false;
  $("leadPanel").classList.toggle("near", B.near);
}

// --- Standings --------------------------------------------------------------------------

let moreStats = false;
const COLS = [
  ["#", ""], ["ID", ""], ["RACE", ""], ["STRENGTH", "num"], ["SHARE", "num"], ["ANTS", "num"], ["BASES", "num"],
];
const MORE_COLS = [["BORN", "num"], ["BUILT", "num"], ["KILLS", "num"], ["DEATHS", "num"], ["TERRITORY", "num"], ["NS/CALL", "num"]];

function buildRows() {
  const cols = moreStats ? [...COLS, ...MORE_COLS] : COLS;
  $("standHead").innerHTML = `<tr>${cols.map(([h, c]) => `<th class="${c}" scope="col">${h}</th>`).join("")}</tr>`;
  const tbody = $("rows");
  tbody.innerHTML = "";
  B.rows = B.teams.map((t, n) => {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.dataset.slot = n;
    const color = hexOf(B.colors[n]);
    tr.innerHTML = `<td><span class="rank"></span></td><td><span class="id" style="color:${color}">${letterOf(n)}</span></td>` +
      `<td class="race" title="${esc(t.name)}">${esc(t.name)}</td>` +
      `<td class="num strength"><span class="v"></span><span class="track"><b style="background:${color}"></b></span></td>` +
      `<td class="num share"></td><td class="num"></td><td class="num"></td>` +
      (moreStats ? MORE_COLS.map(() => `<td class="num"></td>`).join("") : "");
    tr.setAttribute("aria-label", `${letterOf(n)} ${t.name}`);
    tbody.appendChild(tr);
    return tr;
  });
  B.order = B.teams.map((_, n) => n);
  renderStandings();
}

function renderStandings() {
  if (!B || !B.rows.length) return;
  const vals = B.teams.map((t) => strength(B, t));
  const total = vals.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...vals);
  const fs = focusSlot();
  const order = B.teams.map((_, n) => n).sort((a, b) => vals[b] - vals[a] || a - b);
  order.forEach((n, k) => {
    const t = B.teams[n], tr = B.rows[n], td = tr.children;
    const out = t.ants === 0 && t.bases === 0;
    td[0].firstChild.textContent = out ? "" : String(k + 1).padStart(2, "0");
    td[3].firstChild.textContent = out ? "OUT" : fmt(vals[n]);
    td[3].lastChild.firstChild.style.width = `${100 * vals[n] / max}%`;
    td[4].textContent = total ? `${(100 * vals[n] / total).toFixed(1)}%` : "—";
    td[5].textContent = fmt(t.ants);
    td[6].textContent = fmt(t.bases);
    if (moreStats) {
      td[7].textContent = fmt(t.born); td[8].textContent = fmt(Math.max(0, t.built - 1));
      td[9].textContent = fmt(t.kill); td[10].textContent = fmt(t.killed);
      td[11].textContent = fmt(t.squares); td[12].textContent = t.nsPerCall ? fmt(t.nsPerCall) : "–";
    }
    tr.classList.toggle("out", out);
    tr.classList.toggle("selected", n === fs);
    tr.setAttribute("aria-selected", String(n === fs));
  });
  // Row order is frozen while the user is on the table.
  const tbody = $("rows");
  if (!tbody.contains(document.activeElement) && order.some((n, k) => B.order[k] !== n)) {
    for (const n of order) tbody.appendChild(B.rows[n]);
    B.order = order;
  }
}

$("rows").addEventListener("click", (e) => { const tr = e.target.closest("tr"); if (tr) setFocus(+tr.dataset.slot); });
$("rows").addEventListener("keydown", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFocus(+tr.dataset.slot); }
  if (e.key === "ArrowDown" && tr.nextElementSibling) { e.preventDefault(); tr.nextElementSibling.focus(); }
  if (e.key === "ArrowUp" && tr.previousElementSibling) { e.preventDefault(); tr.previousElementSibling.focus(); }
});
$("rows").addEventListener("focusout", () => setTimeout(() => { if (B) { B.tablesDirty = true; scheduleRender(); } }, 0));
$("moreStats").onclick = () => {
  moreStats = !moreStats;
  $("moreStats").setAttribute("aria-pressed", String(moreStats));
  $("moreStats").textContent = moreStats ? "Fewer stats" : "More stats";
  if (B) buildRows();
};
$("clearFocus").onclick = () => setFocus(-1);

function renderLegend() {
  $("legend").innerHTML = B.teams.map((t, n) =>
    `<button data-slot="${n}" style="color:${hexOf(B.colors[n])}" title="${esc(t.name)}" aria-label="Focus ${letterOf(n)} ${esc(t.name)}" aria-pressed="false">${letterOf(n)}</button>`).join("");
}
$("legend").onclick = (e) => { const b = e.target.closest("button"); if (b) setFocus(+b.dataset.slot); };

function setFocus(slot) {
  if (!B) return;
  const team = slot >= 0 ? B.teams[slot].team : 0;
  focusTeam = team === focusTeam ? 0 : team;
  buildPalette();
  repaintAll();
  renderFocusLabel();
  renderStandings();
  B.chartDirty = true;
  scheduleRender();
}

function renderFocusLabel() {
  const fs = focusSlot();
  $("focusLabel").textContent = fs >= 0 ? `FOCUS · ${letterOf(fs)} ${B.teams[fs].name.toUpperCase()}` : "ALL RACES";
  $("clearFocus").disabled = fs < 0;
  $("legend").querySelectorAll("button").forEach((b) => {
    const on = +b.dataset.slot === fs;
    b.classList.toggle("selected", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

// --- Strength chart ------------------------------------------------------------------------

let chartHover = null;   // CSS x within the chart, or null

function niceStep(max, count) {
  const raw = Math.max(max, 1) / count, mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

function chartGeometry() {
  const cv = $("chart"), w = cv.clientWidth, h = cv.clientHeight;
  const g = { cv, w, h, l: 46, r: 12, t: 16, b: 20 };
  g.pw = Math.max(10, w - g.l - g.r); g.ph = Math.max(10, h - g.t - g.b);
  g.n = B.history[0] ? B.history[0].length : 0;
  g.xMax = Math.max(g.n, 10);
  let maxV = 0;
  for (const a of B.history) for (let k = 0; k < a.length; k++) if (a[k] > maxV) maxV = a[k];
  g.step = niceStep(maxV, 4);
  g.yMax = Math.max(g.step, Math.ceil(maxV / g.step) * g.step);
  g.x = (turn) => g.l + turn / g.xMax * g.pw;
  g.y = (v) => g.t + g.ph - v / g.yMax * g.ph;
  return g;
}

function drawChart() {
  const g = chartGeometry(), cv = g.cv, dpr = devicePixelRatio || 1;
  if (!g.w) return;
  if (cv.width !== Math.round(g.w * dpr) || cv.height !== Math.round(g.h * dpr)) {
    cv.width = Math.round(g.w * dpr); cv.height = Math.round(g.h * dpr);
  }
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, g.w, g.h);
  ctx.font = `9px ${css("--font-mono")}`;
  ctx.lineWidth = 1;
  // Grid and axes
  ctx.textBaseline = "middle"; ctx.textAlign = "right";
  for (let v = 0; v <= g.yMax; v += g.step) {
    const y = Math.round(g.y(v)) + 0.5;
    ctx.strokeStyle = "#232427"; ctx.beginPath(); ctx.moveTo(g.l, y); ctx.lineTo(g.l + g.pw, y); ctx.stroke();
    ctx.fillStyle = "#77746c"; ctx.fillText(fmt(v), g.l - 6, y);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const xs = niceStep(g.xMax, 5);
  for (let t = 0; t <= g.xMax; t += xs) ctx.fillText(fmt(t), g.x(t), g.t + g.ph + 6);
  // Halftime boundary at the real configured turn
  const HT = B.params.halfTimeTurn;
  if (HT <= g.xMax && HT < B.params.timeOutTurn) {
    const x = Math.round(g.x(HT)) + 0.5;
    ctx.strokeStyle = AMBER; ctx.globalAlpha = 0.7; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, g.t); ctx.lineTo(x, g.t + g.ph); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = AMBER; ctx.textAlign = x > g.l + g.pw - 60 ? "right" : "left"; ctx.textBaseline = "top";
    ctx.fillText("HALFTIME", x + (ctx.textAlign === "left" ? 4 : -4), g.t + 2);
  }
  drawMarks(ctx, g);
  // Series: min/max per pixel column, so sudden drops survive.
  const fs = focusSlot();
  const latest = B.history.map((a) => a[a.length - 1] || 0);
  const top3 = latest.map((v, n) => n).sort((a, b) => latest[b] - latest[a] || a - b).slice(0, 3);
  const order = B.history.map((_, n) => n).filter((n) => n !== fs);
  if (fs >= 0) order.push(fs);
  for (const n of order) {
    const a = B.history[n];
    if (!a.length) continue;
    ctx.strokeStyle = hexOf(B.colors[n]);
    ctx.lineWidth = n === fs ? 2 : 1.35;
    ctx.globalAlpha = fs >= 0 ? (n === fs ? 1 : 0.24) : top3.includes(n) ? 1 : 0.72;
    ctx.beginPath();
    if (a.length <= g.pw) {
      for (let k = 0; k < a.length; k++) { const x = g.x(k + 1), y = g.y(a[k]); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    } else {
      let col = -1, first = 0, lo = 0, hi = 0, last = 0, started = false;
      const flush = () => {
        const x = g.l + col + 0.5;
        if (started) ctx.lineTo(x, g.y(first)); else { ctx.moveTo(x, g.y(first)); started = true; }
        ctx.lineTo(x, g.y(lo)); ctx.lineTo(x, g.y(hi)); ctx.lineTo(x, g.y(last));
      };
      for (let k = 0; k < a.length; k++) {
        const c = Math.floor((k + 1) / g.xMax * g.pw), v = a[k];
        if (c !== col) { if (col >= 0) flush(); col = c; first = lo = hi = last = v; }
        else { if (v < lo) lo = v; if (v > hi) hi = v; last = v; }
      }
      flush();
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Shared cursor and readout
  if (chartHover !== null && g.n) {
    const turn = Math.max(1, Math.min(g.n, Math.round((chartHover - g.l) / g.pw * g.xMax)));
    const x = Math.round(g.x(turn)) + 0.5;
    ctx.strokeStyle = "#8d8a82"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, g.t); ctx.lineTo(x, g.t + g.ph); ctx.stroke();
    const vals = B.history.map((a, n) => ({ n, v: a[turn - 1] })).sort((p, q) => (q.n === fs) - (p.n === fs) || q.v - p.v || p.n - q.n);
    const near = B.marks.filter((m) => Math.abs(g.x(m.turn) - x) <= 4).slice(-3)
      .map((m) => `${m.label} T${fmt(m.turn)}`);
    $("chartReadout").textContent = `TURN ${fmt(turn)} · ` + vals.map((p) => `${letterOf(p.n)} ${fmt(p.v)}`).join("  ") +
      (near.length ? ` · ${near.join(", ")}` : "");
  }
}

// Base and leader events as tiny marks at the top, grouped when close.
function drawMarks(ctx, g) {
  const groups = [];
  for (const m of B.marks) {
    const x = g.x(m.turn), last = groups[groups.length - 1];
    if (last && x - last.x < 6) { last.count++; last.m = m; } else groups.push({ x, count: 1, m });
  }
  const y = g.t - 9;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  for (const gr of groups) {
    const x = Math.round(gr.x) + 0.5, m = gr.m;
    ctx.globalAlpha = 0.12; ctx.strokeStyle = "#efe9dc";
    ctx.beginPath(); ctx.moveTo(x, g.t); ctx.lineTo(x, g.t + g.ph); ctx.stroke();
    ctx.globalAlpha = 1;
    if (m.kind === "base-lost") {
      ctx.strokeStyle = DANGER; ctx.beginPath();
      ctx.moveTo(x - 2, y - 2); ctx.lineTo(x + 2, y + 2); ctx.moveTo(x + 2, y - 2); ctx.lineTo(x - 2, y + 2); ctx.stroke();
    } else if (m.kind === "leader-changed") {
      ctx.strokeStyle = AMBER; ctx.beginPath(); ctx.moveTo(x - 3, y + 2); ctx.lineTo(x, y - 2); ctx.lineTo(x + 3, y + 2); ctx.stroke();
    } else {
      ctx.strokeStyle = hexOf(B.colors[m.slot] || 0xefe9dc); ctx.strokeRect(x - 2, y - 2, 4, 4);
    }
    if (gr.count > 1) { ctx.fillStyle = "#a9a69e"; ctx.fillText(String(gr.count), x + 4, y); }
  }
}

$("chart").addEventListener("mousemove", (e) => {
  chartHover = e.clientX - $("chart").getBoundingClientRect().left;
  if (B) { B.chartDirty = true; scheduleRender(); }
});
$("chart").addEventListener("mouseleave", () => {
  chartHover = null;
  $("chartReadout").textContent = "Hover chart for turn and strength · letters stay with their races";
  if (B) { B.chartDirty = true; scheduleRender(); }
});

// --- Events ----------------------------------------------------------------------------

let log = [];              // newest first, at most 200 presentation entries
let totalEvents = 0, hiddenEvents = 0;
let leaderPending = null;

function onEvent(e, S) {
  const seq = Number(String(e.id).split(":")[1]);
  if (e.battleId < lastEvent.b || (e.battleId === lastEvent.b && seq <= lastEvent.s)) return;   // duplicate
  lastEvent = { b: e.battleId, s: seq };
  totalEvents++;
  S.events++;
  if (document.hidden) hiddenEvents++;
  const who = e.slot >= 0 && S.teams[e.slot] ? { letter: letterOf(e.slot), name: S.teams[e.slot].name, color: hexOf(S.colors[e.slot]) } : null;
  const where = e.x !== undefined ? `(${e.x},${e.y})` : "";
  switch (e.kind) {
    case "base-created":
    case "base-lost": {
      const lost = e.kind === "base-lost";
      S.marks.push({ turn: e.turn, kind: e.kind, slot: e.slot, label: `${who ? who.letter : "?"} base ${lost ? "lost" : "created"}` });
      addEffect(e, S);
      const by = lost && e.by >= 0 && S.teams[e.by] ? ` by ${letterOf(e.by)} ${S.teams[e.by].name}` : "";
      const now = performance.now(), top = log[0];
      if (top && top.kind === e.kind && top.slot === e.slot && top.battleId === e.battleId && now - top.t < 250) {
        top.count++; top.where.push(where + by);
        top.text = `${top.count} bases ${lost ? "lost" : "created"}`;
        renderEvents(true);
      } else {
        addLog({ kind: e.kind, slot: e.slot, battleId: e.battleId, battle: S.battle, turn: e.turn, who, count: 1,
          where: [where + by], text: lost ? "Base lost" : "Base created", cls: lost ? "lost" : "", icon: lost ? "base-lost" : "base-created" });
      }
      if (lost && who) announceSoon(`${who.letter} ${who.name} lost a base`);
      break;
    }
    case "leader-changed":
      S.marks.push({ turn: e.turn, kind: e.kind, slot: e.slot, label: `${who ? who.letter : "?"} leads` });
      if (!leaderPending) leaderPending = { count: 0, timer: setTimeout(flushLeader, 500) };
      leaderPending.count++; leaderPending.e = e; leaderPending.S = S; leaderPending.who = who;
      break;
    case "halftime":
      addLog({ kind: e.kind, battleId: e.battleId, battle: S.battle, turn: e.turn, count: 1, where: [],
        text: `Halftime · ${threshold(S, e.turn)}% to win`, cls: "milestone", icon: "halftime" });
      announce(`Halftime. ${threshold(S, e.turn)} percent to win.`);
      break;
    case "battle-ended": {
      S.outcome = S.outcome && S.outcome.reason !== "?" ? S.outcome : { reason: e.reason, winner: e.slot, turn: e.turn };
      const reason = REASONS[e.reason] || e.reason;
      const won = who && "WHT".includes(e.reason);
      addLog({ kind: e.kind, slot: won ? e.slot : -1, battleId: e.battleId, battle: S.battle, turn: e.turn, who: won ? who : null,
        count: 1, where: [], text: `Battle ${S.battle} ended · ${reason}`, cls: "milestone", icon: "fulltime" });
      announce(`Battle ${S.battle} ended, ${reason.toLowerCase()}${won ? `, ${who.name} wins` : ""}.`);
      if (S === B) { B.tablesDirty = true; scheduleRender(); }
      break;
    }
  }
}

// Leader changes are shown 500 ms after the first one, summarised.
function flushLeader() {
  const p = leaderPending;
  leaderPending = null;
  if (!p) return;
  const { e, S, who } = p;
  addLog({ kind: "leader-changed", slot: e.slot, battleId: e.battleId, battle: S.battle, turn: e.turn, who, count: p.count, where: [],
    text: p.count > 1 ? `${p.count} lead changes` : "Takes the lead", cls: "milestone", icon: "leader" });
  if (who) announce(`${who.name} takes the lead`);
  if (S === B && B.rows[e.slot]) {
    const tr = B.rows[e.slot];
    tr.classList.remove("leader-flash"); void tr.offsetWidth; tr.classList.add("leader-flash");
    setTimeout(() => tr.classList.remove("leader-flash"), 1300);
  }
}

function addLog(entry) {
  entry.t = performance.now();
  log.unshift(entry);
  if (log.length > 200) log.length = 200;
  renderEvents(false);
}

function eventRow(en, fresh) {
  const who = en.who ? `<span class="who" style="color:${en.who.color}" title="${esc(en.who.name)}">${en.who.letter} ${esc(en.who.name)}</span>` : "";
  const style = en.who && !en.cls ? ` style="color:${en.who.color}"` : "";
  const details = `Battle ${en.battle}, turn ${en.turn}${en.where.length ? ": " + en.where.slice(0, 12).join(", ") + (en.where.length > 12 ? " …" : "") : ""}`;
  return `<div class="event ${en.cls || ""}${fresh ? " event-new" : ""}" title="${esc(details)}"><time>T${fmt(en.turn)}</time>` +
    `<span${style}>${icon(en.icon)}</span><span>${esc(en.text)}</span>${who}</div>`;
}

function renderEvents(update) {
  $("events").innerHTML = log.slice(0, 2).map((en, k) => eventRow(en, k === 0 && !update)).join("") ||
    `<div class="event muted">No events yet</div>`;
  $("eventCount").textContent = totalEvents ? `(${fmt(totalEvents)})` : "";
  if (!$("historyDrawer").classList.contains("hidden")) renderHistory();
}

function renderHistory() {
  $("historyList").innerHTML = log.map((en) => eventRow(en, false).replace("</div>",
    `</div>${en.where.length ? `<div class="event where">${esc(en.where.slice(0, 20).join(" "))}${en.where.length > 20 ? " …" : ""}</div>` : ""}`)).join("") ||
    `<div class="event muted">No events yet</div>`;
}
$("historyBtn").onclick = () => { renderHistory(); $("historyDrawer").classList.remove("hidden"); $("closeHistory").focus(); };
$("closeHistory").onclick = () => { $("historyDrawer").classList.add("hidden"); $("historyBtn").focus(); };

// Polite announcements, grouped, at most once per second.
let annQueue = [], annTimer = 0, annLast = 0;
function announce(msg) {
  annQueue.push(msg);
  if (!annTimer) annTimer = setTimeout(flushAnnounce, Math.max(0, 1000 - (performance.now() - annLast)));
}
function flushAnnounce() {
  annTimer = 0; annLast = performance.now();
  $("announcer").textContent = annQueue.length > 3 ? `${annQueue.slice(-3).join(". ")} (${annQueue.length - 3} more)` : annQueue.join(". ");
  annQueue = [];
}
let soonCount = 0, soonTimer = 0, soonMsg = "";
function announceSoon(msg) {   // base losses: one summary per second
  soonCount++; soonMsg = msg;
  if (!soonTimer) soonTimer = setTimeout(() => { announce(soonCount > 1 ? `${soonCount} bases lost` : soonMsg); soonCount = 0; soonTimer = 0; }, 1000);
}

// A hidden tab skips effects; on return a summary replaces the backlog.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenEvents = 0; return; }
  if (hiddenEvents && B) {
    addLog({ kind: "summary", battleId: B.id, battle: B.battle, turn: B.turn, count: hiddenEvents, where: [],
      text: `${hiddenEvents} events while hidden`, cls: "milestone", icon: "history" });
    announce(`${hiddenEvents} events while the tab was hidden`);
  }
  hiddenEvents = 0;
  if (running && !paused && !inflight) pump();
});

// --- Keys -------------------------------------------------------------------------------

function sendCmd(code) { if (running && !par) worker.postMessage({ type: "cmd", code }); }
document.querySelectorAll("[data-cmd]").forEach((b) => { b.onclick = () => sendCmd(+b.dataset.cmd); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("historyDrawer").classList.contains("hidden")) { $("closeHistory").click(); return; }
  if ((e.target.tagName === "INPUT" && e.target.type === "text") || e.target.tagName === "TEXTAREA") return;
  const k = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, Escape: 3 }[e.key];
  if (k && running) { e.preventDefault(); sendCmd(k); }
});

// --- JavaScript ants: list and editor ----------------------------------------------

const TEMPLATE = `// My first ant.
//
// f[0..4] are the squares: here, right, down, left, up.
//   f[i].ants  f[i].base  f[i].team (0 = us, 1.. = enemies)  f[i].food
// m[0] is this ant's brain, m[1..] the brains of the other ants on this square.
// Return 0 stay, 1 right, 2 down, 3 left, 4 up; add 8 to carry one food;
// return exactly 16 to build a base (needs 26 ants and 50 food on the square).

export default {
  title: "MyAnt#3399FF",
  brain: [
    ["x", "i16"], ["y", "i16"],     // where I am, relative to the base
  ],

  step(f, m) {
    const me = m[0];
    for (let i = 1; i < 5; i++) {
      if (f[i].team) return i;      // attack an enemy next to us
    }
    if (f[0].base) { me.x = 0; me.y = 0; }
    const d = 1 + Math.floor(Math.random() * 4);
    if (d == 1) me.x++; else if (d == 2) me.y++; else if (d == 3) me.x--; else me.y--;
    return d;
  },
};
`;

let editingId = null;

function renderJsList() {
  const list = allJs();
  $("jsList").innerHTML = list.map((j) => {
    const err = jsErrors[j.id];
    const builtin = BUILTIN_JS.some((b) => b.id === j.id) && !storedJs.some((s) => s.id === j.id);
    return `<li><span class="name">${esc(j.id)}</span>${builtin ? '<span class="tag hint">example</span>' : ""}
      ${err ? `<span class="err" title="${esc(err)}">error</span>` : ""}
      <button data-edit="${esc(j.id)}">Edit</button></li>`;
  }).join("") || `<li class="empty">None yet.</li>`;
}

$("jsList").onclick = (e) => {
  const b = e.target.closest("button[data-edit]");
  if (b) openEditor(b.dataset.edit);
};
$("newJs").onclick = () => openEditor(null);

function openEditor(id) {
  editingId = id;
  const j = id ? allJs().find((x) => x.id === id) : null;
  $("code").value = j ? j.source : TEMPLATE;
  $("editorTitle").textContent = id || "New JavaScript ant";
  $("editorHint").textContent = id && BUILTIN_JS.some((b) => b.id === id) && !storedJs.some((s) => s.id === id)
    ? "Example shipped with the app. Saving makes your own copy." : "";
  $("deleteJs").disabled = !id || !storedJs.some((s) => s.id === id);
  $("editorMsg").textContent = id && jsErrors[id] ? jsErrors[id] : "";
  $("editorMsg").className = id && jsErrors[id] ? "bad" : "";
  $("editor").classList.remove("hidden");
  $("code").focus();
}

$("closeJs").onclick = () => { $("editor").classList.add("hidden"); };

// The file name comes from the title: "MyAnt#3399FF" -> MyAnt.js
function idFromSource(source) {
  const m = /title\s*:\s*["'`]([^"'`#]+)/.exec(source);
  const name = m ? m[1].trim().replace(/[^A-Za-z0-9_-]/g, "") : "";
  return name ? `${name}.js` : null;
}

$("saveJs").onclick = () => {
  const source = $("code").value;
  const id = idFromSource(source);
  if (!id) { showEditorMsg('Give the ant a title, e.g. title: "MyAnt#3399FF"', false); return; }
  if (ants.some((a) => a.id === id && !a.js)) { showEditorMsg(`The name ${id} is taken`, false); return; }
  if (running) { showEditorMsg("Stop the running game first.", false); return; }
  // Renaming an ant (changing its title) replaces the old entry.
  storedJs = storedJs.filter((s) => s.id !== id && s.id !== editingId);
  storedJs.push({ id, source });
  saveStoredJs(storedJs);
  if (editingId && editingId !== id) teams = teams.map((t) => (t === editingId ? id : t));
  editingId = id;
  $("editorTitle").textContent = id;
  $("deleteJs").disabled = false;
  worker.postMessage({ type: "addJs", id, source });
};

function onJsAnt(info) {
  if (info.error) {
    jsErrors[info.id] = info.error;
    ants = ants.filter((a) => a.id !== info.id);
    showEditorMsg(`Error: ${info.error}`, false);
  } else {
    delete jsErrors[info.id];
    ants = ants.filter((a) => a.id !== info.id).concat(info);
    showEditorMsg(`OK: ${info.id}, brain ${info.memSize} bytes. Add it to the races to play it.`, true);
  }
  renderAddSelect();
  renderJsList();
  renderTeams();
}

function showEditorMsg(text, ok) {
  $("editorMsg").textContent = text;
  $("editorMsg").className = ok ? "ok" : "bad";
}

$("deleteJs").onclick = () => {
  if (!editingId || !confirm(`Delete ${editingId} from this browser?`)) return;
  storedJs = storedJs.filter((s) => s.id !== editingId);
  saveStoredJs(storedJs);
  teams = teams.filter((t) => t !== editingId || BUILTIN_JS.some((b) => b.id === t));
  $("editor").classList.add("hidden");
  createWorker();
};

$("downloadJs").onclick = () => {
  const source = $("code").value;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  a.download = idFromSource(source) || "ant.js";
  a.click();
};

// Tab inserts two spaces in the editor.
$("code").addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const t = e.target, a = t.selectionStart;
  t.value = t.value.slice(0, a) + "  " + t.value.slice(t.selectionEnd);
  t.selectionStart = t.selectionEnd = a + 2;
});

// --- Tournament: standings so far and the original's final ratings --------------------------

function mergeLive(lists) {
  const out = [];
  for (const l of lists) {
    if (!l) continue;
    l.forEach((t, i) => {
      const o = out[i] || (out[i] = { battles: 0, won: 0, basesBuilt: 0, born: 0, kill: 0, killed: 0 });
      for (const k of Object.keys(o)) o[k] += t[k];
    });
  }
  return out;
}

// Standings and progress, at most 4 times a second (and always at the end).
function renderTour(done, force) {
  const now = performance.now();
  if (!force && now - lastTour < 250) return;
  lastTour = now;
  renderStandingsSoFar(liveTotals);
  renderProgress(done, numBattles, par ? `${par.jobs} workers` : "1 worker");
}

function renderProgress(done, total, how) {
  const secs = (performance.now() - startTime) / 1000;
  const rate = done / Math.max(secs, 0.001);
  const eta = rate > 0 && done < total ? (total - done) / rate : 0;
  const t = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s` : `${Math.floor(s)}s`);
  $("progress").textContent = `${done} / ${total} BATTLES · ${t(secs)} ELAPSED` +
    (eta ? ` · ABOUT ${t(eta)} LEFT` : "") + (turnsSeen && !par ? ` · ${fmt(Math.round(turnsSeen / secs))} TURNS/S` : "") + ` · ${how.toUpperCase()}`;
}

// Tournament standings so far, by win rate.
function renderStandingsSoFar(totals) {
  if (!totals || !teamInfo.length) return;
  const rows = totals.map((t, i) => ({ ...t, i })).filter((t) => t.battles > 0)
    .sort((a, b) => (b.won / b.battles - a.won / a.battles) || b.won - a.won);
  $("standTable").innerHTML = `<tr><th>#</th><th>Race</th><th>Battles</th><th>Won</th><th>Vict</th><th title="bases built per battle (incl. the start base)">Bases</th><th title="ants born per battle">Ants</th><th>Comb</th></tr>` +
    rows.map((t, k) => `<tr><td>${k + 1}</td><td>${swatch(teamInfo[t.i].color)}${letterOf(t.i)} ${esc(teamInfo[t.i].name)}</td><td>${t.battles}</td><td>${t.won}</td>
      <td>${pct1(t.won, t.battles)}%</td><td>${(t.basesBuilt / t.battles).toFixed(1)}</td><td>${Math.round(t.born / t.battles)}</td><td>${pct1(t.kill, t.kill + t.killed)}%</td></tr>`).join("");
}

// The original final table, sortable. Values in tenths are shown as such.
const RESULT_COLS = [
  ["name", "Race"], ["battles", "Battles"], ["won", "Won"], ["bases", "Bases", 10], ["ants", "Ants"], ["size", "Size"],
  ["ages", "Ages"], ["comb", "Comb", 10, "%"], ["time", "Time"], ["vict", "Vict", 10, "%"], ["perf", "Perf", 10, "%"], ["pres", "Pres", 10, "%"],
];
let resultRows = [], resultSort = "vict";
function renderResults(rows) {
  if (!rows) return;
  resultRows = rows;
  const total = rows.find((r) => r.team === 0);
  const teamsOnly = rows.filter((r) => r.team !== 0).sort((a, b) =>
    resultSort === "name" ? a.name.localeCompare(b.name) : (b[resultSort] - a[resultSort]) || (b.vict - a.vict));
  const cell = (r, [k, , div, suffix]) => k === "name"
    ? `${r.team ? swatch(teamInfo[r.team - 1] ? teamInfo[r.team - 1].color : 0) : ""}${esc(r.name)}`
    : `${div ? (r[k] / div).toFixed(1) : r[k]}${suffix || ""}`;
  $("resultTable").innerHTML = `<tr><th>#</th>${RESULT_COLS.map((c) => `<th data-sort="${c[0]}" class="${c[0] === resultSort ? "sorted" : ""}" tabindex="0">${c[1]}</th>`).join("")}</tr>` +
    teamsOnly.map((r, k) => `<tr><td>${k + 1}</td>${RESULT_COLS.map((c) => `<td>${cell(r, c)}</td>`).join("")}</tr>`).join("") +
    (total ? `<tr class="total"><td></td>${RESULT_COLS.map((c) => `<td>${cell(total, c)}</td>`).join("")}</tr>` : "");
  $("resultsBox").classList.remove("hidden");
}
$("resultTable").addEventListener("click", (e) => {
  const th = e.target.closest("th[data-sort]");
  if (th) { resultSort = th.dataset.sort; renderResults(resultRows); }
});
$("resultTable").addEventListener("keydown", (e) => {
  const th = e.target.closest("th[data-sort]");
  if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); resultSort = th.dataset.sort; renderResults(resultRows); }
});

setPauseLabel();
setView("setup");
