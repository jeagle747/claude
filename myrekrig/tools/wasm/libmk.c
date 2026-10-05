/* Minimal C library for MyreKrig ants compiled to WebAssembly.
 * Only what the ants use: printf family, memory/string helpers, abs, rand,
 * exit. Compiled with -fno-builtin so the compiler doesn't turn memset's own
 * loop back into a call to memset. */

#include <stddef.h>
#include <stdarg.h>

typedef struct mk_file FILE;

__attribute__((import_module("env"), import_name("mk_write")))
void mk_write(int fd, const char *buf, int len);
__attribute__((import_module("env"), import_name("mk_exit")))
void mk_exit(int code) __attribute__((noreturn));

/* --- memory and strings --------------------------------------------------- */

__attribute__((weak)) void *memset(void *d, int c, size_t n) {
   unsigned char *p = d;
   while (n--) *p++ = (unsigned char) c;
   return d;
}

__attribute__((weak)) void *memcpy(void *d, const void *s, size_t n) {
   unsigned char *p = d;
   const unsigned char *q = s;
   while (n--) *p++ = *q++;
   return d;
}

__attribute__((weak)) void *memmove(void *d, const void *s, size_t n) {
   unsigned char *p = d;
   const unsigned char *q = s;
   if (p < q) { while (n--) *p++ = *q++; }
   else { p += n; q += n; while (n--) *--p = *--q; }
   return d;
}

__attribute__((weak)) int memcmp(const void *a, const void *b, size_t n) {
   const unsigned char *p = a, *q = b;
   for (; n; n--, p++, q++) if (*p != *q) return *p - *q;
   return 0;
}

__attribute__((weak)) size_t strlen(const char *s) { const char *p = s; while (*p) p++; return p - s; }
__attribute__((weak)) int strcmp(const char *a, const char *b) {
   while (*a && *a == *b) a++, b++;
   return (unsigned char) *a - (unsigned char) *b;
}
__attribute__((weak)) char *strcpy(char *d, const char *s) { char *p = d; while ((*p++ = *s++)); return d; }

/* --- arithmetic ----------------------------------------------------------- */

__attribute__((weak)) int abs(int x) { return x < 0 ? -x : x; }
__attribute__((weak)) long labs(long x) { return x < 0 ? -x : x; }
__attribute__((weak)) int atoi(const char *s) {
   int v = 0, neg = 0;
   while (*s == ' ') s++;
   if (*s == '-' || *s == '+') neg = *s++ == '-';
   while (*s >= '0' && *s <= '9') v = v * 10 + (*s++ - '0');
   return neg ? -v : v;
}
__attribute__((weak)) double sqrt(double x) { return __builtin_sqrt(x); }
__attribute__((weak)) double fabs(double x) { return __builtin_fabs(x); }
__attribute__((weak)) double floor(double x) { return __builtin_floor(x); }
__attribute__((weak)) double ceil(double x) { return __builtin_ceil(x); }

/* --- rand(): the glibc TYPE_3 additive generator ---------------------------
 * Same sequence as rand() on Linux. A fresh module instance (one per team per
 * battle) starts as if srand(1) had been called, like a fresh process. */

static int rand_state[31];
static int rand_f = 3, rand_r = 0, rand_seeded = 0;

static int random_next(void) {
   unsigned int val = (unsigned int) rand_state[rand_f] + (unsigned int) rand_state[rand_r];
   rand_state[rand_f] = (int) val;
   if (++rand_f >= 31) { rand_f = 0; ++rand_r; }
   else if (++rand_r >= 31) rand_r = 0;
   return (int) (val >> 1);
}

__attribute__((weak)) void srand(unsigned int seed) {
   int i, word;
   if (seed == 0) seed = 1;
   rand_state[0] = (int) seed;
   word = (int) seed;
   for (i = 1; i < 31; i++) {
      long hi = word / 127773, lo = word % 127773;
      word = (int) (16807 * lo - 2836 * hi);
      if (word < 0) word += 2147483647;
      rand_state[i] = word;
   }
   rand_f = 3; rand_r = 0;
   for (i = 0; i < 310; i++) random_next();
   rand_seeded = 1;
}

__attribute__((weak)) int rand(void) {
   if (!rand_seeded) srand(1);
   return random_next();
}

/* --- exit ----------------------------------------------------------------- */

void exit(int code) { mk_exit(code); }
void abort(void) { mk_exit(134); }
void mk_assert_fail(const char *expr, const char *file, int line) { mk_exit(134); }

/* --- printf family -------------------------------------------------------- */

struct out { char *buf; size_t cap, len; };

static void put(struct out *o, char c) {
   if (o->len + 1 < o->cap) o->buf[o->len] = c;
   o->len++;
}

static void put_num(struct out *o, unsigned long long v, int base, int upper, int neg,
                    int width, int prec, int left, int zero, int plus, int space) {
   char tmp[32];
   const char *digits = upper ? "0123456789ABCDEF" : "0123456789abcdef";
   int n = 0, len, pad;
   char sign = neg ? '-' : plus ? '+' : space ? ' ' : 0;
   if (v == 0 && prec != 0) tmp[n++] = '0';
   while (v) { tmp[n++] = digits[v % base]; v /= base; }
   len = (prec > n ? prec : n) + (sign ? 1 : 0);
   pad = width > len ? width - len : 0;
   if (!left && !(zero && prec < 0)) while (pad-- > 0) put(o, ' ');
   if (sign) put(o, sign);
   if (!left && zero && prec < 0) while (pad-- > 0) put(o, '0');
   for (len = n; len < prec; len++) put(o, '0');
   while (n) put(o, tmp[--n]);
   if (left) while (pad-- > 0) put(o, ' ');
}

