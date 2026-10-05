// Command-line MyreKrig using the JS engine, with the original's arguments.
//
//   node tools/mk.mjs Legions SkyNET Rambo -- n10 s12345 b2
//
// Ants are WebAssembly modules from .cache/wasm (built on demand).
// Environment: MK_TRACE=<file> writes the turn-by-turn trace (see trace.js),
// MK_TRACE_EVERY=<n> only every n-th turn. MK_PRINT=1 shows ant printf output.

import { readFileSync, openSync, writeSync, closeSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Game, defaultArgs, parseArgs } from "../engine/engine.js";
import { loadWasmAnt } from "../engine/wasm-ant.js";
import { traceLine, dumpState } from "../engine/trace.js";
import { buildAnts } from "./build-ants.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadAnts(names, options = {}) {
  const report = buildAnts(names);
  const failed = report.filter((r) => !r.ok);
  if (failed.length) throw new Error(`Could not build: ${failed.map((r) => `${r.name} (${r.error})`).join(", ")}`);
  return names.map((n) => loadWasmAnt(readFileSync(join(ROOT, ".cache", "wasm", `${n}.wasm`)), options));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf("--");
  const names = sep >= 0 ? argv.slice(0, sep) : argv;
  const gameArgs = sep >= 0 ? argv.slice(sep + 1) : [];

  const print = process.env.MK_PRINT ? (fd, s) => process.stderr.write(s) : null;
  const teams = loadAnts(names, { print });
  const args = parseArgs(defaultArgs(), gameArgs);

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
