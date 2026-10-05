/* Myre.h for building MyreKrig ants as WebAssembly modules.
 * Same ant interface as the original Myre.h (structs, constants and the
 * DefineAnt macro), but DefineAnt exports the ant to the JS engine instead
 * of registering it with the C engine. */
#ifndef MYRE_H
#define MYRE_H

#include <assert.h>

#define NewBaseAnts 25
#define NewBaseFood 50
#define MaxSquareAnts 100
#define MaxSquareFood 200
#define BaseValue (NewBaseAnts+NewBaseFood)

typedef unsigned char u_char;
typedef unsigned short u_short;
typedef unsigned long u_long; /* 32 bits, as on 2003-era Linux */
#ifndef __cplusplus
typedef int bool;
#define false 0
#define true (!false)
#endif

struct SquareData {
   u_char NumAnts;
   u_char Base;
   u_char Team;
   u_char NumFood;
};

struct AntData {
   struct AntData *MapNext, *MapPrev;
   u_short Index, Team, XPos, YPos;
   u_long Age, NextTurn;
   u_long Mem[1];
};

/* The engine writes the 5 squares to mk_felt and up to 255 brains to mk_mem,
 * calls mk_step, and reads the brains back. */
#define DefineAnt(name,title,func,mem) \
extern int func(struct SquareData *, mem *); \
static struct SquareData mk_felt[5]; \
static mem mk_mem[256]; \
__attribute__((export_name("mk_step"))) int mk_step(void) { return func(mk_felt, mk_mem); } \
__attribute__((export_name("mk_felt"))) void *mk_felt_ptr(void) { return mk_felt; } \
__attribute__((export_name("mk_mem"))) void *mk_mem_ptr(void) { return mk_mem; } \
__attribute__((export_name("mk_memsize"))) int mk_memsize(void) { return sizeof(mem); } \
__attribute__((export_name("mk_title"))) const char *mk_title(void) { return title; }

#endif
