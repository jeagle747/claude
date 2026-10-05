#!/bin/bash
# Builds the original MyreKrig engine (v2.4.7, 32-bit) with the trace module,
# for comparison with the JS engine. Nothing from the original is committed:
# the sources are fetched from the public 2011 repository into a cache.
#
# Usage: build-ref.sh <output-binary> <Ant1> [<Ant2> ...]
#   The order of the ants is the team order (the first is team A / team 1).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CACHE="$ROOT/.cache"
REPO="$CACHE/Myrekrig-2011"
COMMIT=c687ba649bf035e2e228ff9d95925a2dbe722947
SRC="$CACHE/ref-src"
OBJ="$CACHE/ref-obj"

out="$1"; shift
[ $# -ge 1 ] || { echo "usage: $0 <output> <ant>..." >&2; exit 1; }

mkdir -p "$CACHE"
if [ ! -d "$REPO" ]; then
  git clone -q https://github.com/einar-io/Myrekrig-2011 "$REPO"
fi
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT" ] || git -C "$REPO" checkout -q "$COMMIT"

# Prepare sources: 2003 semantics means u_long is a 32-bit unsigned long.
if [ ! -f "$SRC/.ready" ]; then
  rm -rf "$SRC"; mkdir -p "$SRC"
  cp "$REPO"/src/*.c "$REPO"/src/*.h "$SRC"/
  cp -r "$REPO"/src/Racer "$SRC"/Racer
  sed -i 's/^typedef unsigned long long u_long;.*/typedef unsigned long u_long;/' "$SRC/Myre.h"
  grep -q '^typedef unsigned long u_long;' "$SRC/Myre.h"
  touch "$SRC/.ready"
fi
cp "$HERE/MK_Trace.c" "$SRC/MK_Trace.c"

CFLAGS="-m32 -msse2 -mfpmath=sse -fno-pic -fno-strict-aliasing -fwrapv -std=gnu89 -fgnu89-inline -fsigned-char -DNDEBUG -O2 -w -I$SRC"
mkdir -p "$OBJ"

# Ant objects are cached; the ant list only changes MyreHold.c.
objs=()
for ant in "$@"; do
  # Ants are found in the cache, or in ants/c (the user's own ants) first.
  srcfile="$ROOT/ants/c/$ant.c"
  [ -f "$srcfile" ] || srcfile="$SRC/Racer/$ant.c"
  o="$OBJ/$ant.o"
  if [ ! -f "$o" ] || [ "$srcfile" -nt "$o" ] || [ "$ROOT/tools/ant-compat.mjs" -nt "$o" ]; then
    node "$ROOT/tools/ant-compat.mjs" "$srcfile" "$OBJ/$ant.compat.c"
    gcc $CFLAGS -c "$OBJ/$ant.compat.c" -o "$o"
    # Keep only the DefineAnt symbols global so helper names can't clash
    # between ants (each ant was originally its own compilation unit).
    objcopy --wildcard --keep-global-symbol="${ant}_*" "$o"
  fi
  objs+=("$o")
done

hold="$OBJ/MyreHold-$$.c"
{
  echo '#include "MyreKrig.h"'
  echo 'UseAntBegin'
  for ant in "$@"; do echo "UseAnt($ant)"; done
  echo 'UseAntEnd'
} > "$hold"

gcc $CFLAGS -no-pie "$SRC/MyreKrig.c" "$SRC/MK_Trace.c" "$hold" "${objs[@]}" -o "$out"
rm -f "$hold"
