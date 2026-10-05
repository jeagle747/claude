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
| `ants/c/` | Legions, SkyNET and Rambo (by Jørn Holm); Probe (example) |
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

```sh
# A game with the JS engine; the arguments are the original's (n = battles, s = seed, ...)
node tools/mk.mjs Legions SkyNET Rambo -- n10 s12345

# The same game with the original engine
tools/reference/build-ref.sh .cache/mk Legions SkyNET Rambo
MK_TRACE_EVERY=0 .cache/mk n10 s12345

# Compare the two engines (quick subset, or the full matrix)
node tests/compare.mjs --quick
node tests/compare.mjs
```
