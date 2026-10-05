// JS ant test: a line-by-line JavaScript port must play exactly like the
// compiled C original (same output and the same turn-by-turn checksums).
//
//   node tests/js-ants.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Game, defaultArgs, parseArgs } from "../engine/engine.js";
import { loadWasmAnt } from "../engine/wasm-ant.js";
import { compileJsAnt, brainLayout } from "../engine/js-ant.js";
import { traceLine } from "../engine/trace.js";
import { buildAnts } from "../tools/build-ants.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) failures++; };

// Brain layout follows C struct rules.
{
  const l = brainLayout([["rnd", "u32"], ["x", "i16"], ["y", "i16"], ["a", "i8"], ["b", "i8"], ["c", "i8"]]);
  check(l.size === 12 && l.fields[2].offset === 6 && l.fields[5].offset === 10, "layout: u32,i16,i16,i8,i8,i8 = 12 bytes");
  const l2 = brainLayout([["a", "u8"], ["b", "i32"], ["c", "u8", 3]]);
  check(l2.size === 12 && l2.fields[1].offset === 4 && l2.fields[2].offset === 8, "layout: padding before i32, array, tail padding");
  check(brainLayout([]).size === 0, "layout: empty brain = 0 bytes");
}

buildAnts(["Probe", "Rambo", "Legions", "SkyNET"]);
const wasm = (n) => loadWasmAnt(readFileSync(join(ROOT, ".cache", "wasm", `${n}.wasm`)));
const js = (n) => compileJsAnt(readFileSync(join(ROOT, "ants", "js", `${n}.js`), "utf8"));

function play(teams, argv) {
  let out = "", trace = "";
  new Game(teams, parseArgs(defaultArgs(), argv), {
    out: (s) => { out += s; },
    drawMap: (g) => { trace += traceLine(g); },
  }).run();
  // Time and Perf are measurements; mask them.
  out = out.split("\n").map((l) => (l.length >= 79 && l.endsWith("%") ? l.slice(0, 51) + l.slice(58, 65) + l.slice(72) : l)).join("\n");
  return { out, trace };
}

for (const name of ["Rambo", "Probe"]) {
  check(js(name).memSize === wasm(name).memSize, `${name}: brain size ${js(name).memSize} bytes in both`);
  for (const [i, opponents] of [["Legions"], ["SkyNET", "Legions"], []].entries()) {
    const argv = ["n3", `s${1000 + i * 77}`];
    const c = play([wasm(name), ...opponents.map(wasm)], argv);
    const j = play([js(name), ...opponents.map(wasm)], argv);
    const turns = c.trace.split("\n").length - 1;
    check(c.out === j.out && c.trace === j.trace, `${name} in JS = ${name} in C, with ${opponents.join(", ") || "no opponents"} (${turns} turns)`);
  }
}

// Reproducibility: Math.random in a JS ant is seeded per battle.
{
  const src = `export default { title: "Rnd", brain: [], step(f, m) { return 1 + Math.floor(Math.random() * 4); } };`;
  const a = play([compileJsAnt(src), wasm("Rambo")], ["n2", "s5"]);
  const b = play([compileJsAnt(src), wasm("Rambo")], ["n2", "s5"]);
  check(a.out === b.out && a.trace === b.trace, "Math.random in a JS ant is reproducible");
}

console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
