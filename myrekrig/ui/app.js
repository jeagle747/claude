// MyreKrig browser app: setup, viewer and results. The simulation runs in a
// worker (ui/worker.js); this file only draws what the worker sends.

const PARAMS = [
  ["MapWidth", "w", "auto"], ["MapHeight", "h", "auto"], ["StartAnts", "a", "15–40"],
  ["NewFoodSpace", "f", "10–50"], ["NewFoodMin", "m", "10–30"], ["NewFoodDiff", "d", "5–20"],
  ["HalfTimeTurn", "t", "10000"], ["TimeOutTurn", "o", "20000"], ["WinPercent", "p", "75"],
  ["HalfTimePercent", "e", "60"], ["BattleSize", "b", "all"],
];
const YOURS = ["Legions", "SkyNET", "Rambo"];
const BY_CLAUDE = ["Kompas", "Probe", "Probe.js"];
const USES_GLOBALS = ["myresyre", "borg", "GridAnt"];
const SPEEDS = [1, 2, 5, 10, 25, 50, 100, 250, 1000, 0]; // turns per frame; 0 = as fast as possible

const $ = (id) => document.getElementById(id);
const hex = (c) => "#" + (c & 0xffffff).toString(16).padStart(6, "0");
const rgb = (c, f = 1, add = 0) => {
  const r = (c >>> 16) & 255, g = (c >>> 8) & 255, b = c & 255;
  return `rgb(${Math.floor(r * f) + add},${Math.floor(g * f) + add},${Math.floor(b * f) + add})`;
};

// --- State --------------------------------------------------------------------

let ants = [];            // [{id, name, color, memSize}]
let teams = [];           // selected ant ids, in order
let running = false, paused = false, inflight = false, finished = false;
let zoom = 1, zoomAuto = true;
let outText = "";
let graphData = [], graphWin = [], graphSerial = -1;
let lastFrame = null;

// --- Worker -------------------------------------------------------------------

const DATA = JSON.parse($("ants-data").textContent);
const WASM = DATA.wasm.map((a) => {
  const bin = atob(a.wasm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { name: a.name, bytes };
});
const BUILTIN_JS = DATA.js;   // [{id, source}] shipped with the app
const STORE_KEY = "myrekrig.jsAnts";
let firstLoad = true;

// Your JS ants, kept in this browser (localStorage) as [{id, source}].
function loadStoredJs() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
}
function saveStoredJs(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}
let storedJs = loadStoredJs();
const allJs = () => [...BUILTIN_JS.filter((b) => !storedJs.some((s) => s.id === b.id)), ...storedJs];

let worker;
function createWorker() {
  if (worker) worker.terminate();
  worker = new Worker(URL.createObjectURL(new Blob([$("worker-src").textContent], { type: "text/javascript" })));
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "ants") onAnts(m.list);
    else if (m.type === "jsAnt") onJsAnt(m.info);
    else if (m.type === "started") onStarted(m);
    else if (m.type === "frame") { if (par) onParallelFrame(0, m); else onFrame(m); }
    else if (m.type === "finished") onFinished(m);
    else if (m.type === "probe") onProbe(m);
    else if (m.type === "error") { $("warnings").textContent += m.message + "\n"; stopGame(); }
  };
  worker.onerror = (e) => { $("warnings").textContent += `Worker error: ${e.message}\n`; };
  // Copies of the bytes, so the originals stay usable for the next worker.
  worker.postMessage({ type: "init", ants: WASM.map((a) => ({ name: a.name, bytes: a.bytes.slice() })), js: allJs() });
}
createWorker();

let jsErrors = {};
function onAnts(list) {
  ants = list.filter((a) => !a.error);
  jsErrors = {};
  const failed = list.filter((a) => a.error);
  for (const a of failed) if (a.js) jsErrors[a.id] = a.error;
  const wasmFailed = failed.filter((a) => !a.js);
  if (wasmFailed.length) $("warnings").textContent += `Could not load: ${wasmFailed.map((a) => a.id).join(", ")}\n`;
  renderAddSelect();
  renderJsList();
  $("status").textContent = `${ants.length} ants loaded`;
  if (firstLoad) { teams = [...YOURS]; firstLoad = false; }
  teams = teams.filter((id) => antInfo(id));
  renderTeams();
}

