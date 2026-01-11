# Claude Code Hooks Guide

Hooks are shell commands that execute at specific points in Claude Code's lifecycle. They enable powerful automation and integration capabilities.

---

## Hook Events

### UserPromptSubmit
**Triggers:** When the user submits a prompt, before Claude processes it

**Use cases:**
- Validate or transform user input
- Add context to the conversation
- Log user activity
- Enforce policies

**Input received:**
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/session.jsonl",
  "prompt": "user's prompt text",
  "hook_event_name": "UserPromptSubmit"
}
```

---

### PreToolUse
**Triggers:** Before Claude executes a tool

**Use cases:**
- Validate tool parameters
- Block dangerous operations
- Add audit logging
- Modify tool behavior

**Input received:**
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/session.jsonl",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf /" },
  "hook_event_name": "PreToolUse"
}
```

---

### PostToolUse
**Triggers:** After a tool completes execution

**Use cases:**
- Analyze tool results
- Trigger follow-up actions
- Log tool usage
- Provide feedback

**Input received:**
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/session.jsonl",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "tool_output": "All tests passed",
  "hook_event_name": "PostToolUse"
}
```

---

### Stop
**Triggers:** When Claude finishes responding

**Use cases:**
- End-of-turn analysis
- Summary generation
- Session logging
- Cleanup tasks

---

### SessionStart / SessionEnd
**Triggers:** At session boundaries

**Use cases:**
- Initialize state
- Load context
- Save session data
- Cleanup resources

---

## Hook Configuration

### hooks.json Format
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/hook.js"
          }
        ]
      }
    ]
  }
}
```

### Matcher Patterns
- `.*` - Match everything
- `specific text` - Match specific content
- `regex pattern` - Match regex patterns

---

## Hook Output

### Adding Context
Return JSON to add context to Claude's conversation:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Your suggestion or context here"
  }
}
```

### Exit Codes
- `0` - Success, continue normally
- `1` - Error, but continue
- `2` - Block the action (for Pre hooks)

---

## Best Practices

### 1. Keep Hooks Fast
Hooks run synchronously with a 60-second timeout. Keep them quick:
- Avoid heavy computation
- Use async operations sparingly
- Cache when possible

### 2. Fail Gracefully
Hooks shouldn't break the user experience:
- Catch all errors
- Log failures for debugging
- Exit 0 to allow continuation

### 3. Be Non-Intrusive
Hooks should enhance, not disrupt:
- Don't add noise to every interaction
- Reserve suggestions for meaningful moments
- Respect user flow

### 4. Use Environment Variables
Access hook context via environment:
- `CLAUDE_PLUGIN_ROOT` - Plugin directory
- Session info via stdin JSON

---

## Common Patterns

### Pattern: Workflow Guidance
```javascript
// Read context
const input = JSON.parse(await readStdin());

// Analyze transcript
const transcript = await parseTranscript(input.transcript_path);

// Generate suggestions
const suggestions = analyze(transcript, input.prompt);

// Output context
if (suggestions.length > 0) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: input.hook_event_name,
      additionalContext: formatSuggestions(suggestions)
    }
  }));
}
```

### Pattern: Tool Validation
```javascript
// PreToolUse hook
if (input.tool_name === 'Bash') {
  const command = input.tool_input.command;
  if (isDangerous(command)) {
    console.error('Blocked dangerous command');
    process.exit(2); // Block the action
  }
}
```

### Pattern: Audit Logging
```javascript
// PostToolUse hook
await appendToLog({
  timestamp: new Date().toISOString(),
  session: input.session_id,
  tool: input.tool_name,
  input: input.tool_input,
  output: input.tool_output
});
```

---

## Debugging Hooks

### Enable Verbose Logging
Add logging to your hook:
```javascript
console.error('Hook received:', JSON.stringify(input, null, 2));
```

### Test Standalone
Run your hook manually:
```bash
echo '{"session_id":"test","prompt":"hello"}' | node hook.js
```

### Check Exit Codes
Ensure correct exit codes for your use case.

---

## Security Considerations

1. **Validate Input** - Don't trust stdin blindly
2. **Sanitize Paths** - Validate file paths
3. **Limit Scope** - Only access what's needed
4. **Log Sensitively** - Don't log secrets
5. **Handle Errors** - Never expose stack traces
