// Turn-by-turn state checksum, identical to tools/reference/MK_Trace.c, so the
// JS engine can be compared with the original engine.

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function traceLine(game) {
  const P = FNV_PRIME;
  let h = FNV_OFFSET, h2 = FNV_OFFSET; // h2: the same without brain bytes
  const { sqAnts, sqBase, sqTeam, sqFood, antList, aTeam, aX, aY, aAge, brains, stride, sqFirst, aNext } = game;
  const N = game.W * game.H;
  const both = (b) => { h = Math.imul(h ^ b, P); h2 = Math.imul(h2 ^ b, P); };
  for (let i = 0; i < N; i++) {
    both(sqAnts[i]); both(sqBase[i]); both(sqTeam[i]); both(sqFood[i]);
  }
  for (let i = 0; i < game.NumAnts; i++) {
    const a = antList[i], t = aTeam[a], size = game.team[t].memSize, o = a * stride;
    const x = aX[a], y = aY[a], age = aAge[a];
    both(x & 0xff); both(x >>> 8); both(y & 0xff); both(y >>> 8); both(t);
    both(age & 0xff); both((age >>> 8) & 0xff); both((age >>> 16) & 0xff); both(age >>> 24);
    for (let m = 0; m < size; m++) h = Math.imul(h ^ brains[o + m], P);
  }
  for (let i = 0; i < N; i++) {
    if (sqAnts[i]) {
      for (let a = sqFirst[i]; a !== -1; a = aNext[a]) {
        const age = aAge[a];
        both(age & 0xff); both((age >>> 8) & 0xff); both((age >>> 16) & 0xff); both(age >>> 24);
      }
    }
  }
  const hex = (v) => (v >>> 0).toString(16).padStart(8, "0");
  return `${game.BattleCount + 1} ${game.CurrentTurn} ${game.NumAnts} ${game.NumFood} ${game.NumBases} ${hex(h)} ${hex(h2)}\n`;
}

// Full state dump, same format as mk_dump() in MK_Trace.c (for debugging).
export function dumpState(game) {
  let s = `DUMP battle ${game.BattleCount + 1} turn ${game.CurrentTurn}\n`;
  const N = game.W * game.H;
  for (let i = 0; i < N; i++) {
    if (game.sqAnts[i] || game.sqBase[i] || game.sqFood[i] || game.sqTeam[i]) {
      s += `sq ${i % game.W},${Math.floor(i / game.W)} ants=${game.sqAnts[i]} base=${game.sqBase[i]} team=${game.sqTeam[i]} food=${game.sqFood[i]} list=`;
      for (let a = game.sqFirst[i]; a !== -1; a = game.aNext[a]) s += `${game.aAge[a]} `;
      s += "\n";
    }
  }
  for (let i = 0; i < game.NumAnts; i++) {
    const a = game.antList[i], t = game.aTeam[a], size = game.team[t].memSize, o = a * game.stride;
    let mem = "";
    for (let m = 0; m < size; m++) mem += game.brains[o + m].toString(16).padStart(2, "0");
    s += `ant ${i} x=${game.aX[a]} y=${game.aY[a]} team=${t} age=${game.aAge[a]} mem=${mem}\n`;
  }
  return s;
}
