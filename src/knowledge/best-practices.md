# Best Practices for Solo Developers with Claude Code

This guide captures professional development practices optimized for solo developers using agentic coding with Claude Code.

## Core Philosophy

**Ship production-grade software faster by leveraging AI autonomy while maintaining professional standards.**

The key is finding the balance between:
- Letting Claude Code work autonomously
- Maintaining quality gates (tests, reviews, security)
- Building sustainable, maintainable codebases

---

## Development Workflow

### 1. Start with Planning

**Before coding, plan the approach:**
- Use Plan mode for any task touching 3+ files
- Break complex features into subtasks
- Identify dependencies and order of operations
- Consider edge cases upfront

**Why:** Planning prevents wasted work and ensures Claude understands the full context.

### 2. Work in Small Increments

**Keep changes focused and testable:**
- One logical change per commit
- Run tests after each significant change
- Commit frequently (every 15-30 minutes of work)
- Use descriptive commit messages

**Why:** Small increments are easier to debug, review, and rollback.

### 3. Test as You Go

**Maintain test coverage throughout:**
- Write tests before or alongside code (TDD when appropriate)
- Run the test suite after every code change
- Add regression tests for every bug fix
- Don't skip tests to "save time"

**Why:** Tests catch issues early when they're cheap to fix.

### 4. Commit Early and Often

**Treat commits as save points:**
- Commit before switching tasks
- Commit before risky refactors
- Commit after completing any logical unit
- Use branches for experimental work

**Why:** Commits protect your work and make collaboration/rollback possible.

---

## Claude Code Mastery

### Using Plan Mode Effectively

**When to use Plan mode:**
- New features with unclear implementation
- Refactoring that touches multiple files
- Architectural decisions
- When you're not sure where to start

**How to use it:**
1. Describe your goal clearly
2. Let Claude explore the codebase
3. Review the proposed approach
4. Ask questions before approving
5. Exit plan mode to execute

### Leveraging Subagents

**Explore subagent:**
- Finding files by pattern
- Understanding codebase structure
- Searching for existing implementations
- Discovering how features work

**Plan subagent:**
- Designing implementation approaches
- Evaluating trade-offs
- Creating step-by-step plans

**Use subagents when:**
- The search space is large
- You need multiple perspectives
- The task is complex enough to parallelize

### Using Skills

**Available skills to leverage:**
- `/refactor` - Systematic code refactoring
- `/pr-review` - Code review before merge
- `/tdd` - Test-driven development workflow
- `/commit` - Proper commit workflow

**Create custom skills for:**
- Repetitive tasks in your project
- Team-specific workflows
- Domain-specific operations

### Context Management

**Keep context healthy:**
- Use `/compact` when context gets large
- Start new sessions for unrelated tasks
- Use CLAUDE.md to maintain project context
- Keep prompts focused and specific

---

## Production Readiness Checklist

### Before Shipping Any Feature

- [ ] All tests passing
- [ ] No hardcoded secrets or credentials
- [ ] Error handling for edge cases
- [ ] Input validation at boundaries
- [ ] Logging for debugging
- [ ] Documentation updated

### Security Essentials

- [ ] Environment variables for secrets
- [ ] Parameterized queries (no SQL injection)
- [ ] Input sanitization
- [ ] Authentication on protected routes
- [ ] HTTPS for all external calls

### Code Quality

- [ ] No obvious code duplication
- [ ] Functions under ~50 lines
- [ ] Clear naming conventions
- [ ] Comments only where logic isn't obvious

---

## Anti-Patterns to Avoid

### 1. "I'll Add Tests Later"
Tests written later are often never written. Write them now.

### 2. "Just One More Change Before Committing"
Commit what you have. You can always make another commit.

### 3. "Claude Will Figure It Out"
Provide clear context. Vague prompts lead to vague results.

### 4. "This Session Is Fine"
Long sessions accumulate context noise. Fresh sessions for fresh tasks.

### 5. "Skip the Plan, Just Code"
Planning prevents rework. Five minutes of planning saves hours of debugging.

---

## Quick Reference

| Situation | Action |
|-----------|--------|
| Starting a new feature | Use Plan mode first |
| Code changes made | Run tests |
| Tests pass | Commit your work |
| Task complete | Consider refactoring pass |
| Switching tasks | Commit first |
| Multiple failures | Step back and plan |
| Searching codebase | Use Explore subagent |
| Long conversation | Use /compact or new session |
| Repetitive task | Consider creating a skill |
