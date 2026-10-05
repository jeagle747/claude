/* MK_Trace.c - trace "display" module for the original MyreKrig engine.
 *
 * Plugs into the engine's display interface (like MK_Quiet.c) and writes a
 * checksum of the complete game state after every turn to the file named by
 * the environment variable MK_TRACE (default: stderr). The engine's own
 * logic is untouched. The JS engine writes the same trace, so the two can be
 * compared turn by turn.
 *
 * Trace line:  <battle> <turn> <ants> <food> <bases> <hash>
 * The hash (FNV-1a, 32 bit) covers, in order:
 *   1. every square in index order (x + y*W): NumAnts, Base, Team, NumFood
 *   2. every ant in global ant-list order: XPos, YPos (16-bit LE), Team,
 *      Age (32-bit LE), then the first MemSize bytes of its brain
 *   3. every square with ants, in index order: the Age (32-bit LE) of each
 *      ant in square-list order
 */

#include <stdio.h>
#include <stdlib.h>
#include "MyreKrig.h"

static FILE *trace;
static unsigned int every = 1;

#define FNV_OFFSET 2166136261u
#define FNV_PRIME 16777619u

static unsigned int h;
static int dump_battle = -1;
static unsigned long dump_turn = 0;
void mk_dump(void);

static void hb(unsigned int b) { h = (h ^ (b & 0xff)) * FNV_PRIME; }
static void h16(unsigned int v) { hb(v); hb(v >> 8); }
static void h32(unsigned int v) { hb(v); hb(v >> 8); hb(v >> 16); hb(v >> 24); }

int SysGameInit(int argc, char *argv[]) {
   char *name = getenv("MK_TRACE");
   char *ev = getenv("MK_TRACE_EVERY");
   trace = name ? fopen(name, "w") : stderr;
   if (ev) every = atoi(ev);
   if (getenv("MK_DUMP")) sscanf(getenv("MK_DUMP"), "%d:%lu", &dump_battle, &dump_turn);
   return trace != NULL;
}

int SysBattleInit(void) { return 1; }

void SysDrawMap(void) {
   unsigned long i, n;
   if (BattleCount + 1 == dump_battle && CurrentTurn == dump_turn) mk_dump();
   if (every == 0 || CurrentTurn % every != 0) return;
   h = FNV_OFFSET;
   n = Used.MapWidth * Used.MapHeight;
   for (i = 0 ; i < n ; i++) {
      hb(MapDatas[i].NumAnts); hb(MapDatas[i].Base);
      hb(MapDatas[i].Team); hb(MapDatas[i].NumFood);
   }
   for (i = 0 ; i < NumAnts ; i++) {
      struct AntData *a = AntList[i];
      int m, size = TeamDatas[a->Team].MemSize;
      h16(a->XPos); h16(a->YPos); hb(a->Team); h32((unsigned int) a->Age);
      for (m = 0 ; m < size ; m++) hb(((unsigned char *) a->Mem)[m]);
   }
   for (i = 0 ; i < n ; i++) {
      if (MapDatas[i].NumAnts) {
         struct AntData *a = MapAnts[i].MapFirst;
         struct AntData *end = (struct AntData *) &MapAnts[i];
         while (a != end) { h32((unsigned int) a->Age); a = a->MapNext; }
      }
   }
   fprintf(trace, "%d %lu %lu %lu %lu %08x\n", BattleCount + 1, (unsigned long) CurrentTurn,
           (unsigned long) NumAnts, (unsigned long) NumFood, (unsigned long) NumBases, h);
}

int SysCheck(void) { return 0; }
void SysBattleExit(void) { fflush(trace); }
void SysGameExit(void) { if (trace != stderr) fclose(trace); }
void SysSquareChanged(int x, int y) {}

/* Debugging aid: MK_DUMP=<battle>:<turn> writes the full state after that
 * turn to stdout. Same format as dumpState() in engine/trace.js. */
void mk_dump(void) {
   unsigned long i, n = Used.MapWidth * Used.MapHeight;
   printf("DUMP battle %d turn %lu\n", BattleCount + 1, (unsigned long) CurrentTurn);
   for (i = 0 ; i < n ; i++) {
      struct SquareData *s = &MapDatas[i];
      if (s->NumAnts || s->Base || s->NumFood || s->Team) {
         struct AntData *a = MapAnts[i].MapFirst, *end = (struct AntData *) &MapAnts[i];
         printf("sq %lu,%lu ants=%d base=%d team=%d food=%d list=", i % Used.MapWidth, i / Used.MapWidth,
                s->NumAnts, s->Base, s->Team, s->NumFood);
         while (a != end) { printf("%lu ", (unsigned long) a->Age); a = a->MapNext; }
         printf("\n");
      }
   }
   for (i = 0 ; i < NumAnts ; i++) {
      struct AntData *a = AntList[i];
      int m, size = TeamDatas[a->Team].MemSize;
      printf("ant %lu x=%d y=%d team=%d age=%lu mem=", i, a->XPos, a->YPos, a->Team, (unsigned long) a->Age);
      for (m = 0 ; m < size ; m++) printf("%02x", ((unsigned char *) a->Mem)[m]);
      printf("\n");
   }
}
