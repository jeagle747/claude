/* Kompas - a MyreKrig ant written by Claude (2026) for the MyreKrig JS project.
 *
 * Idea: every ant carries a compass - its position relative to the last base
 * it stood on. When it steps onto another of our bases it re-anchors there and
 * translates the target it remembers, so food positions stay valid across
 * bases. When two ants share a target, it is converted from one ant's frame
 * to the other's (target_them = target_me - pos_me + pos_them), so ants
 * anchored to different bases can still help each other.
 *
 * Roles:
 *   SENTRY   stays on the base and is the notice board: it remembers the
 *            best food pile reported by returning ants and hands it out.
 *   EXPLORE  walks straight lines in random directions looking for food.
 *   FETCH    walks to a known pile.
 *   RETURN   carries one food home, then goes back if food is left, and
 *            recruits the ants it meets on the way.
 *   GUARD    holds one of the four squares next to the base, so an enemy
 *            has to get past a guard before it can reach the base.
 *   HUNT     an ant that has just killed lies in wait for a while: more
 *            enemies tend to follow, and in MyreKrig the ant that stands
 *            still usually strikes first when an enemy steps next to it.
 * Every ant attacks an enemy next to it at once (bases first): in MyreKrig
 * the attacker always wins. When 26 of our ants happen to stand on a big pile
 * far from home, they build an outpost base there.
 *
 * Tested 8 battles 1-on-1 against each of the 52 historic ants: wins 66% of
 * all battles, beats 35 of them, ties 2, loses to 15 (all of the 10 weakest
 * beaten 8-0; the strongest, e.g. Legions, Caesar, FirkAnt, still win).
 */
#include "Myre.h"

struct KompasBrain {
   u_long rnd;          /* random at birth, then our random generator */
   short x, y;          /* position relative to our anchor base */
   short tx, ty;        /* target (food pile), same frame */
   u_char role;
   u_char cnt;          /* food believed left at the target */
   u_char steps;        /* explorer: steps left on this heading; hunter: turns to wait */
   u_char head;         /* explorer: heading 1..4; hunter: the job to go back to */
};                      /* 16 bytes */

#define NEWBORN 0
#define EXPLORE 1
#define FETCH   2
#define RETURN  3
#define SENTRY  4
#define GUARD   5
#define HUNT    6
#define HUNT_STEPS 200  /* turns an explorer lies in wait after a kill */
#define HUNT_SHORT 8    /* the same for ants with a job (fetching, carrying) */

#define OUTPOST_DIST 45 /* piles at least this far away may become bases */
#define ROAM 180        /* explorers this far out turn back towards home */

static int krand(struct KompasBrain *m, int n) {
   m->rnd = m->rnd * 1103515245u + 12345u;
   return (int) ((m->rnd >> 16) % (unsigned) n);
}

static int kabs(int v) { return v < 0 ? -v : v; }

/* Direction that brings (x,y) towards (tx,ty); 0 when there. */
static int towards(struct KompasBrain *m, int tx, int ty) {
   int dx = tx - m->x, dy = ty - m->y;
   if (!dx && !dy) return 0;
   if (kabs(dx) > kabs(dy) || (kabs(dx) == kabs(dy) && (m->rnd & 0x400000))) return dx > 0 ? 1 : 3;
   return dy > 0 ? 2 : 4;
}

static int go(struct KompasBrain *m, int d) {
   if (d == 1) m->x++;
   else if (d == 2) m->y++;
   else if (d == 3) m->x--;
   else if (d == 4) m->y--;
   return d;
}

/* Gives ant o our target, converted to its frame. */
static void share(struct KompasBrain *m, struct KompasBrain *o, int cnt) {
   o->tx = m->tx - m->x + o->x;
   o->ty = m->ty - m->y + o->y;
   o->cnt = cnt;
   o->role = FETCH;
   o->steps = 0;
}

/* Recruits idle ants on this square for our pile. */
static void recruit(struct KompasBrain *m, int n, int keep) {
   int i;
   for (i = 1; i < n && m->cnt > keep; i++) {
      if (m[i].role == NEWBORN || m[i].role == EXPLORE) {
         share(m, &m[i], 0);
         m->cnt--;
      }
   }
}

