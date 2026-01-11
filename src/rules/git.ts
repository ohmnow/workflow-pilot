/**
 * Git Workflow Rules
 *
 * Rules focused on version control best practices.
 */

import { AnalysisContext } from '../analyzer/context-builder.js';

export interface GitRule {
  id: string;
  name: string;
  description: string;
  condition: (context: AnalysisContext) => boolean;
  suggestion: string;
  reasoning: string;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Count recent file modifications
 */
function countRecentEdits(context: AnalysisContext): number {
  return context.recentToolUses.filter(
    (t) => t.toolName === 'Edit' || t.toolName === 'Write'
  ).length;
}

/**
 * Check if switching to a new task
 */
function isSwitchingTasks(context: AnalysisContext): boolean {
  const prompt = context.currentPrompt?.toLowerCase() || '';
  const switchIndicators = [
    'now let\'s',
    'next',
    'switch to',
    'move on to',
    'let\'s work on',
    'can you help with',
    'different',
    'another',
  ];
  return switchIndicators.some((ind) => prompt.includes(ind));
}

/**
 * Check if feature is complete
 */
function isFeatureComplete(context: AnalysisContext): boolean {
  const prompt = context.currentPrompt?.toLowerCase() || '';
  const completionIndicators = [
    'done',
    'finished',
    'complete',
    'that\'s it',
    'looks good',
    'working',
    'ship it',
  ];
  return completionIndicators.some((ind) => prompt.includes(ind));
}

/**
 * Check if on a feature branch (heuristic)
 */
function likelyOnFeatureBranch(context: AnalysisContext): boolean {
  // Check recent bash commands for branch info
  const gitCommands = context.recentToolUses.filter(
    (t) =>
      t.toolName === 'Bash' &&
      typeof t.toolInput?.command === 'string' &&
      t.toolInput.command.includes('git')
  );

  for (const cmd of gitCommands) {
    const output = cmd.toolOutput || '';
    if (
      output.includes('feature/') ||
      output.includes('fix/') ||
      output.includes('feat/') ||
      output.includes('bugfix/')
    ) {
      return true;
    }
  }

  return false;
}

export const gitRules: GitRule[] = [
  {
    id: 'commit-after-significant-changes',
    name: 'Commit After Significant Changes',
    description: 'Suggest committing after multiple file edits',
    condition: (ctx) => {
      const editCount = countRecentEdits(ctx);
      return editCount >= 5 && ctx.hasUncommittedWork;
    },
    suggestion: 'Consider committing your progress - you have several changes',
    reasoning: 'Multiple file edits accumulated without commit',
    priority: 'medium',
  },
  {
    id: 'commit-before-task-switch',
    name: 'Commit Before Switching Tasks',
    description: 'Suggest committing before moving to a different task',
    condition: (ctx) => isSwitchingTasks(ctx) && ctx.hasUncommittedWork,
    suggestion: 'Commit your current changes before switching to a new task',
    reasoning: 'Uncommitted work may be lost or confused when switching contexts',
    priority: 'high',
  },
  {
    id: 'long-session-commit-reminder',
    name: 'Long Session Commit Reminder',
    description: 'Remind to commit during long sessions',
    condition: (ctx) => ctx.conversationLength > 50 && ctx.hasUncommittedWork,
    suggestion: 'You\'ve been working for a while - consider committing to save your progress',
    reasoning: 'Long sessions risk losing work if something goes wrong',
    priority: 'medium',
  },
  {
    id: 'create-pr-after-feature',
    name: 'Create PR After Feature Completion',
    description: 'Suggest creating a PR when feature is done',
    condition: (ctx) =>
      isFeatureComplete(ctx) && ctx.hasUncommittedWork && likelyOnFeatureBranch(ctx),
    suggestion: 'Feature looks complete - consider creating a pull request',
    reasoning: 'Completed features should be reviewed and merged',
    priority: 'low',
  },
  {
    id: 'descriptive-commit-message',
    name: 'Use Descriptive Commit Messages',
    description: 'Encourage good commit messages',
    condition: (ctx) => {
      if (ctx.toolInfo?.name !== 'Bash') return false;
      const command = ctx.toolInfo.input?.command;
      if (typeof command !== 'string') return false;
      // Check for short commit messages
      const match = command.match(/git commit -m ["'](.+?)["']/);
      if (match && match[1].length < 10) {
        return true;
      }
      return false;
    },
    suggestion: 'Consider a more descriptive commit message explaining the "why"',
    reasoning: 'Good commit messages help future debugging and code review',
    priority: 'low',
  },
];

/**
 * Evaluate git rules against context
 */
export function evaluateGitRules(context: AnalysisContext): GitRule[] {
  return gitRules.filter((rule) => {
    try {
      return rule.condition(context);
    } catch {
      return false;
    }
  });
}
