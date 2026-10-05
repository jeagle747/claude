#ifndef _MK_STDIO_H
#define _MK_STDIO_H
#include <stddef.h>
#include <stdarg.h>
typedef struct mk_file FILE;
#define stdout ((FILE *)1)
#define stderr ((FILE *)2)
#define EOF (-1)
int printf(const char *fmt, ...);
int fprintf(FILE *f, const char *fmt, ...);
int sprintf(char *buf, const char *fmt, ...);
int snprintf(char *buf, size_t n, const char *fmt, ...);
int vsnprintf(char *buf, size_t n, const char *fmt, va_list ap);
int puts(const char *s);
int putchar(int c);
int fflush(FILE *f);
#endif
