/**
 * Rule Engine
 *
 * Evaluates context against workflow rules to generate suggestions.
 */

import { AnalysisContext, ContextPattern } from '../analyzer/context-builder.js';

export interface RuleSuggestion {
  type: string;
  suggestion: string;
  reasoning?: string;
  priority: 'low' | 'medium' | 'high';
  source: 'rule';
  critical?: boolean;  // If true, show inline to user (not just context injection)
}

interface Rule {
  id: string;
  category: string;
  patterns: string[];
  condition: (context: AnalysisContext) => boolean;
  suggestion: string;
  reasoning: string;
  priority: 'low' | 'medium' | 'high';
  critical?: boolean;  // Show inline to user immediately
}

// Define workflow rules
const rules: Rule[] = [
  // Testing rules
  {
    id: 'test-after-code',
    category: 'testing',
    patterns: ['code-without-tests'],
    condition: (ctx) => ctx.patterns.some((p) => p.type === 'code-without-tests'),
    suggestion: 'Consider running tests to verify your changes',
    reasoning: 'Code changes were made without a recent test run',
    priority: 'medium',
  },
  {
    id: 'test-before-commit',
    category: 'testing',
    patterns: [],
    condition: (ctx) => {
      const isCommitting =
        ctx.toolInfo?.name === 'Bash' &&
        typeof ctx.toolInfo?.input?.command === 'string' &&
        ctx.toolInfo.input.command.includes('git commit');
      return isCommitting && !ctx.lastTestRun;
    },
    suggestion: 'Run tests before committing to catch issues early',
    reasoning: 'About to commit without recent test verification',
    priority: 'high',
  },

  // Git rules
  {
    id: 'commit-reminder',
    category: 'git',
    patterns: ['long-uncommitted-session'],
    condition: (ctx) => ctx.patterns.some((p) => p.type === 'long-uncommitted-session'),
    suggestion: 'Consider committing your progress to save your work',
    reasoning: 'Extended coding session with uncommitted changes',
    priority: 'medium',
  },
  {
    id: 'commit-before-switch',
    category: 'git',
    patterns: [],
    condition: (ctx) => {
      const prompt = ctx.currentPrompt?.toLowerCase() || '';
      const isSwitchingTask =
        prompt.includes('now') ||
        prompt.includes('next') ||
        prompt.includes('switch to') ||
        prompt.includes('let\'s work on');
      return isSwitchingTask && ctx.hasUncommittedWork;
    },
    suggestion: 'Commit current changes before switching tasks',
    reasoning: 'Switching tasks with uncommitted work',
    priority: 'high',
  },

  // Refactoring rules
  {
    id: 'refactor-after-feature',
    category: 'refactoring',
    patterns: [],
    condition: (ctx) => {
      const prompt = ctx.currentPrompt?.toLowerCase() || '';
      const featureComplete =
        prompt.includes('done') ||
        prompt.includes('finished') ||
        prompt.includes('complete');
      return featureComplete && ctx.hasUncommittedWork;
    },
    suggestion: 'Consider a quick refactoring pass before committing',
    reasoning: 'Good time to clean up code after completing a feature',
    priority: 'low',
  },

  // Claude Code best practices
  {
    id: 'use-plan-mode',
    category: 'claude-code',
    patterns: ['large-task-no-plan'],
    condition: (ctx) => ctx.patterns.some((p) => p.type === 'large-task-no-plan'),
    suggestion: 'Consider using Plan mode to design your approach first',
    reasoning: 'Complex task detected - planning helps ensure better outcomes',
    priority: 'medium',
  },
  {
    id: 'use-exploration',
    category: 'claude-code',
    patterns: ['needs-exploration'],
    condition: (ctx) => ctx.patterns.some((p) => p.type === 'needs-exploration'),
    suggestion: 'Use the Explore subagent to efficiently search the codebase',
    reasoning: 'Codebase exploration would help answer your question',
    priority: 'medium',
  },
  {
    id: 'step-back-and-plan',
    category: 'claude-code',
    patterns: ['multiple-failures'],
    condition: (ctx) => ctx.patterns.some((p) => p.type === 'multiple-failures'),
    suggestion: 'Multiple attempts failed - consider stepping back to reassess the approach',
    reasoning: 'Repeated failures suggest a different strategy may be needed',
    priority: 'high',
  },
  {
    id: 'context-management',
    category: 'claude-code',
    patterns: [],
    condition: (ctx) => ctx.conversationLength > 100,
    suggestion: 'Consider using /compact or starting a new session to manage context',
    reasoning: 'Long conversation may benefit from context optimization',
    priority: 'low',
  },

  // Security rules
  {
    id: 'env-vars-for-secrets',
    category: 'security',
    patterns: [],
    condition: (ctx) => {
      const content = ctx.currentPrompt?.toLowerCase() || '';
      return (
        content.includes('api key') ||
        content.includes('password') ||
        content.includes('secret')
      );
    },
    suggestion: 'Remember to use environment variables for sensitive values',
    reasoning: 'Secrets should never be hardcoded in source files',
    priority: 'high',
  },

  // CRITICAL ALERTS - These show inline to user
  {
    id: 'hardcoded-secret-detected',
    category: 'security',
    patterns: [],
    critical: true,
    condition: (ctx) => {
      // Check if writing/editing code with potential secrets
      if (ctx.toolInfo?.name !== 'Edit' && ctx.toolInfo?.name !== 'Write') return false;
      const content = JSON.stringify(ctx.toolInfo?.input || '').toLowerCase();
      const secretPatterns = [
        /sk[-_]live[-_]/i,           // Stripe live keys
        /sk[-_]test[-_]/i,           // Stripe test keys
        /api[-_]?key["']\s*[:=]\s*["'][a-z0-9]{20,}/i,  // Generic API keys
        /password["']\s*[:=]\s*["'][^"']+["']/i,        // Hardcoded passwords
        /secret["']\s*[:=]\s*["'][^"']+["']/i,          // Hardcoded secrets
        /bearer\s+[a-z0-9]{20,}/i,   // Bearer tokens
        /ghp_[a-zA-Z0-9]{36}/,       // GitHub personal access tokens
        /xox[baprs]-[a-zA-Z0-9-]+/,  // Slack tokens
      ];
      return secretPatterns.some(pattern => pattern.test(content));
    },
    suggestion: '⚠️  POTENTIAL SECRET DETECTED - Review before committing!',
    reasoning: 'Code appears to contain hardcoded credentials or API keys',
    priority: 'high',
  },
  {
    id: 'dangerous-git-command',
    category: 'security',
    patterns: [],
    critical: true,
    condition: (ctx) => {
      if (ctx.toolInfo?.name !== 'Bash') return false;
      const cmd = String(ctx.toolInfo?.input?.command || '').toLowerCase();
      const dangerousPatterns = [
        'git push --force',
        'git push -f',
        'git reset --hard',
        'git clean -fd',
        'rm -rf /',
        'rm -rf ~',
        'rm -rf .',
      ];
      return dangerousPatterns.some(pattern => cmd.includes(pattern));
    },
    suggestion: '⚠️  DANGEROUS COMMAND - This could cause data loss!',
    reasoning: 'Destructive command detected that cannot be easily undone',
    priority: 'high',
  },
  {
    id: 'committing-env-file',
    category: 'security',
    patterns: [],
    critical: true,
    condition: (ctx) => {
      if (ctx.toolInfo?.name !== 'Bash') return false;
      const cmd = String(ctx.toolInfo?.input?.command || '');
      const isGitAdd = cmd.includes('git add');
      const hasEnvFile = /\.env(?:\.local|\.prod|\.dev)?(?:\s|$|")/.test(cmd);
      return isGitAdd && hasEnvFile;
    },
    suggestion: '⚠️  ADDING .env FILE TO GIT - This likely contains secrets!',
    reasoning: 'Environment files typically contain sensitive configuration',
    priority: 'high',
  },
];

/**
 * Evaluate all rules against the current context
 */
export function evaluateRules(context: AnalysisContext): RuleSuggestion[] {
  const suggestions: RuleSuggestion[] = [];

  for (const rule of rules) {
    try {
      if (rule.condition(context)) {
        suggestions.push({
          type: rule.category,
          suggestion: rule.suggestion,
          reasoning: rule.reasoning,
          priority: rule.priority,
          source: 'rule',
          critical: rule.critical,
        });
      }
    } catch {
      // Skip rules that error
      continue;
    }
  }

  // Deduplicate and prioritize
  return deduplicateSuggestions(suggestions);
}

/**
 * Remove duplicate suggestions, keeping highest priority
 */
function deduplicateSuggestions(suggestions: RuleSuggestion[]): RuleSuggestion[] {
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  const seen = new Map<string, RuleSuggestion>();

  for (const suggestion of suggestions) {
    const key = suggestion.type;
    const existing = seen.get(key);

    if (!existing || priorityOrder[suggestion.priority] > priorityOrder[existing.priority]) {
      seen.set(key, suggestion);
    }
  }

  return Array.from(seen.values());
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: string): Rule[] {
  return rules.filter((r) => r.category === category);
}

/**
 * Check if a specific rule would trigger
 */
export function wouldTrigger(ruleId: string, context: AnalysisContext): boolean {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return false;

  try {
    return rule.condition(context);
  } catch {
    return false;
  }
}
