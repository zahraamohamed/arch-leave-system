#!/bin/sh
# Bumps the cache-busting version on every file so browsers never mix old and new code.
# Usage: sh scripts/bump-version.sh
cd "$(dirname "$0")/.." || exit 1
V=$(date +%Y%m%d%H%M)
sed -i '' -E "s/(styles\.css|app\.js)(\?v=[0-9]+)?\"/\1?v=$V\"/g" index.html
sed -i '' -E "s#from \"\./(store|config|rules|excel|notify)\.js(\?v=[0-9]+)?\"#from \"./\1.js?v=$V\"#g" js/*.js
echo "version $V"
