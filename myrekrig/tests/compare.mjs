// Compares the JS engine with the original C engine (SPEC §7).
//
//   node tests/compare.mjs              full matrix
//   node tests/compare.mjs --quick      a small subset
//   node tests/compare.mjs --only=solo  one group (solo, pairs, groups, all, edge)
//
// For every configuration both engines run the same ants, seed and
// parameters. Their outputs must be identical except the measured CPU-time
// columns (Time, Perf), and their turn-by-turn state checksums must match.

import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Game, defaultArgs, parseArgs } from "../engine/engine.js";
import { loadWasmAnt } from "../engine/wasm-ant.js";
import { traceLine } from "../engine/trace.js";
import { buildAnts } from "../tools/build-ants.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache");
const WORK = join(CACHE, "compare");
mkdirSync(WORK, { recursive: true });

const flags = process.argv.slice(2);
const quick = flags.includes("--quick");
const only = (flags.find((f) => f.startsWith("--only=")) || "").slice(7);
// --shard=i/n runs every n-th configuration (to use several processes).
// --match=text only runs configurations whose label contains the text.
const match = (flags.find((f) => f.startsWith("--match=")) || "").slice(8);
const [shard, shards] = ((flags.find((f) => f.startsWith("--shard=")) || "--shard=0/1").slice(8)).split("/").map(Number);

// --- Ants -------------------------------------------------------------------

const report = buildAnts([]);
const all = report.filter((r) => r.ok).map((r) => r.name);
const yours = ["Legions", "SkyNET", "Rambo"];
const modules = new Map();
function team(name, out) {
  if (!modules.has(name)) modules.set(name, new WebAssembly.Module(readFileSync(join(CACHE, "wasm", `${name}.wasm`))));
  return loadWasmAnt(modules.get(name), { print: (fd, s) => { if (fd === 1) out(s); } });
}

// Deterministic pseudo-random choices for the matrix itself.
let seed = 4242;
const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
const pick = (list, k) => {
  const c = [...list], r = [];
  while (r.length < k && c.length) r.push(c.splice(rnd(c.length), 1)[0]);
  return r;
};

// --- Matrix -----------------------------------------------------------------

const configs = [];
// Big multi-team maps are checksummed every 25th turn to keep the run short.
const add = (group, ants, args, every = 1) => {
  if (!only || only === group) configs.push({ group, ants, args, every });
};

for (const a of quick ? yours : all) add("solo", [a], ["n2", `s${100 + rnd(100000)}`]);
for (const y of yours) {
  for (const a of quick ? pick(all, 3) : all) if (a !== y) add("pairs", [y, a], ["n2", `s${rnd(1e9)}`]);
}
for (let i = 0; i < (quick ? 2 : 12); i++) {
  const ants = pick(all, 4 + rnd(5));
  if (i % 2 === 0) ants.splice(rnd(ants.length), 1, yours[i % 3]);
  add("groups", [...new Set(ants)], ["n4", `s${rnd(1e9)}`], 25);
}
if (!quick) add("all", all, ["n2", "s20031008"], 25);
add("all", [...yours, ...pick(all.filter((a) => !yours.includes(a)), 7)], ["n3", "b2", "B6", "s777"], 25);
add("edge", yours, ["n3", "w64", "h64", "s1"]);                    // tiny map
// (Legions reads past its xs[50] table with ~194+ ants on a base, so it is left out here.)
add("edge", ["SkyNET", "Rambo"], ["n2", "a250", "s2"]);            // huge start
add("edge", yours, ["n2", "f2", "F3", "w64", "h64", "s3"]);        // lots of food
add("edge", yours, ["n3", "t200", "o400", "e51", "s4"]);           // halftime + timeout
add("edge", yours, ["n3", "p51", "s5"]);                          // easy win
add("edge", yours, ["n4", "b1", "B3", "s6"]);                     // varying battle size
add("edge", ["SkyNET", "Legions", "Rambo"], ["n3", "z2", "s7"]);   // watch team
add("edge", yours, ["n2", "m1", "d0", "s8"]);                     // 1-food piles (m0 d0 hangs, as in the original)

