# Claude Hero

**Claude Code Hero - Your AI coding copilot that grows with you** - from learning best practices to shipping production code autonomously.

Claude Hero is a Claude Code plugin that acts as a senior developer watching over your shoulder. It catches mistakes before they happen, teaches you professional practices, and when you're ready, becomes a 10x pair programmer that guides complex projects from idea to production.

## The Journey

```
Learning → Guidance → Autonomy
```

| Stage | Mode | What It Does |
|-------|------|--------------|
| **Safety Net** | Minimal | Blocks dangerous commands, lets you work |
| **Learning** | Training | Explains best practices as you code |
| **Daily Driver** | Guidance | Balanced suggestions, context-aware tips |
| **Ship It** | Orchestrator | 10x pair programmer, autonomous guidance |

## Quick Start

```bash
# Clone and build
git clone https://github.com/ohmnow/claude-hero.git
cd claude-hero
npm install && npm run build

# Install hooks into Claude Code
node scripts/install.js
```

**Switch modes anytime with `/wp`:**
```
/wp              → Opens mode selection menu
/wp training     → Enable learning mode
/wp orchestrator → Enable 10x pair programmer
```

## What Makes It Different

### 1. It Learns Your Project

Claude Hero auto-detects your project type and adjusts its guidance:

| Detected | Preset Applied |
|----------|----------------|
| React/Next.js | Frontend best practices |
| Node/Express | Backend patterns |
| TypeScript | Type safety reminders |
| Python/Flask | Python conventions |
| Monorepo | Multi-project awareness |

### 2. It Blocks Disasters

Critical alerts **stop dangerous commands** before they execute:

```
╭────────────────────────────────────────────────────╮
│ 🚨 CRITICAL ALERT                                  │
│                                                    │
│ → Force push to main is blocked                    │
│   This can permanently destroy commit history      │
╰────────────────────────────────────────────────────╯
```

**What it catches:**
- `git push --force` to protected branches
- Committing `.env` files with secrets
- Hardcoded API keys and credentials
- Destructive database commands

### 3. It Guides Without Nagging

Smart cooldowns and context-aware triggers mean you only see suggestions when they matter:

```
╭──────────────────────────────────────────╮
│ ⚠️ Claude Hero                           │
│                                          │
│ ⚠ Consider running tests                 │
│   5 code files changed without test run  │
│ → Commit your progress                   │
│   12 uncommitted changes                 │
╰──────────────────────────────────────────╯
```

### 4. It Becomes Your 10x Pair Programmer

In **Orchestrator mode**, Claude Hero acts as an autonomous senior developer:

- **Proactive planning** - Breaks down complex tasks before you ask
- **PRD tracking** - Parses your spec files and tracks progress
- **Scope monitoring** - Warns when you're drifting from the goal
- **Quality gates** - Ensures tests pass before moving on
- **Context injection** - Feeds guidance directly to Claude

## Four Operating Modes

### Minimal Mode
> "Just keep me safe"

- Only critical security alerts
- Blocks dangerous git operations
- Prevents secret exposure
- Zero noise, maximum protection

### Training Mode
> "Teach me as I code"

- Detailed explanations with every suggestion
- Links to documentation and examples
- Intent capture ("What are you building today?")
- Learn professional practices naturally

### Guidance Mode (Default)
> "Be my senior dev"

- Balanced, actionable suggestions
- Test and commit reminders
- Plan mode recommendations
- Context injection to Claude

### Orchestrator Mode
> "Let's ship this together"

- Full 10x pair programmer experience
- PRD/spec file parsing and tracking
- Autonomous task breakdown
- Phase-aware guidance (planning → building → testing → shipping)
- Proactive next-step suggestions

## Features

### Visual Feedback
Distinctive rounded boxes with golden background make Claude Hero messages instantly recognizable:

