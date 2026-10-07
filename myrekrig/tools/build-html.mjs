// Builds the single-file browser app Ants51: dist/ants51.html.
//
//   node tools/build-html.mjs              all ants (for your private use)
//   node tools/build-html.mjs --own-only   only ants/c (publishable, SPEC §10)
//
// Everything is inlined (engine, worker, app, design tokens, icons, ants as
// base64 WebAssembly), so the file works when opened straight from disk,
// offline.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAnts } from "./build-ants.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ownOnly = process.argv.includes("--own-only");
const outFile = join(ROOT, "dist", ownOnly ? "ants51-own.html" : "ants51.html");

// Turns an ES module into plain script text (the engine has no imports).
const unmodule = (src) => src.replace(/^import .*$/gm, "").replace(/^export (default )?/gm, "");
const noScriptEnd = (s) => s.replace(/<\/script/gi, "<\\/script");

const report = buildAnts([]).filter((r) => r.ok && (!ownOnly || r.own));
const ants = report.map((r) => ({ name: r.name, wasm: readFileSync(r.wasm).toString("base64") }));

// JS ants shipped with the app (ants/js/*.js) are embedded as source.
const jsAnts = readdirSync(join(ROOT, "ants", "js")).filter((f) => f.endsWith(".js")).sort()
  .map((f) => ({ id: f, source: readFileSync(join(ROOT, "ants", "js", f), "utf8") }));

const worker = [
  unmodule(readFileSync(join(ROOT, "engine", "engine.js"), "utf8")),
  unmodule(readFileSync(join(ROOT, "engine", "wasm-ant.js"), "utf8")),
  unmodule(readFileSync(join(ROOT, "engine", "js-ant.js"), "utf8")),
  readFileSync(join(ROOT, "ui", "worker.js"), "utf8"),
].join("\n");

const ui = (...p) => readFileSync(join(ROOT, "ui", ...p), "utf8");
// The icon sprite's symbols; the page wraps them in its own hidden <svg>.
const icons = ui("assets", "icons.svg").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

const html = ui("app.html")
  .replace("{{TOKENS}}", () => ui("assets", "tokens.css"))
  .replace("{{MOTION}}", () => ui("assets", "motion.css"))
  .replace("{{STYLE}}", () => ui("app.css"))
  .replace("{{ICONS}}", () => icons)
  .replace("{{ANTS}}", () => noScriptEnd(JSON.stringify({ wasm: ants, js: jsAnts })))
  .replace("{{WORKER}}", () => noScriptEnd(worker))
  .replace("{{APP}}", () => noScriptEnd(readFileSync(join(ROOT, "ui", "app.js"), "utf8")));

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`${outFile}: ${ants.length} C ants, ${jsAnts.length} JS ants, ${(html.length / 1024).toFixed(0)} KB`);
