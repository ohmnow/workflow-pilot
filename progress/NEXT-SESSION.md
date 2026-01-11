# Workflow Pilot - Next Session Guide

**Last Updated:** 2026-01-11
**Version:** 0.3.0
**Status:** Production Ready (MVP)

---

## Quick Start

```bash
cd "/Users/chris/cc-projects/claude code terminal plugin"
npm run build
npm test -- --run  # Should pass 11 tests
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
- **17 Rules**: Testing, git, security, Claude Code, refactoring
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

**Files:** `src/index.ts:261` (critical alert handling), `src/rules/index.ts:237` (dangerous-git-command rule)

---

### Priority 2: Training Mode Polish

**What's Done:**
- Intent capture prompt displays at conversation start
- Mode switching works via env var or config

**What's Missing:**
- Training mode explanations aren't yet integrated into suggestions
- No "why" explanations attached to warnings
- No examples shown with tips

**Files to Modify:**
- `src/output/suggestion-formatter.ts` - Add training mode explanations
- `src/rules/index.ts` - Add `explanation` field to rules

---

### Priority 3: Expand Rule Coverage

**High Value Rules to Add:**
1. **Type safety** - Suggest TypeScript for JS files
2. **Error handling** - Detect missing try/catch
3. **PR readiness** - Check before creating PR
4. **Dependency updates** - Suggest npm audit
5. **Documentation** - Suggest JSDoc for public APIs

**Files:** `src/rules/index.ts`

---

### Priority 4: User-Specific Config

**Current:** Config is global or project-level
**Desired:** Per-project customization with rule presets

**Ideas:**
- Detect project type (React, Node, Python)
- Apply relevant rule presets
- Allow `.workflow-pilot.json` in project root

---

### Priority 5: Autonomous Senior Dev Mode

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
abb83f0 Add configuration system with three operating modes
f72843e Add progress tracking for session continuity
f496cdd Add PreToolUse hook for blocking dangerous commands
ece55c6 Add three-tier visual feedback system
```

---

## Notes for Next Instance

1. **PreToolUse needs fresh terminal** - The blocking logic is implemented but needs testing

2. **Cooldowns are working** - Check `/tmp/workflow-pilot-state.json` to see trigger history

3. **Config system is flexible** - Can override via env vars for quick testing

4. **Tests are comprehensive** - All 11 pass, covering rules and deduplication

5. **User vision:** Wants plugin to eventually work from PRDs/specs as autonomous senior dev

---

## Contact Points

- **Progress files:** `progress/` directory
- **Config:** `config/default.json`
- **Hooks:** `hooks/hooks.json`
- **Main logic:** `src/index.ts`
