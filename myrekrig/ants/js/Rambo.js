// Rambo by Jørn Holm, ported line by line from ants/c/Rambo.c.
// Attacks a neighbouring base if there is one, otherwise the largest enemy
// group next to it, otherwise stays put.
export default {
  title: "Rambo#FF0000",
  brain: [],                          // Rambo remembers nothing (0 bytes)

  step(f, m) {
    let max = 0;
    let best = 0;
    for (let i = 1; i < 5; i++) {
      if (f[i].base == 1)
        return i;
    }
    for (let i = 1; i < 5; i++) {
      if (f[i].team > 0) {
        if (f[i].ants > max) {
          max = f[i].ants;
          best = i;
        }
      }
    }
    return best;
  },
};
