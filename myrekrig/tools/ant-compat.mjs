// Mechanical source fixes so 2002-2003 era ant sources compile with modern
// compilers and behave the same in every build. Used by both the reference
// (native) build and the WebAssembly build, so both compile the same code.
// Line numbers are preserved.
//
// CLI: node ant-compat.mjs <in.c> <out.c>

import { readFileSync, writeFileSync } from "node:fs";

export function patchAntSource(text) {
  text = text
    // Old GCC accepted a `static` definition after an implicit (undeclared)
    // call. Modern compilers reject it. Dropping `static` keeps the meaning;
    // the native build localizes all ant symbols anyway (see build-ref.sh).
    .replace(/^([ \t]*)(?:inline[ \t]+static|static[ \t]+inline)[ \t]+/gm, "$1inline ")
    // Old GCC "cast as lvalue" extension: `(unsigned int)i>>=1;`
    .replace(/\(unsigned int\)(\w+)\s*>>=\s*1;/g, "$1 = (unsigned int)$1 >> 1;");
  return addFallOffReturns(text);
}

// A non-void function that reaches its closing brace without `return`
// returns whatever happens to be in a register; the value differs between
// compilers (SPEC §4.3). Make it well-defined: insert `return 0;` before the
// closing brace of every non-void function body. Where the function already
// returns on every path, the extra statement is never reached.
function addFallOffReturns(src) {
  const inserts = [];
  let depth = 0, i = 0, lastSig = "", topStart = 0, bodyStart = -1, nonVoid = false;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    // Preprocessor lines (with continuations) at the start of a line.
    if (c === "#" && /(^|\n)[ \t]*$/.test(src.slice(Math.max(0, i - 80), i))) {
      while (i < n && src[i] !== "\n") { if (src[i] === "\\" && src[i + 1] === "\n") i++; i++; }
      if (depth === 0) topStart = i;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c) { if (src[i] === "\\") i++; i++; }
      i++; lastSig = c; continue;
    }
    if (c === "{") {
      if (depth === 0 && lastSig === ")") {
        bodyStart = i;
        nonVoid = returnsValue(src.slice(topStart, i));
      }
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        if (bodyStart >= 0 && nonVoid) inserts.push(i);
        bodyStart = -1;
        topStart = i + 1;
      }
    } else if (c === ";" && depth === 0) {
      topStart = i + 1;
    }
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  let out = "", prev = 0;
  for (const pos of inserts) { out += src.slice(prev, pos) + " return 0; "; prev = pos; }
  return out + src.slice(prev);
}

// Decides from a function header (everything before the body) whether the
// function returns a value: anything but plain `void name(...)`.
function returnsValue(header) {
  header = header.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const paren = header.indexOf("(");
  if (paren < 0) return false;
  const before = header.slice(0, paren).replace(/\s+/g, " ").trim();
  const words = before.split(/[^\w*]+/).filter(Boolean);
  if (words.length < 2) return true; // implicit int (old C): `name(...)`
  const type = words.slice(0, -1).join(" ");
  if (/\bvoid\b/.test(type) && !/\*/.test(before)) return false;
  if (/\b(struct|union)\b/.test(type) && !/\*/.test(before)) return false;
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , input, output] = process.argv;
  writeFileSync(output, patchAntSource(readFileSync(input, "latin1")), "latin1");
}
