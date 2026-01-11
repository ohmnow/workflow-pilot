# Claude Code Workflow Pilot

An AI-powered Claude Code plugin that monitors your conversation context and provides intelligent workflow guidance to help you ship production-grade apps using professional development practices.

## Features

- **Workflow Guidance** - Suggests testing, commits, and refactoring at appropriate times
- **Claude Code Best Practices** - Guides you on using Plan mode, subagents, and skills effectively
- **AI-Powered Analysis** - Uses Claude API for deep context understanding (optional)
- **Rule-Based Detection** - Fast pattern matching for common workflow triggers
- **Adaptive Verbosity** - Concise tips for routine cases, detailed guidance for complex situations

## Installation

### 1. Clone and Build

```bash
cd ~/.claude/plugins  # or your preferred location
git clone <repository-url> workflow-pilot
cd workflow-pilot
npm install
npm run build
```

### 2. Configure Claude Code Hooks

Add the following to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/plugins/workflow-pilot/dist/index.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/plugins/workflow-pilot/dist/index.js"
          }
        ]
      }
    ]
  }
}
```

### 3. (Optional) Enable AI Analysis

The plugin works great with rule-based analysis alone. For AI-enhanced suggestions, you have two options:

**Option A: API Key (Recommended)**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

**Option B: CLI Fallback (Experimental)**
Uses your existing Claude Code OAuth authentication:
```bash
export WORKFLOW_PILOT_USE_CLI=1
```
Note: CLI has startup overhead that may cause timeouts in hooks.

**Debug Mode:**
```bash
export WORKFLOW_PILOT_DEBUG=1
```

## What It Does

The plugin analyzes your conversation and provides suggestions like:

| Situation | Suggestion |
|-----------|------------|
| Code changes without tests | "Consider running tests to verify your changes" |
| Switching tasks with uncommitted work | "Commit current changes before switching tasks" |
| Complex task started | "Consider using Plan mode to design your approach" |
| Multiple failures | "Consider stepping back to reassess the approach" |
| Long session | "Consider using /compact or starting a fresh session" |
| Codebase exploration needed | "Use the Explore subagent to efficiently search" |

## Configuration

Edit `config/default.json` to customize:

```json
{
  "rules": {
    "testing": { "enabled": true },
    "git": { "enabled": true },
    "refactoring": { "enabled": true },
    "security": { "enabled": true },
    "shipping": { "enabled": true },
    "claudeCode": { "enabled": true }
  },
  "ai": {
    "enabled": true,
    "model": "claude-sonnet-4-20250514"
  },
  "verbosity": "adaptive"
}
```

## Project Structure

```
workflow-pilot/
├── src/
│   ├── index.ts              # Hook entry point
│   ├── analyzer/
│   │   ├── ai-analyzer.ts    # Claude API integration
│   │   ├── context-builder.ts
│   │   └── transcript-parser.ts
│   ├── rules/
│   │   ├── index.ts          # Rule engine
│   │   ├── testing.ts
│   │   ├── git.ts
│   │   └── claude-code.ts
│   ├── knowledge/            # Best practices documentation
│   └── output/
│       └── suggestion-formatter.ts
├── hooks/
│   └── hooks.json
├── prompts/
│   └── workflow-analysis.md
└── config/
    └── default.json
```

## Development

```bash
npm run build      # Compile TypeScript
npm run watch      # Watch mode
npm run test       # Run tests
npm run lint       # Lint code
```

### Testing the Hook

```bash
./scripts/test-hook.sh
```

## Knowledge Base

The plugin includes guides on:

- **Best Practices** - Professional development workflows (`src/knowledge/best-practices.md`)
- **Subagent Usage** - When and how to use Explore, Plan agents (`src/knowledge/subagent-guide.md`)
- **Skills Guide** - Available skills and when to use them (`src/knowledge/skills-guide.md`)
- **Hooks Guide** - Claude Code hook patterns (`src/knowledge/hooks-guide.md`)

## License

MIT