function renderAddSelect() {
  const rank = (a) => (YOURS.includes(a.id) ? 0 : a.js ? 1 : 2);
  const sorted = [...ants].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  $("addSelect").innerHTML = sorted.map((a) =>
    `<option value="${a.id}">${YOURS.includes(a.id) ? "★ " : ""}${a.id} (${a.memSize} B)</option>`).join("");
}

// --- Setup panel --------------------------------------------------------------

function antInfo(id) { return ants.find((a) => a.id === id); }

function renderTeams() {
  const ul = $("teamList");
  if (!teams.length) {
    ul.innerHTML = `<li class="empty">No teams. Add at least one.</li>`;
  } else {
    ul.innerHTML = teams.map((id, i) => {
      const a = antInfo(id);
      const tags = [YOURS.includes(id) ? "yours" : "", BY_CLAUDE.includes(id) ? "Claude" : "", a.js ? "JS" : "", USES_GLOBALS.includes(id) ? "global state" : "", `${a.memSize} B`]
        .filter(Boolean).join(" · ");
      return `<li><span class="letter">${String.fromCharCode(65 + i)}</span>
        <span class="swatch" style="background:${hex(a.color)}"></span>
        <span class="name" title="${a.name}">${id}</span><span class="tag">${tags}</span>
        <button data-up="${i}" ${i ? "" : "disabled"} title="Move up">▲</button>
        <button data-down="${i}" ${i < teams.length - 1 ? "" : "disabled"} title="Move down">▼</button>
        <button data-del="${i}" title="Remove">✕</button></li>`;
    }).join("");
  }
  const z = $("pz"), old = z.value;
  z.innerHTML = `<option value="">(none)</option>` +
    teams.map((id, i) => `<option value="${i + 1}">${String.fromCharCode(65 + i)} ${id}</option>`).join("");
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
    `<tr><td>${name}</td><td><input type="number" min="0" id="min-${name}" placeholder="${def}"></td>` +
    `<td><input type="number" min="0" id="max-${name}" placeholder="${def}"></td></tr>`).join("");

function buildArgv() {
  const argv = [];
  for (const [name, l] of PARAMS) {
    const lo = $(`min-${name}`).value.trim(), hi = $(`max-${name}`).value.trim();
    if (lo !== "") argv.push(`${l}${lo}`);              // lower case sets min and max
    if (hi !== "" && hi !== lo) argv.push(`${l.toUpperCase()}${hi}`);
    else if (hi !== "" && lo === "") argv.push(`${l.toUpperCase()}${hi}`);
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
  teams = names;
  const right = params.join(" ");
  for (const [name] of PARAMS) { $(`min-${name}`).value = ""; $(`max-${name}`).value = ""; }
  $("pn").value = ""; $("ps").value = ""; $("pz").value = "";
  const z = [];
  for (const arg of right.trim().split(/\s+/).filter(Boolean)) {
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
  renderTeams();
  if (z.length) { $("pz").value = z[z.length - 1]; updateLine(); }
  return true;
}

document.querySelector("aside").addEventListener("input", (e) => { if (e.target.id !== "setupLine") updateLine(); });
$("pz").onchange = updateLine;
$("applyLine").onclick = () => applyLine($("setupLine").value);
$("copyLine").onclick = () => navigator.clipboard && navigator.clipboard.writeText($("setupLine").value);
$("newSeed").onclick = () => { $("ps").value = Math.floor(Math.random() * 4294967296); updateLine(); };

// --- Running --------------------------------------------------------------------

// Parallel runs (no display): extra workers, each playing every jobs-th
// battle; the page prints the battles in order and merges the totals.
let par = null;   // {jobs, workers, texts, next, totals, done, frames}
const cores = () => Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2)));
let startTime = 0, turnsSeen = 0;

