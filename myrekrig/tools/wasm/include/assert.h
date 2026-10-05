/* The original was built with -DNDEBUG, so assert() did nothing. */
#undef assert
#ifdef NDEBUG
#define assert(e) ((void)0)
#else
void mk_assert_fail(const char *expr, const char *file, int line);
#define assert(e) ((e) ? (void)0 : mk_assert_fail(#e, __FILE__, __LINE__))
#endif
