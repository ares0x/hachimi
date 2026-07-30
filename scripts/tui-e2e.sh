#!/usr/bin/env bash
# H3.6: PTY / Terminal TUI Automated E2E Regression Harness Script
set -euo pipefail

echo "🧪 Running TUI/CLI Automated E2E Harness Test..."

# Run CLI invocation in mock provider mode
export HACHIMI_PROVIDER=mock
export NODE_ENV=test

pnpm dev:cli "hello"

echo "✅ TUI/CLI Automated E2E Test Completed Successfully!"
