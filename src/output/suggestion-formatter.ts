/**
 * Suggestion Formatter
 *
 * Formats suggestions for injection into Claude's context.
 */

import { AnalysisContext } from '../analyzer/context-builder.js';
import { RuleSuggestion } from '../rules/index.js';
import { AISuggestion } from '../analyzer/ai-analyzer.js';

type Suggestion = RuleSuggestion | AISuggestion;

interface FormatterConfig {
  verbosity: 'concise' | 'detailed' | 'adaptive';
  maxSuggestions: number;
  includeReasoning: boolean;
}

const defaultConfig: FormatterConfig = {
  verbosity: 'adaptive',
  maxSuggestions: 2,
  includeReasoning: true,
};

/**
 * Format suggestions for Claude's context injection
 */
export function formatSuggestion(
  suggestions: Suggestion[],
  context: AnalysisContext,
  config: Partial<FormatterConfig> = {}
): string {
  const cfg = { ...defaultConfig, ...config };

  if (suggestions.length === 0) {
    return '';
  }

  // Sort by priority
  const sorted = sortByPriority(suggestions);

  // Limit to max suggestions
  const limited = sorted.slice(0, cfg.maxSuggestions);

  // Determine effective verbosity
  const verbosity = cfg.verbosity === 'adaptive'
    ? determineVerbosity(context, limited)
    : cfg.verbosity;

  // Format based on verbosity
  if (verbosity === 'concise') {
    return formatConcise(limited);
  } else {
    return formatDetailed(limited, cfg.includeReasoning, context);
  }
}

/**
 * Sort suggestions by priority (high first)
 */
function sortByPriority(suggestions: Suggestion[]): Suggestion[] {
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  return [...suggestions].sort(
    (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]
  );
}

/**
 * Determine verbosity based on context
 */
function determineVerbosity(
  context: AnalysisContext,
  suggestions: Suggestion[]
): 'concise' | 'detailed' {
  // Use detailed for high-priority or multiple failures
  const hasHighPriority = suggestions.some((s) => s.priority === 'high');
  const hasMultipleFailures = context.patterns.some(
    (p) => p.type === 'multiple-failures'
  );

  // Also use detailed for long conversations or when there are multiple suggestions
  const isLongConversation = context.conversationLength > 50;
  const hasMultipleSuggestions = suggestions.length >= 2;

  if (hasHighPriority || hasMultipleFailures || isLongConversation || hasMultipleSuggestions) {
    return 'detailed';
  }

  // Use concise for single routine suggestions
  return 'concise';
}

/**
 * Format suggestions concisely (one-liners)
 */
function formatConcise(suggestions: Suggestion[]): string {
  const lines = suggestions.map((s) => {
    const icon = getPriorityIcon(s.priority);
    return `${icon} ${s.suggestion}`;
  });

  return `[Workflow Pilot] ${lines.join(' | ')}`;
}

/**
 * Format suggestions with details using senior engineer persona
 * This injects rich context for the running Claude to reason about
 */
function formatDetailed(
  suggestions: Suggestion[],
  includeReasoning: boolean,
  context?: import('../analyzer/context-builder.js').AnalysisContext
): string {
  // Group suggestions by theme for more coherent guidance
  const testing = suggestions.filter(s => s.type === 'testing');
  const git = suggestions.filter(s => s.type === 'git');
  const security = suggestions.filter(s => s.type === 'security');
  const claudeCode = suggestions.filter(s => s.type === 'claude-code');
  const other = suggestions.filter(s =>
    !['testing', 'git', 'security', 'claude-code'].includes(s.type)
  );

  const parts: string[] = [];

  // Senior Engineer Voice - contextual guidance with session awareness
  parts.push('<workflow-pilot-analysis>');

  // Include session metrics for Claude to reason about
  if (context) {
    parts.push('<session-state>');
    parts.push(`Messages in conversation: ${context.conversationLength}`);
    parts.push(`Recent tool uses: ${context.recentToolUses.length}`);
    parts.push(`Uncommitted work: ${context.hasUncommittedWork ? 'yes' : 'no'}`);
    parts.push(`Last test run: ${context.lastTestRun ? 'recent' : 'none detected'}`);
    if (context.patterns.length > 0) {
      parts.push(`Detected patterns: ${context.patterns.map(p => p.type).join(', ')}`);
    }
    parts.push('</session-state>');
    parts.push('');
  }

  parts.push('<guidance>');
  parts.push('Based on the session state, consider these best practices:');
  parts.push('');

  if (testing.length > 0) {
    parts.push(`**Quality Assurance**: ${testing.map(s => s.suggestion).join('. ')}`);
    if (includeReasoning && testing[0].reasoning) {
      parts.push(`  → ${testing[0].reasoning}`);
    }
  }

  if (git.length > 0) {
    parts.push(`**Version Control**: ${git.map(s => s.suggestion).join('. ')}`);
    if (includeReasoning && git[0].reasoning) {
      parts.push(`  → ${git[0].reasoning}`);
    }
  }

  if (security.length > 0) {
    parts.push(`**Security**: ${security.map(s => s.suggestion).join('. ')}`);
    if (includeReasoning && security[0].reasoning) {
      parts.push(`  → ${security[0].reasoning}`);
    }
  }

  if (claudeCode.length > 0) {
    parts.push(`**Workflow Optimization**: ${claudeCode.map(s => s.suggestion).join('. ')}`);
    if (includeReasoning && claudeCode[0].reasoning) {
      parts.push(`  → ${claudeCode[0].reasoning}`);
    }
  }

  if (other.length > 0) {
    for (const s of other) {
      parts.push(`**${getCategoryLabel(s.type)}**: ${s.suggestion}`);
      if (includeReasoning && s.reasoning) {
        parts.push(`  → ${s.reasoning}`);
      }
    }
  }

  parts.push('</guidance>');
  parts.push('');
  parts.push('<instruction>Incorporate these considerations naturally. If suggesting code changes, mention testing. If the session is long, consider suggesting /compact.</instruction>');
  parts.push('</workflow-pilot-analysis>');

  return parts.join('\n');
}

/**
 * Get an icon for the priority level
 */
function getPriorityIcon(priority: 'low' | 'medium' | 'high'): string {
  switch (priority) {
    case 'high':
      return '⚠️';
    case 'medium':
      return '💡';
    case 'low':
      return '📝';
  }
}

/**
 * Get a human-readable label for the category
 */
function getCategoryLabel(type: string): string {
  const labels: Record<string, string> = {
    testing: 'Testing',
    git: 'Git Workflow',
    refactoring: 'Refactoring',
    security: 'Security',
    shipping: 'Production',
    'claude-code': 'Best Practice',
  };

  return labels[type] || type;
}

/**
 * Format a single suggestion (for API use)
 */
export function formatSingleSuggestion(suggestion: Suggestion): string {
  return `${getPriorityIcon(suggestion.priority)} ${suggestion.suggestion}`;
}

/**
 * Check if suggestions should be shown (throttling)
 */
export function shouldShowSuggestions(
  context: AnalysisContext,
  lastShownTimestamp?: number
): boolean {
  // Always show high-priority suggestions
  if (context.patterns.some((p) => p.confidence > 0.9)) {
    return true;
  }

  // Throttle low-priority suggestions (max once per 5 minutes)
  if (lastShownTimestamp) {
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - lastShownTimestamp < fiveMinutes) {
      return false;
    }
  }

  return true;
}
