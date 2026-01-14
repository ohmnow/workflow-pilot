#!/bin/bash
# Test script for the Claude Hero hook
# Simulates the input that Claude Code would provide

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Create a temporary transcript file
TRANSCRIPT_FILE=$(mktemp)
cat > "$TRANSCRIPT_FILE" << 'EOF'
{"type":"user","message":{"role":"user","content":"Help me fix this bug in the login function"}}
{"type":"assistant","message":{"role":"assistant","content":"I'll help you fix that bug."}}
{"type":"tool_use","tool_name":"Edit","tool_input":{"file_path":"/src/auth.ts","old_string":"return false","new_string":"return true"}}
{"type":"tool_result","tool_output":"File edited successfully"}
{"type":"user","message":{"role":"user","content":"Now let's work on the dashboard"}}
EOF

echo "=== Testing UserPromptSubmit Hook ==="
echo ""
echo "Input:"
INPUT_JSON=$(cat << EOF
{
  "session_id": "test-session-123",
  "transcript_path": "$TRANSCRIPT_FILE",
  "prompt": "Now let's work on the dashboard",
  "hook_event_name": "UserPromptSubmit"
}
EOF
)
echo "$INPUT_JSON" | jq .

echo ""
echo "Output:"
echo "$INPUT_JSON" | node "$PROJECT_DIR/dist/index.js"

echo ""
echo "=== Testing PostToolUse Hook ==="
echo ""

INPUT_JSON2=$(cat << EOF
{
  "session_id": "test-session-123",
  "transcript_path": "$TRANSCRIPT_FILE",
  "tool_name": "Edit",
  "tool_input": {"file_path": "/src/auth.ts"},
  "tool_output": "File edited successfully",
  "hook_event_name": "PostToolUse"
}
EOF
)
echo "Input:"
echo "$INPUT_JSON2" | jq .

echo ""
echo "Output:"
echo "$INPUT_JSON2" | node "$PROJECT_DIR/dist/index.js"

# Cleanup
rm -f "$TRANSCRIPT_FILE"

echo ""
echo "=== Test Complete ==="
