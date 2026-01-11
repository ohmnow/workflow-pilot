# Workflow Pilot - Test Plan

**Version:** 0.7.0
**Date:** 2026-01-11
**Test Count:** 173 automated tests

---

## Automated Test Summary

| Test Suite | Tests | Status |
|------------|-------|--------|
| install.test.js | 19 | PASS |
| intent-matcher.test.ts | 44 | PASS |
| rules/index.test.ts | 25 | PASS |
| file-classifier.test.ts | 38 | PASS |
| project-detector.test.ts | 25 | PASS |
| prd/parser.test.ts | 22 | PASS |
| **Total** | **173** | **PASS** |

---

## Manual Test Plan

### 1. Project Config Loading

#### Test 1.1: Load .workflow-pilot.json from project root
```bash
# Setup
echo '{"mode": "minimal"}' > .workflow-pilot.json
export WORKFLOW_PILOT_DEBUG=1

# Run Claude Code and check debug output shows config loaded
# Expected: "[WP Debug] Loaded config from: .workflow-pilot.json"

# Cleanup
rm .workflow-pilot.json
```

#### Test 1.2: Config precedence (env > project root > user global)
```bash
# Create project config
echo '{"mode": "training"}' > .workflow-pilot.json
export WORKFLOW_PILOT_MODE=guidance

# Expected: Mode should be 'guidance' (env override wins)
```

---

### 2. Project Type Detection

#### Test 2.1: React project detection
```bash
# In a directory with package.json containing react
export WORKFLOW_PILOT_DEBUG=1
# Run plugin
# Expected: "[WP Debug] Detected project type: react"
```

#### Test 2.2: Python project detection
```bash
# Create requirements.txt with flask
echo "flask==2.0.0" > requirements.txt
# Run plugin
# Expected: "[WP Debug] Detected project type: python-flask"
```

#### Test 2.3: TypeScript detection
```bash
# Check tsconfig.json presence
# Expected: ProjectInfo.typescript = true
```

---

### 3. File Classification

#### Test 3.1: Code vs Config distinction
```bash
# Edit src/index.ts -> should trigger test reminder
# Edit package.json -> should NOT trigger test reminder
# Edit README.md -> should NOT trigger test reminder
```

#### Test 3.2: Sensitive file detection
```bash
# Attempt git add .env -> should BLOCK
# Attempt git add .env.example -> should ALLOW
```

---

### 4. Smart Test Filtering

#### Test 4.1: Config-only changes
```bash
# Scenario: Only edit .gitignore, package.json, README.md
# Expected: No "run tests" reminder
```

#### Test 4.2: Mixed changes with code
```bash
# Scenario: Edit README.md AND src/index.ts
# Expected: "run tests" reminder triggered
```

---

### 5. PRD Parser

#### Test 5.1: Parse markdown PRD
```bash
# Create PRD.md with:
# ## Requirements
# - [ ] Feature 1
# - [x] Feature 2
#
# Run parser and verify extraction
```

#### Test 5.2: Track progress
```bash
# Parse PRD, mark items complete
# Verify .workflow-pilot-progress.json updated
```

---

### 6. Hook Behavior

#### Test 6.1: UserPromptSubmit hook
```bash
# Start Claude Code session
# Submit prompt
# Verify hook output appears
```

#### Test 6.2: PreToolUse blocking
```bash
# Attempt: git push --force origin main
# Expected: CRITICAL ALERT, command blocked (exit code 2)
```

#### Test 6.3: PostToolUse feedback
```bash
# After Write tool completes
# Verify appropriate suggestions appear
```

---

### 7. Mode Behavior

#### Test 7.1: Minimal mode
```bash
export WORKFLOW_PILOT_MODE=minimal
# Expected: Only critical alerts, no info tips
```

#### Test 7.2: Training mode
```bash
export WORKFLOW_PILOT_MODE=training
# Expected: All tiers enabled, explanations included
```

#### Test 7.3: Guidance mode (default)
```bash
export WORKFLOW_PILOT_MODE=guidance
# Expected: All tiers enabled, concise output
```

---

### 8. Cooldown System

#### Test 8.1: Rule cooldown
```bash
# Trigger same rule twice within cooldown period
# Second trigger should be suppressed
```

#### Test 8.2: State persistence
```bash
# Check /tmp/workflow-pilot-state.json exists
# Verify lastTriggered timestamps
```

---

## Integration Test Scenarios

### Scenario A: New React Project
1. Create new React project with `create-react-app`
2. Start Claude Code
3. Verify: React project detected
4. Verify: Frontend preset would be applied
5. Edit App.tsx, verify test reminder triggered

### Scenario B: Python Flask API
1. Create new Flask project
2. Add requirements.txt with flask
3. Start Claude Code
4. Verify: Python-Flask detected
5. Verify: Python preset would be applied

### Scenario C: Full Development Session
1. Create .workflow-pilot.json with custom settings
2. Create PRD.md with requirements
3. Start coding session
4. Verify config loaded
5. Verify PRD progress tracking
6. Test dangerous command blocking
7. Complete feature, verify test reminder

---

## Performance Tests

### Test P1: Startup time
```bash
time node dist/index.js
# Expected: < 100ms
```

### Test P2: Large PRD parsing
```bash
# Create PRD with 100+ requirements
# Verify parsing completes in < 1s
```

---

## Regression Tests

After any code changes, run:
```bash
npm test -- --run
```

All 173 tests must pass.

---

## Sign-off Checklist

- [ ] All automated tests pass (173/173)
- [ ] Manual hook tests verified
- [ ] Mode switching works correctly
- [ ] Dangerous command blocking works
- [ ] Config loading priority correct
- [ ] Project detection accurate
- [ ] File classification correct
- [ ] Cooldown system functional
