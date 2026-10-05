// Turn-by-turn state checksum, identical to tools/reference/MK_Trace.c, so the
// JS engine can be compared with the original engine.

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function traceLine(game) {
  const P = FNV_PRIME;
  let h = FNV_OFFSET;
  const { sqAnts, sqBase, sqTeam, sqFood, antList, aTeam, aX, aY, aAge, brains, stride, sqFirst, aNext } = game;
  const N = game.W * game.H;
  for (let i = 0; i < N; i++) {
    h = Math.imul(h ^ sqAnts[i], P);
    h = Math.imul(h ^ sqBase[i], P);
    h = Math.imul(h ^ sqTeam[i], P);
    h = Math.imul(h ^ sqFood[i], P);
  }
  for (let i = 0; i < game.NumAnts; i++) {
    const a = antList[i], t = aTeam[a], size = game.team[t].memSize, o = a * stride;
    const x = aX[a], y = aY[a], age = aAge[a];
    h = Math.imul(h ^ (x & 0xff), P); h = Math.imul(h ^ (x >>> 8), P);
    h = Math.imul(h ^ (y & 0xff), P); h = Math.imul(h ^ (y >>> 8), P);
    h = Math.imul(h ^ t, P);
    h = Math.imul(h ^ (age & 0xff), P); h = Math.imul(h ^ ((age >>> 8) & 0xff), P);
    h = Math.imul(h ^ ((age >>> 16) & 0xff), P); h = Math.imul(h ^ (age >>> 24), P);
    for (let m = 0; m < size; m++) h = Math.imul(h ^ brains[o + m], P);
  }
  for (let i = 0; i < N; i++) {
    if (sqAnts[i]) {
      for (let a = sqFirst[i]; a !== -1; a = aNext[a]) {
        const age = aAge[a];
        h = Math.imul(h ^ (age & 0xff), P); h = Math.imul(h ^ ((age >>> 8) & 0xff), P);
        h = Math.imul(h ^ ((age >>> 16) & 0xff), P); h = Math.imul(h ^ (age >>> 24), P);
      }
    }
  }
  return `${game.BattleCount + 1} ${game.CurrentTurn} ${game.NumAnts} ${game.NumFood} ${game.NumBases} ${(h >>> 0).toString(16).padStart(8, "0")}\n`;
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
