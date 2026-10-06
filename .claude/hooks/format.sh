#!/bin/bash
f=$(jq -r '.tool_input.file_path')
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f "$f" ] || exit 0
[ -x node_modules/.bin/prettier ] || exit 0
pnpm exec prettier --write --ignore-unknown "$f" >/dev/null 2>&1
exit 0
