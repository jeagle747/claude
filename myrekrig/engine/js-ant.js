// JavaScript ants (SPEC §4.2).
//
// An ant is a module whose default export is
//   { title: "Name#RRGGBB", brain: [[field, type, count?], ...], step(f, m) }
// The brain is stored as raw bytes laid out like the equivalent C struct
// (same alignment and padding), so brain sizes and the random start value
// (§3.9) behave exactly as for C ants.

const TYPES = {
  i8: { size: 1, Arr: Int8Array }, u8: { size: 1, Arr: Uint8Array },
  i16: { size: 2, Arr: Int16Array }, u16: { size: 2, Arr: Uint16Array },
  i32: { size: 4, Arr: Int32Array }, u32: { size: 4, Arr: Uint32Array },
};

// C struct layout: each field aligned to its type size; the struct padded to
// its largest alignment.
export function brainLayout(brain) {
  if (!Array.isArray(brain)) throw new Error("brain must be a list of [name, type] fields");
  let offset = 0, align = 1;
  const fields = brain.map((f) => {
    const [name, type, count] = f;
    const t = TYPES[type];
    if (!t) throw new Error(`Unknown brain type "${type}" for field "${name}" (use i8 u8 i16 u16 i32 u32)`);
    if (typeof name !== "string" || !/^[A-Za-z_]\w*$/.test(name)) throw new Error(`Bad brain field name: ${name}`);
    if (count !== undefined && !(Number.isInteger(count) && count > 0)) throw new Error(`Bad array length for "${name}"`);
    offset = Math.ceil(offset / t.size) * t.size;
    align = Math.max(align, t.size);
    const field = { name, type, count, offset, ...t };
    offset += t.size * (count || 1);
    return field;
  });
  const size = fields.length ? Math.ceil(offset / align) * align : 0;
  return { fields, size };
}

// A seeded Math.random replacement (SPEC §8): mulberry32.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Evaluates the ant source in a fresh scope. Module-level variables therefore
// start over each time (once per battle). Ants see a Math with a seeded
// random(), and no clocks.
function evaluate(source, seed) {
  const body = source.replace(/^\s*export\s+default\s+/m, "return ");
  if (body === source) throw new Error('The ant must start its definition with "export default {"');
  const math = Object.create(Math);
  math.random = seededRandom(seed);
  // eslint-disable-next-line no-new-func
  const fn = new Function("Math", "Date", "performance", "setTimeout", "setInterval", "postMessage",
    `"use strict";\n${body}`);
  const ant = fn(math, undefined, undefined, undefined, undefined, undefined);
  if (!ant || typeof ant !== "object") throw new Error("export default must be an object");
  if (typeof ant.step !== "function") throw new Error("The ant needs a step(f, m) function");
  if (typeof ant.title !== "string" || !ant.title) throw new Error('The ant needs a title, e.g. title: "MyAnt#3366FF"');
  return ant;
}

function latin1Bytes(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

// Square objects: f[i].ants / .base / .team / .food, with the C names
// (NumAnts, Base, Team, NumFood) as aliases to make porting easy.
function makeSquares(felt) {
  return Array.from({ length: 5 }, (_, i) => {
    const o = i * 4;
    const sq = {};
    const def = (names, k) => {
      for (const n of names) Object.defineProperty(sq, n, { get: () => felt[o + k], enumerable: n === names[0] });
    };
    def(["ants", "NumAnts"], 0);
    def(["base", "Base"], 1);
    def(["team", "Team"], 2);
    def(["food", "NumFood"], 3);
    return Object.freeze(sq);
  });
}

// Brain objects over the shared brain buffer: m[k].field reads and writes
// the bytes of brain k, with C overflow behaviour (typed arrays wrap).
function makeBrains(buffer, byteOffset, layout) {
  const views = {};
  for (const t of Object.keys(TYPES)) views[t] = new TYPES[t].Arr(buffer, byteOffset, Math.floor((256 * layout.size) / TYPES[t].size));
  return Array.from({ length: 256 }, (_, k) => {
    const brain = {};
    for (const f of layout.fields) {
      const base = (k * layout.size + f.offset) / f.size;
      const view = views[f.type];
      if (f.count) {
        const arr = new f.Arr(buffer, byteOffset + k * layout.size + f.offset, f.count);
        Object.defineProperty(brain, f.name, { get: () => arr, enumerable: true });
      } else {
        Object.defineProperty(brain, f.name, { get: () => view[base], set: (v) => { view[base] = v; }, enumerable: true });
      }
    }
    return Object.seal(brain);
  });
}

export function compileJsAnt(source) {
  const probe = evaluate(source, 0);
  const layout = brainLayout(probe.brain || []);
  const titleBytes = latin1Bytes(probe.title);
  return {
    kind: "js",
    source,
    titleBytes,
    memSize: layout.size,
    newBattle(info = {}) {
      const ant = evaluate(source, ((info.battleSeed >>> 0) ^ Math.imul((info.slot | 0) + 1, 0x9e3779b9)) >>> 0);
      const buffer = new ArrayBuffer(20 + 256 * Math.max(4, layout.size));
      const felt = new Uint8Array(buffer, 0, 20);
      const memOffset = 20 + ((4 - (20 % 4)) % 4);
      const mem = new Uint8Array(buffer, memOffset, 256 * layout.size);
      const f = makeSquares(felt);
      const m = makeBrains(buffer, memOffset, layout);
      const step = ant.step;
      return {
        felt,
        mem,
        call() {
          const r = step.call(ant, f, m);
          return typeof r === "number" ? r | 0 : 0;
        },
      };
    },
  };
}