int vsnprintf(char *buf, size_t cap, const char *f, va_list ap) {
   struct out o = { buf, cap, 0 };
   for (; *f; f++) {
      int left = 0, zero = 0, plus = 0, space = 0, width = 0, prec = -1, lng = 0;
      if (*f != '%') { put(&o, *f); continue; }
      f++;
      for (;; f++) {
         if (*f == '-') left = 1; else if (*f == '0') zero = 1;
         else if (*f == '+') plus = 1; else if (*f == ' ') space = 1;
         else if (*f == '#') ; else break;
      }
      if (*f == '*') { width = va_arg(ap, int); if (width < 0) left = 1, width = -width; f++; }
      else while (*f >= '0' && *f <= '9') width = width * 10 + (*f++ - '0');
      if (*f == '.') {
         f++; prec = 0;
         if (*f == '*') { prec = va_arg(ap, int); f++; }
         else while (*f >= '0' && *f <= '9') prec = prec * 10 + (*f++ - '0');
      }
      while (*f == 'l' || *f == 'h' || *f == 'z') { if (*f == 'l') lng++; f++; }
      switch (*f) {
      case 'd': case 'i': {
         long long v = lng >= 2 ? va_arg(ap, long long) : lng ? va_arg(ap, long) : va_arg(ap, int);
         put_num(&o, v < 0 ? -(unsigned long long) v : (unsigned long long) v, 10, 0, v < 0,
                 width, prec, left, zero, plus, space);
         break;
      }
      case 'u': case 'x': case 'X': case 'o': {
         unsigned long long v = lng >= 2 ? va_arg(ap, unsigned long long)
                              : lng ? va_arg(ap, unsigned long) : va_arg(ap, unsigned int);
         put_num(&o, v, *f == 'u' ? 10 : *f == 'o' ? 8 : 16, *f == 'X', 0,
                 width, prec, left, zero, 0, 0);
         break;
      }
      case 'p':
         put_num(&o, (unsigned long) va_arg(ap, void *), 16, 0, 0, width, prec, left, zero, 0, 0);
         break;
      case 'c': {
         int pad = width > 1 ? width - 1 : 0;
         if (!left) while (pad-- > 0) put(&o, ' ');
         put(&o, (char) va_arg(ap, int));
         if (left) while (pad-- > 0) put(&o, ' ');
         break;
      }
      case 's': {
         const char *s = va_arg(ap, const char *);
         int n = 0, pad;
         if (!s) s = "(null)";
         while (s[n] && (prec < 0 || n < prec)) n++;
         pad = width > n ? width - n : 0;
         if (!left) while (pad-- > 0) put(&o, ' ');
         while (n--) put(&o, *s++);
         if (left) while (pad-- > 0) put(&o, ' ');
         break;
      }
      case 'f': case 'g': case 'e': {
         double d = va_arg(ap, double);
         unsigned long long ip;
         int neg = d < 0, i;
         if (neg) d = -d;
         if (prec < 0) prec = 6;
         ip = (unsigned long long) d;
         put_num(&o, ip, 10, 0, neg, 0, -1, 0, 0, plus, space);
         if (prec) {
            put(&o, '.');
            d -= (double) ip;
            for (i = 0; i < prec; i++) { d *= 10; put(&o, '0' + (int) d % 10); d -= (int) d; }
         }
         break;
      }
      case '%': put(&o, '%'); break;
      case 0: f--; break;
      default: put(&o, '%'); put(&o, *f); break;
      }
   }
   if (cap) buf[o.len < cap ? o.len : cap - 1] = 0;
   return (int) o.len;
}

int snprintf(char *buf, size_t n, const char *fmt, ...) {
   va_list ap; int r;
   va_start(ap, fmt); r = vsnprintf(buf, n, fmt, ap); va_end(ap);
   return r;
}

int sprintf(char *buf, const char *fmt, ...) {
   va_list ap; int r;
   va_start(ap, fmt); r = vsnprintf(buf, (size_t) -1 >> 1, fmt, ap); va_end(ap);
   return r;
}

static char print_buf[1024];

static int vprint(int fd, const char *fmt, va_list ap) {
   int n = vsnprintf(print_buf, sizeof print_buf, fmt, ap);
   mk_write(fd, print_buf, n < (int) sizeof print_buf ? n : (int) sizeof print_buf - 1);
   return n;
}

int printf(const char *fmt, ...) {
   va_list ap; int r;
   va_start(ap, fmt); r = vprint(1, fmt, ap); va_end(ap);
   return r;
}

int fprintf(FILE *f, const char *fmt, ...) {
   va_list ap; int r;
   va_start(ap, fmt); r = vprint((int) (size_t) f, fmt, ap); va_end(ap);
   return r;
}

int puts(const char *s) { mk_write(1, s, (int) strlen(s)); mk_write(1, "\n", 1); return 0; }
int putchar(int c) { char ch = (char) c; mk_write(1, &ch, 1); return c; }
int fflush(FILE *f) { return 0; }
