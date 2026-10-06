// Command-line MyreKrig using the JS engine, with the original's arguments.
//
//   ./mk b5 B10 n1000 s1                 all ants, as the original "mk"
//   ./mk --ants Legions,SkyNET n100 s1   only these ants, in this order
//   ./mk -j4 b5 B10 n1000 s1             4 battles at a time (see --help)
//   ./mk --list                          the ants and their team numbers
//   node tools/mk.mjs Legions SkyNET -- n10 s12345   (older form, still works)
//
// Ants are WebAssembly modules from .cache/wasm (built on demand).
// Environment: MK_TRACE=<file> writes the turn-by-turn trace (see trace.js),
// MK_TRACE_EVERY=<n> only every n-th turn. MK_PRINT=1 shows ant printf output.

import { readFileSync, openSync, writeSync, closeSync } from "node:fs";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Game, defaultArgs, parseArgs } from "../engine/engine.js";
import { loadWasmAnt } from "../engine/wasm-ant.js";
import { compileJsAnt } from "../engine/js-ant.js";
import { existsSync } from "node:fs";
import { traceLine, dumpState } from "../engine/trace.js";
import { buildAnts, antSources } from "./build-ants.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// C ants by name (compiled to WebAssembly on demand); JavaScript ants by
// file name ending in .js (looked up in ants/js, or a path).
export function loadAnts(names, options = {}) {
  const report = buildAnts(names.filter((n) => !n.endsWith(".js")));
  const failed = report.filter((r) => !r.ok);
  if (failed.length) throw new Error(`Could not build: ${failed.map((r) => `${r.name} (${r.error})`).join(", ")}`);
  return names.map((n) => {
    if (n.endsWith(".js")) {
      const file = existsSync(join(ROOT, "ants", "js", n)) ? join(ROOT, "ants", "js", n) : n;
      return compileJsAnt(readFileSync(file, "utf8"));
    }
    return loadWasmAnt(readFileSync(join(ROOT, ".cache", "wasm", `${n}.wasm`)), options);
  });
}

// All C ants (historic ones and those in ants/c), sorted by name. This order
// gives the team numbers (A = 1, B = 2, ...) used by z<team>.
export function allAntNames() {
  return [...antSources().keys()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

const HELP = `MyreKrig command line (JS engine, rules of MyreKrig 2.4.7)

Usage: mk [options] [parameters]

Parameters (as the original; lower case sets min and max, upper case only max):
  w/W MapWidth      h/H MapHeight     a/A StartAnts      f/F NewFoodSpace
  m/M NewFoodMin    d/D NewFoodDiff   t/T HalfTimeTurn   o/O TimeOutTurn
  p/P WinPercent    e/E HalfTimePercent                  b/B BattleSize
  n NumBattles      s RandomSeed      z WatchTeam (only battles with team z)

Options:
  --ants A,B,C   play these ants, in this order (default: all ants)
  --all          all ants (the default)
  --list         list all ants with their team numbers and brain sizes
  -j N           run N battles at a time (default 1). Results are identical to
                 one at a time, except in rare cases for ants that read past
                 their brains (Inkal), which see leftovers of other battles.
  -h, --help     this text

Example: mk b5 B10 n1000 s1     1000 battles, 5-10 teams each, seed 1
`;

// Runs battles i with i % jobs === job and reports each battle's output.
function workerMain() {
  const { names, argv, jobs, job } = workerData;
  const teams = loadAnts(names);
  let cur = "";
  const game = new Game(teams, parseArgs(defaultArgs(), argv), {
    noHeader: true,
    noResult: true,
    only: (i) => i % jobs === job,
    out: (s) => { cur += s; },
    warn: (m) => parentPort.postMessage({ warn: m }),
    afterBattle: (g) => { parentPort.postMessage({ index: g.BattleCount, text: cur }); cur = ""; },
    battleSkipped: (g) => { parentPort.postMessage({ index: g.BattleCount, text: "" }); },
  });
  game.run();
  parentPort.postMessage({ done: true, totals: game.totals });
}

function parseCommandLine(argv) {
  const o = { names: null, params: [], jobs: 1, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--list") o.list = true;
    else if (a === "--all") o.names = null;
    else if (a === "--ants") o.names = argv[++i].split(",").filter(Boolean);
    else if (a.startsWith("--ants=")) o.names = a.slice(7).split(",").filter(Boolean);
    else if (a === "-j") o.jobs = Number(argv[++i]);
    else if (/^-j\d+$/.test(a)) o.jobs = Number(a.slice(2));
    else if (a.startsWith("-")) throw new Error(`Unknown option ${a} (see mk --help)`);
    else o.params.push(a);
  }
  if (!(o.jobs >= 1)) throw new Error("-j needs a number of at least 1");
  return o;
}

async function runParallel(names, params, jobs) {
  const teams = loadAnts(names);
  // The header and the final table come from the main process; battles from
  // the workers, printed in battle order as they finish.
  const main = new Game(teams, parseArgs(defaultArgs(), params), { out: (s) => process.stdout.write(s) });
  main.printGameBegin();
  const total = main.args.NumBattles;
  const texts = new Map();
  let next = 0;
  const flush = () => { while (texts.has(next)) { process.stdout.write(texts.get(next)); texts.delete(next); next++; } };
  const totals = [];
  await Promise.all(Array.from({ length: Math.min(jobs, Math.max(1, total)) }, (_, job) => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { names, argv: params, jobs, job } });
    w.on("message", (m) => {
      if (m.warn) process.stderr.write(`warning: ${m.warn}\n`);
      else if (m.done) { totals.push(m.totals); resolve(); }
      else { texts.set(m.index, m.text); flush(); }
    });
    w.on("error", reject);
  })));
  flush();
  // Merge the per-worker totals (the original sums in 32-bit, so wrap).
  const merged = main.totals;
  for (const t of totals) {
    t.forEach((g, i) => {
      for (const k of Object.keys(g)) merged[i][k] = k === "TimeUsed" ? merged[i][k] + g[k] : (merged[i][k] + g[k]) >>> 0;
    });
  }
  main.BattleCount = total;
  main.printGameResult();
}

