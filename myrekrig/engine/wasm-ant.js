// Loads a C ant compiled to WebAssembly (see tools/build-ants.mjs) as a team
// definition for the engine.
//
// Every battle gets a fresh instance of the module, so the ant's global
// variables and its rand() generator start over (SPEC §4.3, §8).

export class AntExit extends Error {}

// options.print(fd, text): receives the ant's printf output (default: dropped).
export function loadWasmAnt(bytes, options = {}) {
  const module = bytes instanceof WebAssembly.Module ? bytes : new WebAssembly.Module(bytes);
  const print = options.print || null;

  function instantiate() {
    let memory;
    const imports = {
      env: {
        mk_write(fd, ptr, len) {
          if (print) print(fd, String.fromCharCode(...new Uint8Array(memory.buffer, ptr, len)));
        },
        mk_exit(code) { throw new AntExit(`ant called exit(${code})`); },
      },
    };
    const instance = new WebAssembly.Instance(module, imports);
    memory = instance.exports.memory;
    return instance;
  }

  // Read the title and brain size once.
  const probe = instantiate();
  const mem8 = new Uint8Array(probe.exports.memory.buffer);
  const titlePtr = probe.exports.mk_title();
  let end = titlePtr;
  while (mem8[end]) end++;
  const titleBytes = mem8.slice(titlePtr, end);
  const memSize = probe.exports.mk_memsize();

  return {
    kind: "wasm",
    titleBytes,
    memSize,
    newBattle() {
      const inst = instantiate();
      const buf = inst.exports.memory.buffer;
      const step = inst.exports.mk_step;
      return {
        felt: new Uint8Array(buf, inst.exports.mk_felt(), 20),
        mem: new Uint8Array(buf, inst.exports.mk_mem(), 256 * memSize),
        call: () => step(),
      };
    },
  };
}
