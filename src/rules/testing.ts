/**
 * Testing Workflow Rules
 *
 * Rules focused on test coverage and testing best practices.
 */

import { AnalysisContext } from '../analyzer/context-builder.js';

export interface TestingRule {
  id: string;
  name: string;
  description: string;
  condition: (context: AnalysisContext) => boolean;
  suggestion: string;
  reasoning: string;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Detect if code was recently written/edited
 */
function hasRecentCodeChanges(context: AnalysisContext): boolean {
  return context.recentToolUses.some(
    (t) => t.toolName === 'Edit' || t.toolName === 'Write'
  );
}

/**
 * Check if tests have been run recently
 */
function hasRecentTestRun(context: AnalysisContext): boolean {
  return context.lastTestRun !== undefined;
}

/**
 * Check if a bug fix is mentioned
 */
function isBugFix(context: AnalysisContext): boolean {
  const prompt = context.currentPrompt?.toLowerCase() || '';
  const bugKeywords = ['fix', 'bug', 'issue', 'error', 'broken', 'not working'];
  return bugKeywords.some((kw) => prompt.includes(kw));
}

/**
 * Check if about to commit
 */
function isAboutToCommit(context: AnalysisContext): boolean {
  if (context.toolInfo?.name !== 'Bash') return false;
  const command = context.toolInfo.input?.command;
  if (typeof command !== 'string') return false;
  return command.includes('git commit');
}

export const testingRules: TestingRule[] = [
  {
    id: 'test-after-code-changes',
    name: 'Run Tests After Code Changes',
    description: 'Suggest running tests after code has been written or modified',
    condition: (ctx) => hasRecentCodeChanges(ctx) && !hasRecentTestRun(ctx),
    suggestion: 'Consider running tests to verify your changes work correctly',
    reasoning: 'Code was modified without a recent test run',
    priority: 'medium',
  },
  {
    id: 'regression-test-for-bugfix',
    name: 'Add Regression Test for Bug Fix',
    description: 'Suggest adding a test when fixing a bug',
    condition: (ctx) => isBugFix(ctx) && hasRecentCodeChanges(ctx),
    suggestion: 'Consider adding a regression test to prevent this bug from recurring',
    reasoning: 'Bug fixes should include tests to catch regressions',
    priority: 'medium',
  },
  {
    id: 'test-before-commit',
    name: 'Test Before Commit',
    description: 'Ensure tests pass before committing',
    condition: (ctx) => isAboutToCommit(ctx) && !hasRecentTestRun(ctx),
    suggestion: 'Run tests before committing to ensure nothing is broken',
    reasoning: 'Committing without testing risks introducing bugs',
    priority: 'high',
  },
  {
    id: 'test-coverage-reminder',
    name: 'Test Coverage Reminder',
    description: 'Remind about test coverage for new features',
    condition: (ctx) => {
      const prompt = ctx.currentPrompt?.toLowerCase() || '';
      const isNewFeature =
        prompt.includes('add') ||
        prompt.includes('create') ||
        prompt.includes('implement') ||
        prompt.includes('new feature');
      return isNewFeature && ctx.conversationLength > 20 && !hasRecentTestRun(ctx);
    },
    suggestion: 'Remember to add tests for the new functionality',
    reasoning: 'New features should have test coverage',
    priority: 'low',
  },
];

/**
 * Evaluate testing rules against context
 */
export function evaluateTestingRules(context: AnalysisContext): TestingRule[] {
  return testingRules.filter((rule) => {
    try {
      return rule.condition(context);
    } catch {
      return false;
    }
  });
}