$("startBtn").onclick = () => {
  if (!teams.length) { alert("Add at least one team."); return; }
  if ($("ps").value.trim() === "") $("ps").value = Math.floor(Math.random() * 4294967296);
  updateLine();
  outText = ""; $("out").textContent = ""; $("warnings").textContent = "";
  graphData = []; graphWin = []; graphSerial = -1; lastFrame = null;
  $("resultsBox").classList.add("hidden");
  startTime = performance.now(); turnsSeen = 0;
  const argv = buildArgv();
  const jobs = !$("show").checked && $("parallel").checked ? cores() : 1;
  if (jobs > 1) {
    par = { jobs, workers: [worker], texts: new Map(), next: 0, totals: [], live: [], doneCount: 0, turn: [] };
    for (let j = 1; j < jobs; j++) par.workers.push(createHelper(j));
    par.workers.forEach((w, j) => w.postMessage({ type: "start", ants: teams, argv, jobs, job: j }));
  } else {
    par = null;
    worker.postMessage({ type: "start", ants: teams, argv });
  }
};
// Stop replaces the workers, so it also works when an ant is stuck in a loop.
$("stopBtn").onclick = () => { stopHelpers(); stopGame(); createWorker(); $("status").textContent = "Stopped"; };

function createHelper(job) {
  const w = new Worker(URL.createObjectURL(new Blob([$("worker-src").textContent], { type: "text/javascript" })));
  w.onmessage = (e) => {
    const m = e.data;
    if (m.type === "frame") onParallelFrame(job, m);
    else if (m.type === "error") { $("warnings").textContent += m.message + "\n"; }
  };
  w.postMessage({ type: "init", ants: WASM.map((a) => ({ name: a.name, bytes: a.bytes.slice() })), js: allJs() });
  return w;
}

function stopHelpers() {
  if (par) par.workers.slice(1).forEach((w) => w.terminate());
  par = null;
}

function onParallelFrame(job, f) {
  if (!par) return;
  if (f.out) appendOut(f.out);                       // the header (job 0)
  if (f.warnings && f.warnings.length) $("warnings").textContent += f.warnings.join("\n") + "\n";
  for (const b of f.battleTexts || []) par.texts.set(b.index, b.text);
  let text = "";
  while (par.texts.has(par.next)) { text += par.texts.get(par.next); par.texts.delete(par.next); par.next++; }
  if (text) appendOut(text);
  par.live[job] = f.totals;
  par.turn[job] = f.turn;
  if (f.done) { par.totals[job] = f.rawTotals; par.doneCount++; }
  renderStandings(mergeLive(par.live));
  renderProgress(Math.min(par.next, f.numBattles), f.numBattles, `${par.jobs} workers`);
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
  finished = true; stopGame();
  $("status").textContent = "Finished";
}
$("pauseBtn").onclick = () => {
  paused = !paused;
  $("pauseBtn").textContent = paused ? "Resume" : "Pause";
  $("stepBtn").disabled = !paused;
  if (!paused) pump();
};
$("stepBtn").onclick = () => { if (paused && !inflight) { inflight = true; worker.postMessage({ type: "run", show: true, budgetMs: 50, maxTurns: 1 }); } };

function onStarted(m) {
  running = true; paused = false; finished = false; inflight = false;
  teamInfo = m.teams;
  $("startBtn").disabled = true; $("stopBtn").disabled = false;
  $("pauseBtn").disabled = false; $("pauseBtn").textContent = "Pause"; $("stepBtn").disabled = true;
  document.querySelectorAll("aside input, aside select, aside button:not(#stopBtn)").forEach((el) => { el.disabled = true; });
  $("status").textContent = `Seed ${m.seed}`;
  if (par) {
    $("pauseBtn").disabled = true;
    par.workers.forEach((w) => w.postMessage({ type: "run", show: false, budgetMs: 150, maxTurns: 0 }));
  } else pump();
}