- 🚨 **Critical** - Red alerts that block actions
- ⚠️ **Warning** - Workflow suggestions
- 💡 **Tip** - Educational content
- 🎯 **Orchestrator** - Autonomous guidance

### Project Detection
Auto-detects and adapts to:
- React, Next.js, Vue, Angular, Svelte
- Node.js, Express, Fastify
- Python, Django, Flask, FastAPI
- TypeScript projects
- Monorepo structures

### PRD Parser
Parse markdown spec files and track progress:
```markdown
## Requirements
- [ ] User authentication  ← Claude Hero tracks these
- [x] Landing page
- [ ] Dashboard
```

### Smart Triggers
Context-aware, not arbitrary:
- Test reminders after code changes (not random intervals)
- Commit reminders based on actual file operations
- Step-back suggestions after repeated failures

### Cooldown System
Time-based throttling prevents alert fatigue:
- 10 min between same warning type
- 30 min between educational tips
- Configurable per-rule cooldowns

## Configuration

### Project-Level Config
Create `.claude-hero.json` in any project:

```json
{
  "mode": "orchestrator",
  "categories": {
    "testing": true,
    "git": true,
    "security": true
  }
}
```

### Environment Variables
```bash
export CLAUDE_HERO_MODE=orchestrator  # Set mode
export CLAUDE_HERO_DEBUG=1            # Enable debug output
```

### Full Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `mode` | `guidance` | minimal, training, guidance, orchestrator |
| `tiers.*.enabled` | `true` | Enable/disable feedback tiers |
| `categories.*` | `true` | Enable/disable rule categories |
| `frequency.defaultCooldownMinutes` | `10` | Minutes between warnings |

## Installation Details

### Automatic Installation
```bash
node scripts/install.js
```
This adds hooks to `~/.claude/settings.json` automatically.

### Manual Installation
Add to `~/.claude/settings.json`:
```json
{
  "hooks": {
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "node /path/to/claude-hero/dist/index.js"}]}],
    "PreToolUse": [{"matcher": ".*", "hooks": [{"type": "command", "command": "node /path/to/claude-hero/dist/index.js"}]}],
    "PostToolUse": [{"matcher": ".*", "hooks": [{"type": "command", "command": "node /path/to/claude-hero/dist/index.js"}]}]
  }
}
```

## Development

```bash
npm run build      # Compile TypeScript
npm run watch      # Watch mode
npm test           # Run tests (178 tests)
npm run lint       # Lint code
```

### Debug Mode
```bash
export CLAUDE_HERO_DEBUG=1
```

### Project Structure
```
src/
├── index.ts                 # Hook entry point
├── config/
│   ├── loader.ts            # Config loading chain
│   ├── project-detector.ts  # Project type detection
│   └── preset-loader.ts     # Rule presets
├── output/
│   ├── box-formatter.ts     # Visual box rendering
│   └── suggestion-formatter.ts
├── prd/
│   ├── parser.ts            # PRD markdown parser
│   └── tracker.ts           # Progress tracking
├── rules/
│   └── index.ts             # 25 rule definitions
└── orchestrator/
    ├── hooks.ts             # Phase-aware handlers
    └── state.ts             # Session state
```

## What It Catches

| Situation | Response |
|-----------|----------|
| Code without tests | "Run tests to verify changes" |
| Uncommitted work | "Commit progress before switching" |
| Complex task | "Use Plan mode to design approach" |
| Multiple failures | "Step back and reassess" |
| Long session | "Consider /compact" |
| **Force push** | **BLOCKS** |
| **Staging secrets** | **BLOCKS** |
| **Hardcoded keys** | **BLOCKS** |

## Roadmap

- [x] PRD/spec parser for autonomous guidance
- [x] Project-specific rule presets
- [x] 10x Orchestrator mode
- [ ] GitHub Issues/PR integration
- [ ] Multi-session state persistence
- [ ] Learning from user corrections

## License

MIT

---

**Built for developers who want to ship faster without cutting corners.**
