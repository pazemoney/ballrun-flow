#!/usr/bin/env bash
# Gera BALL_RUN_WEB_VERCEL.zip só com o necessário para publicar na Vercel (sem node_modules, builds ou projetos nativos).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-deliverables}"; mkdir -p "$OUT"
rm -f "$OUT/BALL_RUN_WEB_VERCEL.zip"
zip -q -r "$OUT/BALL_RUN_WEB_VERCEL.zip" \
  index.html package.json package-lock.json tsconfig.json vite.config.ts vercel.json eslint.config.js playwright.config.ts \
  README.md docs public src tests scripts .gitignore
unzip -l "$OUT/BALL_RUN_WEB_VERCEL.zip" | tail -1