function stopGame() {
  running = false; inflight = false;
  $("startBtn").disabled = false; $("stopBtn").disabled = true;
  $("pauseBtn").disabled = true; $("stepBtn").disabled = true;
  document.querySelectorAll("aside input, aside select, aside button").forEach((el) => { el.disabled = false; });
  renderTeams();
}

function pump() {
  if (!running || paused || inflight) return;
  inflight = true;
  const show = $("show").checked;
  const turns = SPEEDS[+$("speed").value];
  worker.postMessage({ type: "run", show, budgetMs: show ? 25 : 120, maxTurns: show ? turns : 0 });
}

function onFrame(f) {
  inflight = false;
  if (f.out) appendOut(f.out);
  if (f.turn && lastFrame && f.serial === lastFrame.serial) turnsSeen += Math.max(0, f.turn - lastFrame.turn);
  else if (f.turn) turnsSeen += f.turn;
  renderStandings(f.totals);
  renderProgress(f.done ? f.numBattles : f.battle - 1, f.numBattles, "1 worker");
  if (f.slots) renderBattleTable(f);
  if (f.done && f.results) renderResults(f.results);
  if (f.warnings && f.warnings.length) $("warnings").textContent += f.warnings.join("\n") + "\n";
  lastFrame = f;
  if (f.slots) {
    if (f.serial !== graphSerial) { graphSerial = f.serial; graphData = f.slots.map(() => []); graphWin = []; }
    f.graph.forEach((pts, n) => { for (const v of pts) graphData[n].push(v); });
    for (const v of f.graphWin) graphWin.push(v);
  }
  if (f.pixels) drawMap(f);
  if (f.slots && $("show").checked) { drawStats(f); if ($("optGraph").checked) drawGraph(f); }
  $("title").textContent = f.used ? `Battle ${f.battle} / ${f.numBattles}   Turn ${f.turn}` : "";
  $("status").textContent = f.done ? "Finished" : `Battle ${f.battle} / ${f.numBattles} · turn ${f.turn}`;
  if (f.done) { finished = true; stopGame(); $("status").textContent = "Finished"; return; }
  if (!running || paused) return;
  if (!$("show").checked) setTimeout(pump, 0);
  else if (f.ended) setTimeout(pump, 1200);   // let the final state of a battle be seen
  else requestAnimationFrame(pump);
}

function appendOut(s) {
  outText = (outText + s).replace(/[^\n]*\r/g, "");
  const pre = $("out");
  const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
  pre.textContent = outText;
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}

// --- Drawing ---------------------------------------------------------------------

function drawMap(f) {
  const c = $("map");
  if (c.width !== f.W || c.height !== f.H) {
    c.width = f.W; c.height = f.H;
    // Largest whole-pixel zoom that fits, until the user picks a zoom.
    if (zoomAuto) zoom = Math.max(1, Math.min(8, Math.floor(Math.min(560 / f.W, (innerHeight * 0.7) / f.H))));
    applyZoom();
  }
  c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(f.pixels), f.W, f.H), 0, 0);
}

function applyZoom() {
  const c = $("map");
  c.style.width = `${c.width * zoom}px`;
  c.style.height = `${c.height * zoom}px`;
  $("zoomLabel").textContent = `${zoom}×`;
}
$("zoomIn").onclick = () => { zoomAuto = false; zoom = Math.min(8, zoom + 1); applyZoom(); };
$("zoomOut").onclick = () => { zoomAuto = false; zoom = Math.max(1, zoom - 1); applyZoom(); };