if (!isMainThread) {
  workerMain();
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf("--");
  let names, params, jobs = 1;
  if (sep >= 0) {
    names = argv.slice(0, sep);
    params = argv.slice(sep + 1);
  } else {
    let o;
    try { o = parseCommandLine(argv); } catch (e) { console.error(e.message); process.exit(2); }
    if (o.help) { process.stdout.write(HELP); process.exit(0); }
    names = o.names || allAntNames();
    params = o.params;
    jobs = o.jobs;
    if (o.list) {
      const teams = loadAnts(names);
      const g = new Game(teams, defaultArgs(), {});
      for (let t = 1; t <= g.NumTeams; t++) {
        console.log(`${String(t).padStart(3)}  ${String.fromCharCode(64 + t)}  ${names[t - 1].padEnd(12)} ${g.team[t].name.padEnd(10)} ${String(g.team[t].memSize).padStart(4)} bytes`);
      }
      process.exit(0);
    }
  }
  try { parseArgs(defaultArgs(), params); } catch (e) { console.error(`${e.message} (see mk --help)`); process.exit(2); }

  if (jobs > 1) {
    await runParallel(names, params, Math.min(jobs, availableParallelism() * 2));
  } else {
    const print = process.env.MK_PRINT ? (fd, s) => process.stderr.write(s) : null;
    const teams = loadAnts(names, { print });
    const args = parseArgs(defaultArgs(), params);

    const traceFile = process.env.MK_TRACE ? openSync(process.env.MK_TRACE, "w") : null;
    const every = Number(process.env.MK_TRACE_EVERY || 1);
    let pending = "";
    const hooks = {
      out: (s) => process.stdout.write(s),
      warn: (m) => process.stderr.write(`warning: ${m}\n`),
    };
    const [dumpBattle, dumpTurn] = (process.env.MK_DUMP || "-1:0").split(":").map(Number);
    if (traceFile !== null || dumpBattle >= 0) {
      hooks.drawMap = (g) => {
        if (g.BattleCount + 1 === dumpBattle && g.CurrentTurn === dumpTurn) process.stdout.write(dumpState(g));
        if (traceFile === null) return;
        if (every && g.CurrentTurn % every === 0) {
          pending += traceLine(g);
          if (pending.length > 1 << 16) { writeSync(traceFile, pending); pending = ""; }
        }
      };
    }
    new Game(teams, args, hooks).run();
    if (traceFile !== null) { writeSync(traceFile, pending); closeSync(traceFile); }
  }
}
