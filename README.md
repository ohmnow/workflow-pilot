# Claude Code Workflow Pilot

An AI-powered Claude Code plugin that monitors conversation context and provides intelligent workflow guidance. Acts as a vigilant senior developer overseeing your coding sessions, helping you ship production-grade apps using professional development practices.

## Features

### Three Operating Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Minimal** | Safety only (critical alerts) | Experienced users who just want guardrails |
| **Training** | Learning assistant with explanations | Users learning Claude Code best practices |
| **Guidance** | "Claude guiding Claude" with context injection | Production development (default) |

### Three-Tier Visual Feedback

- **Critical (Red)** - Security alerts that block dangerous actions
  - Hardcoded secrets detection
  - `git push --force` prevention
  - `.env` file staging warnings

- **Warning (Gold)** - Workflow suggestions injected to Claude
  - Test before commit reminders
  - Commit frequency guidance
  - Plan mode recommendations

- **Info (Blue)** - Educational tips
  - Best practice explanations
  - Claude Code feature highlights

### Smart Triggers

Context-aware suggestions instead of arbitrary message counts:
- Test reminders after 3+ code changes without tests
- Commit reminders after 5+ uncommitted file operations
- Step-back suggestions after multiple failures

### Cooldown System

Time-based throttling prevents alert fatigue:
- Default: 10 minutes between same warning type
- Info tips: 30 minutes between educational content
- Configurable per-rule cooldowns

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

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "node ~/.claude/plugins/workflow-pilot/dist/index.js" }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "node ~/.claude/plugins/workflow-pilot/dist/index.js" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "node ~/.claude/plugins/workflow-pilot/dist/index.js" }]
      }
    ]
  }
}
```

### 3. (Optional) Enable AI Analysis

The plugin works great with rule-based analysis alone. For AI-enhanced suggestions:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Configuration

### Quick Mode Switch

```bash
# Minimal mode - safety only
export WORKFLOW_PILOT_MODE=minimal

# Training mode - learning assistant
export WORKFLOW_PILOT_MODE=training

# Guidance mode - Claude guiding Claude (default)
export WORKFLOW_PILOT_MODE=guidance
```

### Configuration File

Create a config file at one of these locations (in priority order):

1. `$WORKFLOW_PILOT_CONFIG` environment variable path
2. `./config/workflow-pilot.json` (project-specific)
3. `~/.config/workflow-pilot/config.json` (user global)

Example:

```json
{
  "mode": "guidance",

  "tiers": {
    "critical": { "enabled": true },
    "warning": { "enabled": true },
    "info": { "enabled": true }
  },

  "categories": {
    "testing": true,
    "git": true,
    "security": true,
    "claudeCode": true,
    "refactoring": true
  },

  "frequency": {
    "defaultCooldownMinutes": 10,
    "infoCooldownMinutes": 30,
    "perRuleCooldowns": {
      "commit-reminder": 15,
      "test-after-code": 10
    }
  },

  "ai": {
    "enabled": true,
    "model": "claude-sonnet-4-20250514",
    "fallbackToRules": true
  },

  "training": {
    "askIntent": true,
    "explainSuggestions": true,
    "showExamples": true
  }
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `mode` | `"guidance"` | Operating mode: minimal, training, guidance |
| `tiers.*.enabled` | `true` | Enable/disable feedback tiers |
| `categories.*` | `true` | Enable/disable rule categories |
| `frequency.defaultCooldownMinutes` | `10` | Minutes between same warning |
| `frequency.infoCooldownMinutes` | `30` | Minutes between info tips |
| `ai.enabled` | `true` | Use AI analyzer for suggestions |

## How It Works

### Hook Flow

```
User Action → Hook Triggered → Parse Transcript → Build Context
    → Evaluate Rules + AI Analysis → Filter by Config/Cooldowns
    → Visual Output (stderr) + Context Injection (stdout)
```

### Context Injection ("Claude Guiding Claude")

In Guidance mode, suggestions are formatted and injected into Claude's context:

```xml
<workflow-pilot-analysis>
<session-state>
Messages: 45 | Tool uses: 12
Uncommitted work: yes | Last test run: none
</session-state>

<guidance>
**Quality Assurance**: Run tests to verify changes
**Version Control**: Commit your progress
</guidance>
</workflow-pilot-analysis>
```

This enables Claude to naturally incorporate best practices into its responses.

## What It Catches

| Situation | Suggestion |
|-----------|------------|
| Code changes without tests | "Consider running tests to verify your changes" |
| Switching tasks with uncommitted work | "Commit current changes before switching tasks" |
| Complex task started | "Consider using Plan mode to design your approach" |
| Multiple failures | "Consider stepping back to reassess the approach" |
| Long session | "Consider using /compact or starting a fresh session" |
| Codebase exploration needed | "Use the Explore subagent to efficiently search" |
| **Hardcoded secrets** | **BLOCKS** with red alert |
| **git push --force** | **BLOCKS** with red alert |
| **Staging .env files** | **BLOCKS** with red alert |

## Project Structure

```
workflow-pilot/
├── src/
│   ├── index.ts              # Hook entry point, visual output
│   ├── config/
│   │   ├── schema.ts         # TypeScript interfaces
│   │   └── loader.ts         # Config file loading
│   ├── state/
│   │   └── cooldown.ts       # Cooldown tracking
│   ├── analyzer/
│   │   ├── ai-analyzer.ts    # Claude API integration
│   │   ├── context-builder.ts
│   │   └── transcript-parser.ts
│   ├── rules/
│   │   └── index.ts          # Rule definitions & engine
│   └── output/
│       ├── suggestion-formatter.ts
│       └── status-writer.ts
├── hooks/
│   └── hooks.json
├── config/
│   └── default.json
└── progress/                 # Session progress tracking
```

## Development

```bash
npm run build      # Compile TypeScript
npm run watch      # Watch mode
npm test           # Run tests (11 tests)
npm run lint       # Lint code
```

### Debug Mode

```bash
export WORKFLOW_PILOT_DEBUG=1
```

Outputs detailed logs showing input, patterns, rules, and config.

## Rule Categories

| Category | Count | Examples |
|----------|-------|----------|
| **testing** | 3 | Test reminders, test-before-commit |
| **git** | 3 | Commit reminders, commit-before-switch |
| **security** | 4 | Secret detection, dangerous commands |
| **claudeCode** | 6 | Plan mode, subagents, context management |
| **refactoring** | 1 | Refactor after feature completion |

## Roadmap

- [ ] PRD/spec parser for autonomous guidance
- [ ] Integration with GitHub issues/PRs
- [ ] Project-specific rule customization
- [ ] Multi-session state for progress tracking
- [ ] Learning from user corrections

## License

MIT