// Team stats as in the original viewer: name, bases, ants, territory, and a
// bar of territory (dark), bases x 75 (white) and ants (team colour), with a
// scale every 100 and the red win line.
function drawStats(f) {
  const c = $("stats"), ctx = c.getContext("2d");
  const rowH = 16, n = f.slots.length;
  const h = Math.max(1, n) * rowH + 4;
  if (c.height !== h) c.height = h;
  const W = c.width, barStart = 236, barW = W - barStart - 6;
  const U = f.used;
  let maxValue = 0, maxTerri = barW;
  for (const s of f.slots) {
    maxValue = Math.max(maxValue, s.bases * 75 + s.ants);
    maxTerri = Math.max(maxTerri, Math.floor(s.squares / U.NewFoodSpace));
  }
  maxTerri = Math.max(maxTerri, maxValue);
  const winPct = f.turn >= U.HalfTimeTurn ? U.HalfTimePercent : U.WinPercent;
  const winline = Math.floor(maxValue * 100 / winPct) - maxValue;
  const sx = (v) => Math.floor(v * barW / maxTerri);

  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, h);
  for (let x = 100; x < maxTerri; x += 100) {
    ctx.fillStyle = x % 1000 === 0 ? "#878787" : "#575757";
    ctx.fillRect(barStart + sx(x), 0, 1, h);
  }
  ctx.fillStyle = "#ff3030";
  ctx.fillRect(barStart + sx(winline), 0, 2, h);

  ctx.font = "12px " + getComputedStyle(document.body).getPropertyValue("--mono");
  ctx.textBaseline = "middle";
  f.slots.forEach((s, i) => {
    const y = 2 + i * rowH, mid = y + rowH / 2;
    const base = s.bases * 75, area = Math.floor(s.squares / U.NewFoodSpace);
    ctx.fillStyle = rgb(s.color, 0.25); ctx.fillRect(barStart, y + 4, sx(area), rowH - 8);
    ctx.fillStyle = "#e7e7e7"; ctx.fillRect(barStart, y + 4, sx(base), rowH - 8);
    ctx.fillStyle = rgb(s.color); ctx.fillRect(barStart + sx(base), y + 4, sx(s.ants), rowH - 8);
    ctx.fillStyle = rgb(s.color); ctx.fillText(`${s.letter} ${s.name}`, 2, mid);
    ctx.fillStyle = "#e7e7e7"; ctx.fillText(String(s.bases).padStart(3), 98, mid);
    ctx.fillStyle = rgb(s.color, 0.5, 128); ctx.fillText(String(s.ants).padStart(6), 124, mid);
    ctx.fillStyle = rgb(s.color); ctx.fillText(String(s.squares).padStart(6), 176, mid);
  });
}

// Timeline of ants + 75 x bases per team, plus the win line, as in the
// original's graph window. Rescales in steps of 1000 turns / 1000 points.
function drawGraph(f) {
  const c = $("graph"), ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  const turns = graphWin.length;
  let maxV = 0;
  for (const a of graphData) for (const v of a) if (v > maxV) maxV = v;
  const gTurns = Math.max(1000, Math.ceil(turns / 1000) * 1000);
  const gAnts = Math.max(1000, Math.ceil((maxV + 1) / 1000) * 1000);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  for (let i = 1; i < gTurns / 100; i++) {
    ctx.fillStyle = i % 10 === 0 ? "#878787" : "#3f3f3f";
    ctx.fillRect(Math.floor(i * 100 * W / gTurns), 0, 1, H);
  }
  for (let i = 1; i < gAnts / 100; i++) {
    ctx.fillStyle = i % 10 === 0 ? "#878787" : "#3f3f3f";
    ctx.fillRect(0, H - Math.floor(i * 100 * H / gAnts), W, 1);
  }
  const series = [graphWin, ...graphData];
  const colors = ["win", ...f.slots.map((s) => rgb(s.color))];
  for (let x = 0; x < W; x++) {
    const t0 = Math.floor(x * gTurns / W), t1 = Math.min(turns - 1, Math.floor((x + 1) * gTurns / W));
    if (t0 >= turns) break;
    series.forEach((arr, k) => {
      let lo = Infinity, hi = -Infinity;
      for (let t = t0; t <= t1; t++) { const v = arr[t]; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (lo === Infinity) return;
      ctx.fillStyle = k === 0 ? ((x & 8) ? "#ff3030" : "#575757") : colors[k];
      const yTop = H - Math.floor(hi * H / gAnts), yBot = H - Math.floor(lo * H / gAnts);
      ctx.fillRect(x, yTop, 1, yBot - yTop + 1);
    });
  }
  ctx.fillStyle = "#8a929c"; ctx.font = "11px sans-serif"; ctx.textBaseline = "top";
  ctx.fillText(`${gTurns} turns · ${gAnts} points`, 6, 4);
}

// --- Options, keys, hover ---------------------------------------------------------

$("speed").oninput = () => { const s = SPEEDS[+$("speed").value]; $("speedLabel").textContent = s ? `${s} turns/frame` : "max"; };
$("speed").oninput();
$("show").onchange = () => { $("viewer").classList.toggle("hidden", !$("show").checked); };
$("optGraph").onchange = () => { $("graph").classList.toggle("hidden", !$("optGraph").checked); };
const sendOptions = () => worker.postMessage({ type: "options", options: { territory: $("optTerritory").checked, ants: $("optAnts").checked } });
$("optTerritory").onchange = sendOptions;
$("optAnts").onchange = sendOptions;

function sendCmd(code) { if (running) worker.postMessage({ type: "cmd", code }); }
document.querySelectorAll("[data-cmd]").forEach((b) => { b.onclick = () => sendCmd(+b.dataset.cmd); });
document.addEventListener("keydown", (e) => {
  if ((e.target.tagName === "INPUT" && e.target.type === "text") || e.target.tagName === "TEXTAREA") return;
  const k = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, Escape: 3 }[e.key];
  if (k && running) { e.preventDefault(); sendCmd(k); }
});

