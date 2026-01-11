# Workflow Pilot - Next Session Guide

**Last Updated:** 2026-01-11
**Version:** 0.5.0
**Status:** Production Ready (Training Mode)

---

## Quick Start

```bash
cd "/Users/chris/cc-projects/claude code terminal plugin"
npm run build
npm test -- --run  # Should pass 57 tests
```

---

## Current State Summary

The plugin is now a fully functional MVP with:

### Completed Features
- **Three Operating Modes**: minimal, training, guidance
- **Three-Tier Visual Feedback**: critical (red), warning (gold), info (blue)
- **Configuration System**: JSON config with environment overrides
- **Cooldown System**: Time-based throttling to prevent alert fatigue
- **Smart Triggers**: Context-aware heuristics (not message counts)
- **PreToolUse Hook**: Configured for blocking dangerous commands
- **25 Rules**: Testing, git, security, Claude Code, refactoring, type-safety, error-handling, documentation, production, code-quality
- **AI Integration**: Claude API with fallback to rules-only

### Architecture
```
src/
├── index.ts           # Hook entry point (v0.3.0)
├── config/
│   ├── schema.ts      # TypeScript interfaces
│   └── loader.ts      # Config loading
├── state/
│   └── cooldown.ts    # Cooldown tracking
├── analyzer/          # Context analysis
├── rules/             # Rule definitions
└── output/            # Formatting
```

---

## What to Work On Next

### Priority 1: Verify PreToolUse in Fresh Terminal

**Why:** PreToolUse hook was added but this session started before the hook was configured. Need fresh terminal to test.

**Test:**
```bash
# In a NEW terminal:
git push --force origin test  # Should show red CRITICAL ALERT and block
git add .env                   # Should show red alert
```

**Files:** `src/index.ts:261` (critical alert handling), `src/rules/index.ts:274` (dangerous-git-command rule)

---

### Priority 2: User-Specific Config

**Current:** Config is global or project-level
**Desired:** Per-project customization with rule presets

**Ideas:**
- Detect project type (React, Node, Python)
- Apply relevant rule presets
- Allow `.workflow-pilot.json` in project root

---

### Priority 3: Autonomous Senior Dev Mode

**Vision:** Plugin that can work from specs/PRDs to guide development

**First Steps:**
1. Parse PRD/spec files
2. Extract requirements as checklist
3. Track completion as features are built
4. Suggest next steps based on PRD

**This is a larger feature - consider scoping carefully.**

---

## Key Files Quick Reference

| File | Purpose | Lines |
|------|---------|-------|
| `src/index.ts` | Hook entry, visual output | ~400 |
| `src/rules/index.ts` | Rule definitions | ~360 |
| `src/config/schema.ts` | Config types | ~180 |
| `src/config/loader.ts` | Config loading | ~200 |
| `src/state/cooldown.ts` | Throttling | ~170 |

---

## Environment Variables

```bash
WORKFLOW_PILOT_MODE=guidance    # minimal, training, guidance
WORKFLOW_PILOT_DEBUG=1          # Verbose logging
WORKFLOW_PILOT_CONFIG=/path     # Custom config path
ANTHROPIC_API_KEY=sk-ant-...    # For AI analysis
```

---

## Testing Commands

```bash
npm test -- --run              # Run all tests
npm test -- --watch            # Watch mode
npm run build                  # Compile TypeScript
tail -20 /tmp/workflow-pilot.log  # Check hook activity
cat /tmp/workflow-pilot-state.json  # Check cooldown state
```

---

## Recent Commits

```
325fdb1 Add training mode with deep explanations and examples
6122ee5 Add 8 new workflow rules with comprehensive tests
dd0a127 Update documentation and add next session guide
abb83f0 Add configuration system with three operating modes
f72843e Add progress tracking for session continuity
```

---

## Notes for Next Instance

1. **Training mode complete** - Set `WORKFLOW_PILOT_MODE=training` for educational explanations with each suggestion

2. **57 tests passing** - 25 rule tests + 32 intent matcher tests

3. **Intent matcher added** - New fuzzy matching for detecting user intent (committing secrets, etc.)

4. **PreToolUse needs fresh terminal** - The blocking logic is implemented but needs testing

5. **Cooldowns are working** - Check `/tmp/workflow-pilot-state.json` to see trigger history

6. **User vision:** Wants plugin to eventually work from PRDs/specs as autonomous senior dev

---

## Contact Points

- **Progress files:** `progress/` directory
- **Config:** `config/default.json`
- **Hooks:** `hooks/hooks.json`
- **Main logic:** `src/index.ts`
