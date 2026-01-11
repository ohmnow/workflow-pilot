# Skills Usage Guide

Skills extend Claude Code's capabilities with specialized knowledge, workflows, and tool integrations. This guide covers how to use existing skills effectively and when to create custom ones.

---

## Built-in Skills

### Development Workflow Skills

#### `/commit`
**Purpose:** Create well-structured git commits

**When to use:**
- After completing a logical unit of work
- When you want a proper commit message
- To ensure commit best practices

**What it does:**
- Reviews staged changes
- Generates descriptive commit message
- Follows conventional commit format

---

#### `/refactor`
**Purpose:** Systematic code refactoring

**When to use:**
- After feature completion
- When code has grown complex
- To improve code quality

**What it does:**
- Analyzes code for improvement opportunities
- Suggests specific refactoring actions
- Maintains test coverage

---

#### `/pr-review`
**Purpose:** Review pull requests

**When to use:**
- Before merging any PR
- For self-review of your own code
- To catch issues before they ship

**What it does:**
- Reviews code for bugs and issues
- Checks for security vulnerabilities
- Evaluates code quality

---

#### `/tdd`
**Purpose:** Test-driven development workflow

**When to use:**
- Starting a new feature
- When test coverage is critical
- For complex business logic

**What it does:**
- Guides test-first development
- Ensures tests are written before code
- Maintains red-green-refactor cycle

---

### Document Skills

#### `/pdf`
**Purpose:** PDF manipulation

**When to use:** Creating, editing, or extracting from PDFs

#### `/xlsx`
**Purpose:** Spreadsheet operations

**When to use:** Working with Excel files

#### `/docx`
**Purpose:** Word document handling

**When to use:** Creating or editing documents

#### `/pptx`
**Purpose:** Presentation creation

**When to use:** Building slide decks

---

### Design Skills

#### `/frontend-design`
**Purpose:** Create production-grade UI

**When to use:**
- Building web components
- Creating landing pages
- Designing dashboards

**What it does:**
- Generates creative, polished designs
- Avoids generic AI aesthetics
- Produces production-ready code

---

## When to Use Skills

### Use a Skill When:
✅ There's a skill that matches your task
✅ You want consistent, high-quality output
✅ The task follows a repeatable pattern
✅ You want to leverage specialized knowledge

### Work Directly When:
✅ The task is simple and straightforward
✅ No relevant skill exists
✅ You need maximum flexibility
✅ The task is highly custom

---

## Creating Custom Skills

### When to Create a Skill

Create a custom skill when you find yourself:
- Repeating the same type of task
- Following a specific workflow repeatedly
- Needing domain-specific knowledge applied consistently
- Wanting to encode team conventions

### Skill Structure

Skills are markdown files in `~/.claude/skills/` with:

```markdown
---
name: my-skill
description: What this skill does
trigger: When to use it
---

# Skill Instructions

Detailed instructions for Claude...
```

### Best Practices for Custom Skills

1. **Be specific** - Narrow scope is better than broad
2. **Include examples** - Show what good output looks like
3. **Define triggers** - When should this skill activate?
4. **Test thoroughly** - Try various inputs
5. **Iterate** - Refine based on results

---

## Skill Invocation Patterns

### Explicit Invocation
```
/commit
```
Directly run the skill.

### Contextual Use
Some skills auto-activate based on context (if configured).

### With Arguments
```
/pr-review 123
```
Pass arguments to the skill.

---

## Combining Skills and Subagents

Skills and subagents complement each other:

| Need | Use |
|------|-----|
| Execute a known workflow | Skill |
| Explore unknown territory | Subagent |
| Follow established patterns | Skill |
| Design new approaches | Subagent |
| Repetitive task | Skill |
| One-off complex task | Subagent |

### Example Workflow
```
1. Use Explore subagent to understand the codebase
2. Use Plan subagent to design the feature
3. Implement the feature
4. Use /pr-review skill to review
5. Use /commit skill to commit
```

---

## Quick Reference

| Skill | Use For |
|-------|---------|
| `/commit` | Creating commits |
| `/refactor` | Code improvement |
| `/pr-review` | Code review |
| `/tdd` | Test-driven development |
| `/frontend-design` | UI creation |
| `/pdf` | PDF operations |
| `/xlsx` | Spreadsheet work |
| `/docx` | Document creation |