let hoverPending = false;
$("map").addEventListener("mousemove", (e) => {
  if (hoverPending || !lastFrame) return;
  const r = e.target.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / zoom), y = Math.floor((e.clientY - r.top) / zoom);
  hoverPending = true;
  worker.postMessage({ type: "probe", x, y });
});
function onProbe(m) {
  hoverPending = false;
  $("hover").textContent = `(${m.x},${m.y})  ants ${m.ants}  food ${m.food}${m.base ? "  BASE" : ""}${m.team ? `  team ${m.letter} ${m.team}` : ""}`;
}

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
    return `<li><span class="name">${j.id}</span>${builtin ? '<span class="tag hint">example</span>' : ""}
      ${err ? '<span class="err" title="' + err.replace(/"/g, "&quot;") + '">error</span>' : ""}
      <button data-edit="${j.id}">Edit</button></li>`;
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
  if (!id.endsWith(".js") || ants.some((a) => a.id === id && !a.js)) { showEditorMsg(`The name ${id} is taken`, false); return; }
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
    showEditorMsg(`OK: ${info.id}, brain ${info.memSize} bytes. Add it to the teams to play it.`, true);
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

// --- Live statistics, standings and final ratings ---------------------------------

let teamInfo = [];   // [{name, color, memSize}] by team number - 1
const pct1 = (num, den) => (den ? (100 * num / den).toFixed(1) : "0.0");
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const swatch = (c) => `<span class="sw" style="background:${hex(c)}"></span>`;

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

function renderProgress(done, total, how) {
  const secs = (performance.now() - startTime) / 1000;
  const rate = done / Math.max(secs, 0.001);
  const eta = rate > 0 && done < total ? (total - done) / rate : 0;
  const fmt = (t) => t >= 3600 ? `${Math.floor(t / 3600)}h ${Math.floor(t % 3600 / 60)}m` : t >= 60 ? `${Math.floor(t / 60)}m ${Math.floor(t % 60)}s` : `${Math.floor(t)}s`;
  $("progress").textContent = `${done} / ${total} battles · ${fmt(secs)} elapsed` +
    (eta ? ` · about ${fmt(eta)} left` : "") + (turnsSeen && !par ? ` · ${Math.round(turnsSeen / secs)} turns/s` : "") + ` · ${how}`;
}

