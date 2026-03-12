#!/bin/bash
# pre-commit-check.sh — Block commits if TypeScript compilation fails
# This runs as a Claude Code PreToolUse hook on Bash commands.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept git commit commands
if [[ ! "$COMMAND" =~ git\ commit ]]; then
  exit 0
fi

# Run TypeScript checks for app
echo "Running TypeScript check for app..." >&2
cd /Users/johnschrup/resume-agent/app
if ! npx tsc --noEmit 2>&1 >&2; then
  echo "BLOCKED: TypeScript compilation failed in app/. Fix errors before committing." >&2
  exit 2
fi

# Run TypeScript checks for server
echo "Running TypeScript check for server..." >&2
cd /Users/johnschrup/resume-agent/server
if ! npx tsc --noEmit 2>&1 >&2; then
  echo "BLOCKED: TypeScript compilation failed in server/. Fix errors before committing." >&2
  exit 2
fi

echo "TypeScript checks passed." >&2
exit 0
