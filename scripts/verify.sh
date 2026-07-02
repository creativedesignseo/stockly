#!/usr/bin/env bash
# scripts/verify.sh — Local verification for Stockly.
#
# Runs lint, unit tests, extension bundle build, and Remix build. Does
# NOT deploy and does NOT touch production. Safe to run any time.
#
# Exit codes:
#   0 — all checks that ran, passed
#   1 — one or more checks failed
#   2 — repo layout invariant violated (critical file missing)
#
# Re-run after every meaningful change.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Colours only if stdout is a TTY.
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_BOLD=""; C_RESET=""
fi

say()   { printf "%s\n" "${C_BLUE}▸${C_RESET} $*"; }
ok()    { printf "%s\n" "${C_GREEN}✓${C_RESET} $*"; }
warn()  { printf "%s\n" "${C_YELLOW}⚠${C_RESET} $*"; }
fail()  { printf "%s\n" "${C_RED}✗${C_RESET} $*"; }

FAILED=0
SKIPPED=()

# -----------------------------------------------------------------
# 1. Repo invariants — fail fast if the repo layout is broken.
# -----------------------------------------------------------------
say "${C_BOLD}Checking repo invariants${C_RESET}"

REQUIRED_PATHS=(
  "package.json"
  "shopify.app.toml"
  "prisma/schema.prisma"
  "app/shopify.server.ts"
  "extensions/stockly-volume-discount/src/run.ts"
  "HANDOFF.md"
  "AGENTS.md"
  "CLAUDE.md"
)

MISSING=0
for p in "${REQUIRED_PATHS[@]}"; do
  if [ -e "$p" ]; then
    ok "found $p"
  else
    fail "missing $p"
    MISSING=$((MISSING + 1))
  fi
done

if [ "$MISSING" -gt 0 ]; then
  fail "$MISSING required path(s) missing — repo layout is broken"
  exit 2
fi

# Warn (do not fail) if recommended harness paths are missing.
RECOMMENDED_PATHS=(
  "tasks/current.md"
  "progress/README.md"
  ".claude/agents"
  ".claude/skills"
)
for p in "${RECOMMENDED_PATHS[@]}"; do
  if [ ! -e "$p" ]; then
    warn "harness path missing: $p (not fatal)"
  fi
done

# -----------------------------------------------------------------
# 2. node_modules sanity — verify install has been run.
# -----------------------------------------------------------------
say "${C_BOLD}Checking node_modules${C_RESET}"
if [ ! -d "node_modules" ]; then
  fail "node_modules/ missing — run 'npm install' first"
  exit 1
fi
ok "node_modules/ present"

# -----------------------------------------------------------------
# 3. Helper — run an npm script if it exists; else mark as SKIPPED.
# -----------------------------------------------------------------
run_npm_script() {
  local script="$1"
  if node -e "process.exit(require('./package.json').scripts['$script'] ? 0 : 1)" 2>/dev/null; then
    say "${C_BOLD}Running: npm run $script${C_RESET}"
    if npm run --silent "$script"; then
      ok "$script passed"
    else
      fail "$script failed"
      FAILED=$((FAILED + 1))
    fi
  else
    warn "npm script '$script' not defined in package.json — skipped"
    SKIPPED+=("$script")
  fi
}

# -----------------------------------------------------------------
# 4. Run the checks in order. Continue on failure so the user sees
#    the full picture; final exit code reflects whether any failed.
# -----------------------------------------------------------------
run_npm_script lint

# CRIT-3 (reviewer 2026-05-28): tsc --noEmit catches type errors that
# Remix's loose vite:build silently swallows (the integration commit
# that hid a `version` field type mismatch is the canonical example).
# Run after lint so a quick syntax issue shows up before the slower
# type check.
say "${C_BOLD}Running: tsc --noEmit${C_RESET}"
if npx tsc --noEmit; then
  ok "tsc --noEmit passed"
else
  fail "tsc --noEmit failed"
  FAILED=$((FAILED + 1))
fi

run_npm_script test
run_npm_script test:extensions
run_npm_script build:extensions
run_npm_script build

# -----------------------------------------------------------------
# 5. Summary.
# -----------------------------------------------------------------
echo
say "${C_BOLD}Summary${C_RESET}"
if [ "${#SKIPPED[@]}" -gt 0 ]; then
  warn "skipped (script missing): ${SKIPPED[*]}"
fi

if [ "$FAILED" -gt 0 ]; then
  fail "${FAILED} check(s) failed"
  echo
  echo "Next steps:"
  echo "  • Re-run the failing command in isolation for full output."
  echo "  • Do not run 'fly deploy' or 'shopify app deploy' until green."
  echo "  • If the failure is unrelated to your change, capture it in"
  echo "    tasks/current.md as a blocker and decide before committing."
  exit 1
fi

ok "all checks passed"
exit 0