// Ants that store pointers in their brains: the pointer values depend on
// where memory lives, so their brain bytes are left out of the comparison
// (the trace's second checksum). Everything else is still compared.
const POINTER_ANTS = ["NewDesert"];
const withoutBrains = (trace) => trace.replace(/ [0-9a-f]{8} ([0-9a-f]{8})$/gm, " $1");

// --- Running ----------------------------------------------------------------

function runJs(ants, args, every) {
  let out = "", trace = "";
  const teams = ants.map((a) => team(a, (s) => { out += s; }));
  const game = new Game(teams, parseArgs(defaultArgs(), args), {
    out: (s) => { out += s; },
    drawMap: (g) => { if (g.CurrentTurn % every === 0) trace += traceLine(g); },
  });
  game.run();
  return { out, trace };
}

function runRef(ants, args, id, every) {
  const bin = join(WORK, `ref-${id}`);
  execFileSync(join(ROOT, "tools", "reference", "build-ref.sh"), [bin, ...ants], { stdio: "pipe" });
  const traceFile = join(WORK, `ref-${id}.trace`);
  const out = execFileSync(bin, args, {
    env: { ...process.env, MK_TRACE: traceFile, MK_TRACE_EVERY: String(every) },
    maxBuffer: 1 << 30,
    timeout: 20 * 60 * 1000,
  }).toString("latin1");
  return { out, trace: readFileSync(traceFile, "latin1") };
}

// Masks the measured columns (Time, Perf) of the final table.
function mask(out) {
  let inTable = false;
  return out.split("\n").map((line) => {
    if (line.startsWith("Team    Battles")) { inTable = true; return line; }
    if (!inTable || line.length < 79) return line;
    return line.slice(0, 51) + "#######" + line.slice(58, 65) + "#######" + line.slice(72);
  }).join("\n");
}

function firstDiff(a, b) {
  const la = a.split("\n"), lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return { line: i + 1, ref: la[i], js: lb[i] };
  }
  return null;
}

let passed = 0, failed = 0, turns = 0;
const failures = [];
const t0 = Date.now();
for (const [i, c] of configs.entries()) {
  if (i % shards !== shard) continue;
  if (match && !`[${c.group}] ${c.ants.join(",")} ${c.args.join(" ")}`.includes(match)) continue;
  const label = `[${c.group}] ${c.ants.length > 8 ? `${c.ants.length} ants` : c.ants.join(",")} ${c.args.join(" ")}`;
  try {
    const ref = runRef(c.ants, c.args, i, c.every);
    const js = runJs(c.ants, c.args, c.every);
    const dOut = firstDiff(mask(ref.out), mask(js.out));
    const pointers = c.ants.some((a) => POINTER_ANTS.includes(a));
    const dTrace = pointers ? firstDiff(withoutBrains(ref.trace), withoutBrains(js.trace)) : firstDiff(ref.trace, js.trace);
    turns += ref.trace.split("\n").length - 1;
    if (!dOut && !dTrace) {
      passed++;
      process.stdout.write(`ok   ${label}\n`);
    } else {
      failed++;
      const d = dTrace || dOut;
      const what = dTrace ? "trace" : "output";
      failures.push({ label, what, ...d });
      process.stdout.write(`FAIL ${label}\n     first ${what} difference at line ${d.line}:\n       ref: ${d.ref}\n       js:  ${d.js}\n`);
      writeFileSync(join(WORK, `fail-${i}.ref.out`), ref.out);
      writeFileSync(join(WORK, `fail-${i}.js.out`), js.out);
    }
  } catch (e) {
    failed++;
    failures.push({ label, what: "error", error: String(e.message).slice(0, 300) });
    process.stdout.write(`ERR  ${label}\n     ${String(e.message).slice(0, 300)}\n`);
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n${passed} passed, ${failed} failed, ${turns} turns compared, ${secs}s`);
process.exit(failed ? 1 : 0);
