// Compiles C ants to WebAssembly modules for the JS engine.
//
//   node tools/build-ants.mjs            all ants (yours in ants/c + historic)
//   node tools/build-ants.mjs Legions …  only the named ants
//
// Output: .cache/wasm/<Ant>.wasm and .cache/wasm/build-report.json.
// Historic ants are read from the 2011 repository cache that
// tools/reference/build-ref.sh fetches (it is fetched here too if missing).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { patchAntSource } from "./ant-compat.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache");
const REPO = join(CACHE, "Myrekrig-2011");
const COMMIT = "c687ba649bf035e2e228ff9d95925a2dbe722947";
const OUT = join(CACHE, "wasm");
const OBJ = join(CACHE, "wasm-obj");
const WASM_DIR = join(ROOT, "tools", "wasm");

const CFLAGS = [
  "--target=wasm32", "-O2", "-std=gnu89", "-fgnu89-inline", "-fsigned-char", "-DNDEBUG", "-Dmain=mk_ant_main",
  "-nostdlib", "-w", "-I", join(WASM_DIR, "include"),
];
const LDFLAGS = ["-Wl,--no-entry", "-Wl,-z,stack-size=1048576", "-Wl,--strip-debug"];

function ensureRepo() {
  if (!existsSync(REPO)) {
    mkdirSync(CACHE, { recursive: true });
    execFileSync("git", ["clone", "-q", "https://github.com/einar-io/Myrekrig-2011", REPO], { stdio: "inherit" });
  }
  execFileSync("git", ["-C", REPO, "checkout", "-q", COMMIT]);
}

// Your own ants live in ants/c and take precedence over the historic copies.
export function antSources() {
  ensureRepo();
  const map = new Map();
  for (const f of readdirSync(join(REPO, "src", "Racer"))) {
    if (f.endsWith(".c")) map.set(basename(f, ".c"), { file: join(REPO, "src", "Racer", f), own: false });
  }
  const own = join(ROOT, "ants", "c");
  if (existsSync(own)) {
    for (const f of readdirSync(own)) {
      if (f.endsWith(".c")) map.set(basename(f, ".c"), { file: join(own, f), own: true });
    }
  }
  return map;
}

function newer(target, ...sources) {
  if (!existsSync(target)) return false;
  const t = statSync(target).mtimeMs;
  return sources.every((s) => statSync(s).mtimeMs <= t);
}

export function buildAnts(names) {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(OBJ, { recursive: true });
  const sources = antSources();
  if (!names || names.length === 0) names = [...sources.keys()].sort();

  const libSrc = join(WASM_DIR, "libmk.c");
  const libObj = join(OBJ, "libmk.o");
  if (!newer(libObj, libSrc)) {
    execFileSync("clang", [...CFLAGS, "-fno-builtin", "-c", libSrc, "-o", libObj]);
  }

  const headers = readdirSync(join(WASM_DIR, "include")).map((h) => join(WASM_DIR, "include", h));
  const report = [];
  for (const name of names) {
    const src = sources.get(name);
    if (!src) { report.push({ name, ok: false, error: "no such ant" }); continue; }
    const wasm = join(OUT, `${name}.wasm`);
    const compat = join(OBJ, `${name}.c`);
    try {
      if (!newer(wasm, src.file, libObj, join(ROOT, "tools", "ant-compat.mjs"), ...headers)) {
        writeFileSync(compat, patchAntSource(readFileSync(src.file, "latin1")), "latin1");
        execFileSync("clang", [...CFLAGS, ...LDFLAGS, compat, libObj, "-o", wasm], { stdio: "pipe" });
      }
      report.push({ name, ok: true, own: src.own, wasm });
    } catch (e) {
      const msg = String(e.stderr || e.message).split("\n").filter((l) => /error/.test(l)).slice(0, 3).join("\n");
      report.push({ name, ok: false, own: src.own, error: msg });
    }
  }
  writeFileSync(join(OUT, "build-report.json"), JSON.stringify(report, null, 2));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildAnts(process.argv.slice(2));
  for (const r of report) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.ok ? "" : ": " + r.error}`);
  const failed = report.filter((r) => !r.ok).length;
  console.log(`${report.length - failed} built, ${failed} failed`);
}
