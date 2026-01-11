# Subagent Usage Guide

Subagents are specialized Claude instances that can be spawned to handle specific types of tasks. Using them effectively can dramatically improve your productivity.

---

## Available Subagent Types

### Explore Agent
**Purpose:** Fast codebase exploration and search

**Use when:**
- You need to find files matching a pattern
- You want to understand how something works
- You're searching for existing implementations
- You need to map out architecture

**Example prompts:**
- "Find all React components that handle user authentication"
- "How does the payment processing flow work?"
- "What files would I need to modify to add a new API endpoint?"
- "Search for where error handling is implemented"

**Thoroughness levels:**
- `quick` - Basic search, fast results
- `medium` - Moderate exploration
- `very thorough` - Comprehensive analysis

### Plan Agent
**Purpose:** Design implementation strategies

**Use when:**
- You're starting a complex feature
- You need to evaluate different approaches
- You want a step-by-step implementation plan
- You're unsure about architecture decisions

**Example prompts:**
- "Plan how to implement user authentication with OAuth"
- "Design the data model for a multi-tenant system"
- "What's the best approach to refactor the payment module?"

### General-Purpose Agent
**Purpose:** Complex, multi-step tasks

**Use when:**
- The task requires multiple types of operations
- You need research combined with action
- The scope is broad and unclear

### Feature Development Agents
**Specialized agents for feature work:**

- **code-architect** - Designs feature architectures
- **code-explorer** - Deep analysis of existing features
- **code-reviewer** - Reviews code for issues

---

## When to Use Subagents vs Direct Work

### Use Subagents When:
✅ The search space is large (many files/directories)
✅ You need to understand existing patterns first
✅ The task benefits from focused exploration
✅ You want to parallelize work
✅ You need a fresh perspective on a problem

### Work Directly When:
✅ You know exactly which file to edit
✅ The task is straightforward
✅ You're making a small, focused change
✅ Context is already loaded

---

## Effective Subagent Prompts

### Be Specific About Goals
```
❌ "Look at the codebase"
✅ "Find all API endpoints that handle user data and identify their authentication methods"
```

### Specify Scope
```
❌ "Search for tests"
✅ "Find integration tests in the payments module that test refund functionality"
```

### Request Actionable Output
```
❌ "Understand the auth system"
✅ "Map the authentication flow from login to session creation, listing the key files involved"
```

---

## Parallel Subagent Usage

You can launch multiple subagents in parallel when tasks are independent:

**Good for parallelization:**
- Searching different parts of the codebase
- Exploring multiple approaches simultaneously
- Gathering information from different sources

**Example:** When planning a new feature, you might:
1. Agent 1: Explore existing similar features
2. Agent 2: Search for relevant tests
3. Agent 3: Identify integration points

---

## Subagent Best Practices

### 1. Provide Context
Tell the agent what you're ultimately trying to accomplish, not just the immediate task.

### 2. Be Specific About Depth
Use thoroughness levels appropriately:
- Use `quick` for simple lookups
- Use `thorough` for architectural understanding

### 3. Review and Integrate Results
Subagent results inform your decisions - review them before proceeding.

### 4. Don't Over-Parallelize
More agents isn't always better. Use the minimum needed for the task.

### 5. Trust But Verify
Subagent findings are generally reliable, but verify critical information.

---

## Common Patterns

### Pattern: Understand Before Changing
```
1. Launch Explore agent to understand current implementation
2. Review findings
3. Launch Plan agent to design changes
4. Execute the plan
```

### Pattern: Multi-Area Search
```
1. Launch parallel Explore agents for different areas
2. Synthesize findings
3. Proceed with implementation
```

### Pattern: Architecture Discovery
```
1. Launch thorough Explore agent
2. Map dependencies and flows
3. Document findings in CLAUDE.md
```
