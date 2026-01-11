/**
 * Claude Code Best Practices Rules
 *
 * Rules focused on effective use of Claude Code features.
 */

import { AnalysisContext } from '../analyzer/context-builder.js';

export interface ClaudeCodeRule {
  id: string;
  name: string;
  description: string;
  condition: (context: AnalysisContext) => boolean;
  suggestion: string;
  reasoning: string;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Check if task appears complex/large
 */
function isLargeTask(context: AnalysisContext): boolean {
  const prompt = context.currentPrompt?.toLowerCase() || '';
  const largeTaskIndicators = [
    'implement',
    'create a',
    'build a',
    'add feature',
    'refactor',
    'migrate',
    'redesign',
    'rewrite',
    'new system',
    'from scratch',
  ];
  return largeTaskIndicators.some((ind) => prompt.includes(ind));
}

/**
 * Check if exploration is needed
 */
function needsExploration(context: AnalysisContext): boolean {
  const prompt = context.currentPrompt?.toLowerCase() || '';
  const explorationIndicators = [
    'where is',
    'find',
    'search for',
    'how does',
    'understand',
    'look for',
    'locate',
    'which file',
    'what files',
  ];
  return explorationIndicators.some((ind) => prompt.includes(ind));
}

/**
 * Check if plan mode was used
 */
function hasUsedPlanMode(context: AnalysisContext): boolean {
  return context.recentMessages.some(
    (m) =>
      m.content.toLowerCase().includes('plan mode') ||
      m.content.toLowerCase().includes('entering plan') ||
      m.content.toLowerCase().includes('let me plan')
  );
}

/**
 * Count recent failures/errors
 */
function countRecentFailures(context: AnalysisContext): number {
  let failures = 0;
  for (const tool of context.recentToolUses.slice(-10)) {
    const output = tool.toolOutput?.toLowerCase() || '';
    if (
      output.includes('error') ||
      output.includes('failed') ||
      output.includes('exception') ||
      output.includes('cannot') ||
      output.includes('not found')
    ) {
      failures++;
    }
  }
  return failures;
}

/**
 * Check if subagent was used
 */
function hasUsedSubagent(context: AnalysisContext): boolean {
  return context.recentToolUses.some((t) => t.toolName === 'Task');
}

/**
 * Check for repetitive patterns
 */
function hasRepetitivePattern(context: AnalysisContext): boolean {
  // Check if similar prompts are being repeated
  const userMessages = context.recentMessages.filter((m) => m.type === 'user');
  if (userMessages.length < 3) return false;

  const recentPrompts = userMessages.slice(-3).map((m) => m.content.toLowerCase());

  // Check for similar structure
  const firstWords = recentPrompts.map((p) => p.split(' ').slice(0, 3).join(' '));
  const uniqueStarts = new Set(firstWords);

  return uniqueStarts.size === 1; // All start the same way
}

export const claudeCodeRules: ClaudeCodeRule[] = [
  {
    id: 'use-plan-mode-for-large-tasks',
    name: 'Use Plan Mode for Large Tasks',
    description: 'Suggest plan mode for complex implementations',
    condition: (ctx) => isLargeTask(ctx) && !hasUsedPlanMode(ctx) && ctx.conversationLength < 10,
    suggestion: 'Consider using Plan mode to design your approach before implementing',
    reasoning: 'Complex tasks benefit from upfront planning to avoid rework',
    priority: 'medium',
  },
  {
    id: 'use-explore-for-search',
    name: 'Use Explore Subagent for Codebase Search',
    description: 'Suggest Explore agent for finding things',
    condition: (ctx) => needsExploration(ctx) && !hasUsedSubagent(ctx),
    suggestion: 'The Explore subagent can efficiently search the codebase for what you need',
    reasoning: 'Explore agents are optimized for codebase discovery',
    priority: 'medium',
  },
  {
    id: 'step-back-after-failures',
    name: 'Step Back After Multiple Failures',
    description: 'Suggest reassessing approach after repeated failures',
    condition: (ctx) => countRecentFailures(ctx) >= 3,
    suggestion: 'Multiple attempts have failed - consider stepping back to reassess the approach',
    reasoning: 'Repeated failures often indicate a fundamental issue with the approach',
    priority: 'high',
  },
  {
    id: 'manage-long-context',
    name: 'Manage Long Conversations',
    description: 'Suggest context management for long sessions',
    condition: (ctx) => ctx.conversationLength > 100,
    suggestion: 'Consider using /compact or starting a fresh session to optimize context',
    reasoning: 'Very long conversations may have degraded context quality',
    priority: 'low',
  },
  {
    id: 'create-skill-for-repetitive',
    name: 'Create Skill for Repetitive Tasks',
    description: 'Suggest creating a skill for repeated patterns',
    condition: (ctx) => hasRepetitivePattern(ctx),
    suggestion: 'You seem to be doing similar tasks repeatedly - consider creating a custom skill',
    reasoning: 'Skills automate repetitive workflows',
    priority: 'low',
  },
  {
    id: 'use-todo-for-multi-step',
    name: 'Use TodoWrite for Multi-Step Tasks',
    description: 'Suggest using TodoWrite for complex tasks',
    condition: (ctx) => {
      const prompt = ctx.currentPrompt?.toLowerCase() || '';
      const multiStepIndicators = ['and then', 'after that', 'steps', 'first', 'multiple'];
      const isMultiStep = multiStepIndicators.some((ind) => prompt.includes(ind));
      return isMultiStep && ctx.conversationLength < 5;
    },
    suggestion: 'This looks like a multi-step task - I\'ll track progress with a todo list',
    reasoning: 'Todo lists help track progress on complex tasks',
    priority: 'low',
  },
];

/**
 * Evaluate Claude Code rules against context
 */
export function evaluateClaudeCodeRules(context: AnalysisContext): ClaudeCodeRule[] {
  return claudeCodeRules.filter((rule) => {
    try {
      return rule.condition(context);
    } catch {
      return false;
    }
  });
}
