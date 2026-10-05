/* Probe - a small example ant, written for the MyreKrig JS project
 * (public example; not one of the historic ants).
 *
 * Walks in random straight lines, remembers where it found food, carries
 * food home, and tells the other ants on its square where the food is.
 * Attacks any enemy next to it. ants/js/Probe.js is the same ant in
 * JavaScript, line by line; both must play identically (tests/js-ants.mjs).
 */
#include "Myre.h"

struct ProbeBrain {
   u_long rnd;          /* random at birth (first 4 bytes) */
   short x, y;          /* position relative to the base */
   short fx, fy;        /* known food position (0,0 = none) */
   char state;          /* 0 = searching, 1 = carrying food home */
   char steps;          /* steps left in the current direction */
};                      /* 14 bytes of fields + 2 bytes padding = 16 */

/* Direction that brings (dx,dy) closer to (0,0). */
static int dirTo(int dx, int dy) {
   if (dx > 0) return 3;
   if (dx < 0) return 1;
   if (dy > 0) return 4;
   if (dy < 0) return 2;
   return 0;
}

static void track(struct ProbeBrain *m, int d) {
   if (d == 1) m->x++;
   else if (d == 2) m->y++;
   else if (d == 3) m->x--;
   else if (d == 4) m->y--;
}

int Probe(struct SquareData *f, struct ProbeBrain *m) {
   int i, d;
   /* Attack an enemy next to us. */
   for (i = 1; i < 5; i++) {
      if (f[i].Team) { track(m, i); return i; }
   }
   /* Tell the other ants on this square where the food is. */
   for (i = 1; i < f[0].NumAnts; i++) {
      if (!m[i].fx && !m[i].fy && (m->fx || m->fy)) { m[i].fx = m->fx; m[i].fy = m->fy; }
   }
   if (f[0].Base) { m->x = m->y = 0; m->state = 0; }
   /* Carrying food home. */
   if (m->state == 1) {
      d = dirTo(m->x, m->y);
      if (d == 0) { m->state = 0; return 0; }
      track(m, d);
      return d + 8;
   }
   /* Found food: remember it and take one home. */
   if (f[0].NumFood && !f[0].Base) {
      m->fx = m->x; m->fy = m->y;
      m->state = 1;
      d = dirTo(m->x, m->y);
      track(m, d);
      return d + 8;
   }
   /* Go to known food. */
   if (m->fx || m->fy) {
      d = dirTo(m->x - m->fx, m->y - m->fy);
      if (d == 0) { m->fx = m->fy = 0; }   /* we are there and it is gone */
      else { track(m, d); return d; }
   }
   /* Food next to us that nobody is taking. */
   for (i = 1; i < 5; i++) {
      if (f[i].NumFood && !f[i].NumAnts) { track(m, i); return i; }
   }
   /* Random straight lines of 1..16 steps. */
   if (m->steps-- <= 0) {
      m->rnd = m->rnd * 1103515245 + 12345;
      m->steps = (char) (((m->rnd >> 16) & 15) + 1);
   }
   d = (int) ((m->rnd >> 24) & 3) + 1;
   track(m, d);
   return d;
}

DefineAnt(Probe, "Probe#40C080", Probe, struct ProbeBrain)
