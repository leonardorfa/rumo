#!/bin/sh
# Gera o site para o GitHub Pages (endereço com /rumo) e publica na branch gh-pages.
# Uso: npm run publicar
set -e
cd "$(dirname "$0")/.."
MSYS_NO_PATHCONV=1 NEXT_PUBLIC_BASE_PATH=/rumo npm run build
touch out/.nojekyll
URL=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -r out/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" commit -q -m "Site $(date '+%d/%m/%Y %H:%M')"
git push -q --force "$URL" gh-pages
cd - >/dev/null
rm -rf "$TMP" out
echo "Publicado: https://leonardorfa.github.io/rumo/"
