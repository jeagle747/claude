// Probe - a small example ant, written for the MyreKrig JS project.
// The same ant as ants/c/Probe.c, line by line; both play identically.
//
// Walks in random straight lines, remembers where it found food, carries
// food home, and tells the other ants on its square where the food is.
// Attacks any enemy next to it.

// Direction that brings (dx,dy) closer to (0,0).
function dirTo(dx, dy) {
  if (dx > 0) return 3;
  if (dx < 0) return 1;
  if (dy > 0) return 4;
  if (dy < 0) return 2;
  return 0;
}

function track(m, d) {
  if (d == 1) m.x++;
  else if (d == 2) m.y++;
  else if (d == 3) m.x--;
  else if (d == 4) m.y--;
}

export default {
  title: "Probe#40C080",
  brain: [
    ["rnd", "u32"],                  // random at birth (first 4 bytes)
    ["x", "i16"], ["y", "i16"],      // position relative to the base
    ["fx", "i16"], ["fy", "i16"],    // known food position (0,0 = none)
    ["state", "i8"],                 // 0 = searching, 1 = carrying food home
    ["steps", "i8"],                 // steps left in the current direction
  ],                                 // 14 bytes + 2 bytes padding = 16, as in C

  step(f, m) {
    const me = m[0];
    let i, d;
    // Attack an enemy next to us.
    for (i = 1; i < 5; i++) {
      if (f[i].team) { track(me, i); return i; }
    }
    // Tell the other ants on this square where the food is.
    for (i = 1; i < f[0].ants; i++) {
      if (!m[i].fx && !m[i].fy && (me.fx || me.fy)) { m[i].fx = me.fx; m[i].fy = me.fy; }
    }
    if (f[0].base) { me.x = me.y = 0; me.state = 0; }
    // Carrying food home.
    if (me.state == 1) {
      d = dirTo(me.x, me.y);
      if (d == 0) { me.state = 0; return 0; }
      track(me, d);
      return d + 8;
    }
    // Found food: remember it and take one home.
    if (f[0].food && !f[0].base) {
      me.fx = me.x; me.fy = me.y;
      me.state = 1;
      d = dirTo(me.x, me.y);
      track(me, d);
      return d + 8;
    }
    // Go to known food.
    if (me.fx || me.fy) {
      d = dirTo(me.x - me.fx, me.y - me.fy);
      if (d == 0) { me.fx = me.fy = 0; }   // we are there and it is gone
      else { track(me, d); return d; }
    }
    // Food next to us that nobody is taking.
    for (i = 1; i < 5; i++) {
      if (f[i].food && !f[i].ants) { track(me, i); return i; }
    }
    // Random straight lines of 1..16 steps.
    if (me.steps-- <= 0) {
      // C multiplies 32-bit numbers with wrap-around. In JavaScript a plain
      // * would lose precision for numbers this big; Math.imul does the C one.
      me.rnd = Math.imul(me.rnd, 1103515245) + 12345;
      me.steps = ((me.rnd >>> 16) & 15) + 1;
    }
    d = ((me.rnd >>> 24) & 3) + 1;
    track(me, d);
    return d;
  },
};
