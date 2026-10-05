#ifndef _MK_STDLIB_H
#define _MK_STDLIB_H
#include <stddef.h>
#define RAND_MAX 2147483647
int abs(int x);
long labs(long x);
int rand(void);
void srand(unsigned int seed);
int atoi(const char *s);
void exit(int code) __attribute__((noreturn));
void abort(void) __attribute__((noreturn));
#endif