// The current battle, one row per team.
function renderBattleTable(f) {
  const totalScore = f.slots.reduce((n, s) => n + s.ants + 75 * s.bases, 0) || 1;
  const rows = f.slots.map((s) => {
    const score = s.ants + 75 * s.bases;
    return `<tr><td>${swatch(s.color)}${s.letter} ${esc(s.name)}</td><td>${score}</td><td>${pct1(score, totalScore)}%</td>
      <td>${s.ants}</td><td>${s.bases}</td><td>${s.built - 1}</td><td>${s.born}</td><td>${s.kill}</td><td>${s.killed}</td>
      <td>${pct1(s.kill, s.kill + s.killed)}%</td><td>${s.squares}</td><td>${s.nsPerCall || "–"}</td></tr>`;
  }).join("");
  const U = f.used;
  $("battleTable").innerHTML = `<caption>Battle ${f.battle}: ${U.MapWidth}×${U.MapHeight}, ${U.StartAnts} start ants, food space ${U.NewFoodSpace}, piles ${U.NewFoodMin}–${U.NewFoodMin + U.NewFoodDiff} · turn ${f.turn} · ${f.numAnts} ants, ${f.numFood} food on the map</caption>
    <tr><th>Team</th><th title="ants + 75 × bases">Score</th><th title="share of all scores; ${U.WinPercent}% wins (${U.HalfTimePercent}% after turn ${U.HalfTimeTurn})">Share</th><th>Ants</th><th>Bases</th><th title="bases built this battle">Built</th><th>Born</th><th>Kills</th><th>Deaths</th><th title="kills / (kills + deaths)">Comb</th><th title="squares owned">Territory</th><th title="ns per ant call (sampled)">ns/call</th></tr>${rows}`;
}

// Tournament standings so far, by win rate.
function renderStandings(totals) {
  if (!totals || !teamInfo.length) return;
  const rows = totals.map((t, i) => ({ ...t, i })).filter((t) => t.battles > 0)
    .sort((a, b) => (b.won / b.battles - a.won / a.battles) || b.won - a.won);
  $("standTable").innerHTML = `<tr><th>#</th><th>Team</th><th>Battles</th><th>Won</th><th>Vict</th><th title="bases built per battle (incl. the start base)">Bases</th><th title="ants born per battle">Ants</th><th>Comb</th></tr>` +
    rows.map((t, k) => `<tr><td>${k + 1}</td><td>${swatch(teamInfo[t.i].color)}${String.fromCharCode(65 + t.i)} ${esc(teamInfo[t.i].name)}</td><td>${t.battles}</td><td>${t.won}</td>
      <td>${pct1(t.won, t.battles)}%</td><td>${(t.basesBuilt / t.battles).toFixed(1)}</td><td>${Math.round(t.born / t.battles)}</td><td>${pct1(t.kill, t.kill + t.killed)}%</td></tr>`).join("");
}

// The original final table, sortable. Values in tenths are shown as such.
const RESULT_COLS = [
  ["name", "Team"], ["battles", "Battles"], ["won", "Won"], ["bases", "Bases", 10], ["ants", "Ants"], ["size", "Size"],
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
  $("resultTable").innerHTML = `<tr><th>#</th>${RESULT_COLS.map((c) => `<th data-sort="${c[0]}" class="${c[0] === resultSort ? "sorted" : ""}">${c[1]}</th>`).join("")}</tr>` +
    teamsOnly.map((r, k) => `<tr><td>${k + 1}</td>${RESULT_COLS.map((c) => `<td>${cell(r, c)}</td>`).join("")}</tr>`).join("") +
    (total ? `<tr class="total"><td></td>${RESULT_COLS.map((c) => `<td>${cell(total, c)}</td>`).join("")}</tr>` : "");
  $("resultsBox").classList.remove("hidden");
}
$("resultTable").addEventListener("click", (e) => {
  const th = e.target.closest("th[data-sort]");
  if (th) { resultSort = th.dataset.sort; renderResults(resultRows); }
});
