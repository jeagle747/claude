// Browser test: opens dist/myrekrig.html from disk in headless Chromium, runs
// a game from a setup line, and checks the result text is identical to the
// command-line engine (apart from the measured Time/Perf columns). Also
// takes a screenshot of a battle being shown.
//
//   node tests/browser.mjs            (after node tools/build-html.mjs)

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"))); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = pathToFileURL(join(ROOT, "dist", "myrekrig.html")).href;
const line = process.argv[2] || "Legions SkyNET Rambo -- n3 s12345";

const mask = (out) => out.split("\n").map((l) =>
  /^\S.{50,}%$/.test(l) && l.length >= 79 ? l.slice(0, 51) + "#######" + l.slice(58, 65) + "#######" + l.slice(72) : l,
).join("\n").trim();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(html);
await page.waitForFunction(() => /ants loaded/.test(document.getElementById("status").textContent), null, { timeout: 30000 });
console.log(await page.textContent("#status"));

// 1. Fast run without drawing, compared with the command line.
await page.fill("#setupLine", line);
await page.click("#applyLine");
await page.uncheck("#show");
const t0 = Date.now();
await page.click("#startBtn");
await page.waitForFunction(() => document.getElementById("status").textContent === "Finished", null, { timeout: 600000 });
const browserOut = await page.textContent("#out");
console.log(`browser run: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const [names, args] = line.split("--").map((s) => s.trim().split(/\s+/).filter(Boolean));
const cliOut = execFileSync("node", [join(ROOT, "tools", "mk.mjs"), ...names, "--", ...args]).toString();
const same = mask(browserOut) === mask(cliOut);
console.log(same ? "browser output identical to command line (except Time/Perf)" : "DIFFERENT from command line");
if (!same) { console.log("--- browser\n" + browserOut + "\n--- cli\n" + cliOut); }

// 2. A JS ant in the browser equals the same JS ant on the command line.
await page.fill("#setupLine", "Probe.js Legions Rambo.js -- n2 s7");
await page.click("#applyLine");
await page.click("#startBtn");
await page.waitForFunction(() => document.getElementById("status").textContent === "Finished" &&
  document.getElementById("out").textContent.includes("Tot./Aver."), null, { timeout: 600000 });
const jsBrowser = await page.textContent("#out");
const jsCli = execFileSync("node", [join(ROOT, "tools", "mk.mjs"), "Probe.js", "Legions", "Rambo.js", "--", "n2", "s7"]).toString();
const sameJs = mask(jsBrowser) === mask(jsCli);
console.log(sameJs ? "JS ants: browser identical to command line" : "JS ants: DIFFERENT from command line");

// 3. The editor: a new ant from the template compiles.
await page.click("#newJs");
await page.click("#saveJs");
await page.waitForFunction(() => /^OK: MyAnt\.js/.test(document.getElementById("editorMsg").textContent), null, { timeout: 10000 });
console.log(`editor: ${await page.textContent("#editorMsg")}`);
await page.click("#closeJs");

// 4. Watch a battle for a few seconds and take a screenshot.
await page.check("#show");
await page.fill("#setupLine", "Legions SkyNET Rambo -- n5 s99");
await page.click("#applyLine");
await page.fill("#speed", "3");
await page.click("#startBtn");
await page.waitForFunction(() => /turn (\d+)/.test(document.getElementById("status").textContent) &&
  Number(/turn (\d+)/.exec(document.getElementById("status").textContent)[1]) > 400, null, { timeout: 60000 });
await page.click("#pauseBtn");
await page.screenshot({ path: join(ROOT, ".cache", "screenshot.png") });
console.log(`screenshot: .cache/screenshot.png  (${await page.textContent("#status")})`);

if (errors.length) console.log("page errors:\n" + errors.join("\n"));
await browser.close();
process.exit(same && sameJs && !errors.length ? 0 : 1);
