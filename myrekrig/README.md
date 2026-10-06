# MyreKrig JS

A re-creation of MyreKrig, the Danish ant-programming game by Aske Simon Christensen
(1998–2003), as a JavaScript engine that can run the original C ants compiled to WebAssembly.
See [SPEC.md](SPEC.md) for the rules and design.

**Status:** proof of concept. Engine verified against the original engine; browser app with
battle viewer, tournament runner and JavaScript ants.

**To play:** run `node tools/build-html.mjs` and open `dist/myrekrig.html` in Chrome. It is one
self-contained file and works offline.

## Layout

| Path | What |
|---|---|
| `engine/engine.js` | The game engine (rules, random numbers, output) |
| `engine/wasm-ant.js` | Loads a C ant compiled to WebAssembly |
| `engine/js-ant.js` | JavaScript ants: brain layout, seeded `Math.random` |
| `engine/trace.js` | Turn-by-turn state checksum and state dump, for comparison |
| `ants/c/` | Legions, SkyNET and Rambo (by Jørn Holm); Kompas (by Claude, a competitive ant); Probe (example) |
| `ants/js/` | Rambo and Probe ported to JavaScript (they play identically to the C versions) |
| `ui/` | Browser app: page, viewer, worker |
| `tools/build-html.mjs` | Bundles everything into `dist/myrekrig.html` |
| `tools/build-ants.mjs` | Compiles C ants to WebAssembly (`.cache/wasm/`) |
| `tools/ant-compat.mjs` | Mechanical fixes for 2003-era sources (SPEC §4.3) |
| `tools/wasm/` | The `Myre.h` and minimal C library used for WebAssembly ants |
| `tools/mk.mjs` | Command-line game using the JS engine |
| `tools/reference/` | Builds the original engine (32-bit) with a trace module |
| `tests/compare.mjs` | Runs both engines and compares them |
| `tests/js-ants.mjs` | JS ports must play identically to their C originals |
| `tests/browser.mjs` | Opens the built app in headless Chromium and checks it against the CLI |

The other historic ants and the original engine are not stored here. They are fetched from the
public [2011 repository](https://github.com/einar-io/Myrekrig-2011) into `.cache/` when needed.

## Running

Requirements: Node 18+, `clang` with the wasm32 target and `wasm-ld`, and for the reference
build `gcc` with 32-bit support (`gcc-multilib`).

### Command line, like the original `mk`

```sh
./mk b5 B10 n1000 s1          # 1000 battles, 5-10 teams each, seed 1, all ants
./mk -j4 b5 B10 n1000 s1      # the same on 4 cores
./mk z12 b5 B10 n1000 s1      # only the battles with team 12 (see --list)
./mk --ants Legions,SkyNET,Kompas n100 s7
./mk --list                   # all ants with team numbers
./mk --help
```

The parameters are the original's: lower case sets min and max, upper case only max (`b5 B10` =
5 to 10 teams per battle). Without `--ants`, all C ants play, sorted by name; that order gives
the team letters and the numbers for `z`. The output is the original's: header, one line per
battle, and the final table (Bases, Ants, Size, Ages, Comb, Time, Vict, Perf, Pres).

`-j N` runs N battles at a time. The output is identical to running them one at a time, except
in rare cases for ants that read past their own brains (Inkal), because in the original those see
leftovers from the previous battle.

### Browser app

`node tools/build-html.mjs`, then open `dist/myrekrig.html`. The setup line takes the same
command (`mk --all b5 B10 n1000 s1`) and gives the same results as the terminal. Untick
"Show battles" to run without display; "All cores" then runs battles in parallel.

### Tests

```sh
node tests/compare.mjs --quick   # JS engine vs the original C engine, turn by turn
node tests/compare.mjs           # the full matrix (about 230 setups)
node tests/js-ants.mjs           # JS ports play identically to their C originals
node tests/browser.mjs           # the built app in headless Chromium vs the command line
```