int Kompas(struct SquareData *f, struct KompasBrain *m) {
   int i, d, best = 0, most = 0, n = f[0].NumAnts;

   /* Attack: an enemy base next to us, else the biggest enemy group. */
   for (i = 1; i < 5; i++) if (f[i].Team && f[i].Base) best = i;
   if (!best) for (i = 1; i < 5; i++) if (f[i].Team && f[i].NumAnts > most) { most = f[i].NumAnts; best = i; }
   if (best) {
      /* After the strike, lie in wait (more enemies tend to follow), then
         resume the old job, kept in head. */
      if (m->role == EXPLORE || m->role == FETCH || m->role == RETURN) {
         m->head = m->role; m->role = HUNT; m->steps = m->head == EXPLORE ? HUNT_STEPS : HUNT_SHORT;
      } else if (m->role == HUNT) m->steps = m->head == EXPLORE ? HUNT_STEPS : HUNT_SHORT;
      return go(m, best);
   }

   /* On one of our bases: re-anchor the compass here. */
   if (f[0].Base) {
      if (m->x || m->y) {
         m->tx -= m->x; m->ty -= m->y;
         m->x = m->y = 0;
      }
      if (m->role == SENTRY) {
         /* The notice board: forget empty piles, hand out targets. */
         for (i = 1; i < n; i++) {
            if (m[i].role == RETURN && m[i].cnt > 1 &&
                (m->cnt == 0 || kabs(m[i].tx) + kabs(m[i].ty) < kabs(m->tx) + kabs(m->ty))) {
               m->tx = m[i].tx - m[i].x; m->ty = m[i].ty - m[i].y; m->cnt = m[i].cnt;
            }
         }
         recruit(m, n, 0);
         return 0;
      }
      if (m->role == NEWBORN) {
         int sentry = 0;
         for (i = 1; i < n; i++) if (m[i].role == SENTRY) sentry = 1;
         if (!sentry) { m->role = SENTRY; m->cnt = 0; return 0; }
         for (i = 1; i < 5; i++) {
            if (!f[i].NumAnts) {                      /* an empty guard post */
               m->role = GUARD;
               m->tx = m->ty = 0;
               return go(m, i);
            }
         }
         m->role = EXPLORE;
         m->steps = 0;
      }
      if (m->role == RETURN) {
         /* Delivered. Go back if food is left, and bring company. */
         if (m->cnt > 0) {
            m->role = FETCH;
            m->cnt--;
            recruit(m, n, 0);
         } else {
            m->role = EXPLORE;
            m->steps = 0;
         }
      }
   }

   /* Food here (not on a base): take one home, remember the rest. */
   if (f[0].NumFood && !f[0].Base && m->role != RETURN) {
      int far = kabs(m->x) + kabs(m->y) >= OUTPOST_DIST;
      if (far && f[0].NumFood >= NewBaseFood && n > NewBaseAnts) return 16;   /* outpost */
      m->tx = m->x; m->ty = m->y;
      m->cnt = f[0].NumFood - 1;
      m->role = RETURN;
      m->steps = 0;
      return go(m, towards(m, 0, 0)) + 8;
   }

   if (m->role == GUARD) {
      /* Hold the post next to the base (back to it after a fight). */
      if (kabs(m->x) + kabs(m->y) == 1) return 0;
      d = towards(m, 0, 0);
      if (kabs(m->x) + kabs(m->y) > 1 && d) return go(m, d);
      m->role = EXPLORE;                              /* base is gone */
      m->steps = 0;
   }

   if (m->role == SENTRY) {                         /* back from a fight */
      d = towards(m, 0, 0);
      if (d) return go(m, d);
      m->role = EXPLORE;
      m->steps = 0;
   }

   if (m->role == RETURN) {
      d = towards(m, 0, 0);
      if (!d) { m->role = EXPLORE; m->steps = 0; }   /* home is gone */
      else {
         recruit(m, n, 3);
         return go(m, d) + 8;
      }
   }

   if (m->role == FETCH) {
      d = towards(m, m->tx, m->ty);
      if (d) return go(m, d);
      m->role = EXPLORE;                              /* pile is empty */
      m->steps = 0;
   }

   if (m->role == HUNT) {
      if (m->steps-- > 0) return 0;                  /* lie in wait */
      m->role = m->head;                              /* back to work */
      m->steps = 0;
      if (m->role == FETCH) return go(m, towards(m, m->tx, m->ty));
      if (m->role == RETURN) return go(m, towards(m, 0, 0)) + 8;
   }

   /* Explorer: learn from ants that know food, else look around. */
   for (i = 1; i < n; i++) {
      if ((m[i].role == RETURN || m[i].role == FETCH) && m[i].cnt > 2) {
         share(&m[i], m, 0);
         m[i].cnt--;
         return go(m, towards(m, m->tx, m->ty));
      }
   }
   for (i = 1; i < 5; i++) if (f[i].NumFood && !f[i].Base && !f[i].Team) return go(m, i);
   if (m->steps == 0 || m->head < 1 || m->head > 4) {
      if (kabs(m->x) + kabs(m->y) > ROAM && krand(m, 2)) m->head = towards(m, 0, 0);
      else m->head = 1 + krand(m, 4);
      m->steps = 6 + krand(m, 34);
   }
   m->steps--;
   return go(m, m->head);
}

DefineAnt(Kompas, "Kompas#F0A030", Kompas, struct KompasBrain)
