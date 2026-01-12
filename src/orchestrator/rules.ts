/**
 * Orchestrator-Specific Rules
 *
 * Rules that only apply when orchestrator mode is active.
 * These enforce the development workflow and provide proactive guidance.
 */

import { AnalysisContext } from '../analyzer/context-builder.js';
import { RuleSuggestion } from '../rules/index.js';
import {
  getOrchestratorContext,
  OrchestratorContext,
} from './index.js';
import {
  calculateEffectiveStatus,
  getReadyFeatures,
  getParallelizableFeatures,
  getSprintProgress,
} from './feature-schema.js';

/**
 * Rule definition for orchestrator mode
 */
interface OrchestratorRule {
  id: string;
  category: string;
  level: 'critical' | 'warning' | 'info';
  condition: (ctx: AnalysisContext, orchCtx: OrchestratorContext) => boolean;
  suggestion: string | ((orchCtx: OrchestratorContext) => string);
  reasoning: string | ((orchCtx: OrchestratorContext) => string);
  priority: 'low' | 'medium' | 'high';
}

/**
 * Orchestrator-specific rules
 */
const orchestratorRules: OrchestratorRule[] = [
  // Feature list missing - critical for development phase
  {
    id: 'orch-missing-feature-list',
    category: 'orchestrator',
    level: 'warning',
    condition: (ctx, orchCtx) => {
      if (!orchCtx.enabled) return false;
      if (!orchCtx.state) return false;
      // Only warn during development/verification phases
      const phase = orchCtx.state.currentPhase;
      return (phase === 'development' || phase === 'verification') && !orchCtx.featureList;
    },
    suggestion: 'Create a feature_list.json to track your development progress',
    reasoning: 'Orchestrator mode works best with a feature list to track blocking dependencies and sprint progress',
    priority: 'high',
  },

  // Blocked feature warning - prevent work on blocked features
  {
    id: 'orch-blocked-feature',
    category: 'orchestrator',
    level: 'warning',
    condition: (ctx, orchCtx) => {
      if (!orchCtx.enabled || !orchCtx.state || !orchCtx.featureList) return false;
      if (orchCtx.state.currentPhase !== 'development') return false;

      const { currentFeatureId } = orchCtx.state;
      if (!currentFeatureId) return false;

      const feature = orchCtx.featureList.features.find(f => f.id === currentFeatureId);
      if (!feature) return false;

      const effectiveStatus = calculateEffectiveStatus(feature, orchCtx.featureList.features);
      return effectiveStatus === 'blocked';
    },
    suggestion: (orchCtx) => {
      const feature = orchCtx.featureList?.features.find(
        f => f.id === orchCtx.state?.currentFeatureId
      );
      if (!feature) return 'Current feature is blocked by dependencies';

      const blockedBy = feature.dependsOn
        .filter(depId => {
          const dep = orchCtx.featureList?.features.find(f => f.id === depId);
          // Include if: dependency doesn't exist (missing), OR is blocking and not passed
          return !dep || (dep.blocking && !dep.passes);
        });

      return `Feature "${feature.name}" is blocked. Complete these first: ${blockedBy.join(', ')}`;
    },
    reasoning: 'Working on blocked features leads to incomplete implementations and integration issues',
    priority: 'high',
  },

  // Sprint boundary warning - encourage focus on current sprint
  {
    id: 'orch-sprint-boundary',
    category: 'orchestrator',
    level: 'info',
    condition: (ctx, orchCtx) => {
      if (!orchCtx.enabled || !orchCtx.state || !orchCtx.featureList) return false;
      if (orchCtx.state.currentPhase !== 'development') return false;

      const currentSprint = orchCtx.state.currentSprint;
      const sprintProgress = getSprintProgress(orchCtx.featureList, currentSprint);

      // Warn if current sprint has unfinished work but user might be looking ahead
      if (sprintProgress.percentage < 100) {
        const prompt = ctx.currentPrompt?.toLowerCase() || '';
        const mentionsFuture = prompt.includes('next sprint') ||
          prompt.includes('sprint ' + (currentSprint + 1)) ||
          prompt.includes('later feature');
        return mentionsFuture;
      }

      return false;
    },
    suggestion: (orchCtx) => {
      const progress = orchCtx.sprintProgress;
      return `Current sprint is ${progress?.percentage}% complete. Consider finishing current features before moving on.`;
    },
    reasoning: 'Focused sprints lead to better completion rates and cleaner code',
    priority: 'low',
  },

  // Verification reminder - prompt tests before marking complete
  {
    id: 'orch-verification-reminder',
    category: 'orchestrator',
    level: 'warning',
    condition: (ctx, orchCtx) => {
      if (!orchCtx.enabled || !orchCtx.state || !orchCtx.featureList) return false;

      // Check if trying to mark a feature as complete/verified
      const prompt = ctx.currentPrompt?.toLowerCase() || '';
      const isMarkingComplete = prompt.includes('mark') && (
        prompt.includes('complete') ||
        prompt.includes('done') ||
        prompt.includes('verified') ||
        prompt.includes('passes')
      );

      if (!isMarkingComplete) return false;

      // Check if tests were run recently
      const recentTestRun = ctx.recentToolUses.some(t => {
        if (t.toolName !== 'Bash') return false;
        const cmd = String(t.toolInput?.command || '').toLowerCase();
        return cmd.includes('test') || cmd.includes('jest') || cmd.includes('vitest');
      });

      return !recentTestRun;
    },
    suggestion: 'Run tests before marking a feature as verified to ensure it passes acceptance criteria',
    reasoning: 'Verification requires passing tests and acceptance criteria',
    priority: 'high',
  },

  // Parallel work available - suggest subagents for non-blocking work
  {
    id: 'orch-parallel-available',
    category: 'orchestrator',
    level: 'info',
    condition: (ctx, orchCtx) => {
      if (!orchCtx.enabled || !orchCtx.state || !orchCtx.featureList) return false;
      if (orchCtx.state.currentPhase !== 'development') return false;

      const parallelizable = getParallelizableFeatures(
        orchCtx.featureList,
        orchCtx.state.currentSprint
      );

      // Only suggest if multiple parallelizable features exist
      return parallelizable.length >= 2;
    },
    suggestion: (orchCtx) => {
      const parallelizable = orchCtx.featureList
        ? getParallelizableFeatures(orchCtx.featureList, orchCtx.state?.currentSprint || 1)
        : [];
      return `${parallelizable.length} non-blocking features can be worked on in parallel using subagents.`;
    },
    reasoning: 'Non-blocking features in the same sprint can be developed simultaneously for faster progress',
    priority: 'low',
  },

  // Production gate - require all checks before deploy
  {
    id: 'orch-production-gate',
    category: 'orchestrator',
    level: 'critical',
    condition: (ctx, orchCtx) => {
      if (!orchCtx.enabled || !orchCtx.state) return false;
      if (orchCtx.state.currentPhase !== 'production') return false;

      // Check if attempting to deploy
      if (ctx.toolInfo?.name !== 'Bash') return false;
      const cmd = String(ctx.toolInfo?.input?.command || '').toLowerCase();
      const isDeploying =
        cmd.includes('vercel') ||
        cmd.includes('netlify deploy') ||
        cmd.includes('firebase deploy') ||
        cmd.includes('npm publish') ||
        cmd.includes('docker push') ||
        cmd.includes('deploy');

      if (!isDeploying) return false;

      // Check if all features are verified
      if (orchCtx.featureList) {
        const unverified = orchCtx.featureList.features.filter(f => !f.passes);
        return unverified.length > 0;
      }

      return false;
    },
    suggestion: (orchCtx) => {
      const unverified = orchCtx.featureList?.features.filter(f => !f.passes) || [];
      return `Cannot deploy: ${unverified.length} feature(s) not verified. Complete verification first.`;
    },
    reasoning: 'Production deployments require all features to pass verification',
    priority: 'high',
  },

  // Ready features available - show what can be worked on
  {
    id: 'orch-ready-features',
    category: 'orchestrator',
    level: 'info',
    condition: (ctx, orchCtx) => {
      if (!orchCtx.enabled || !orchCtx.state || !orchCtx.featureList) return false;
      if (orchCtx.state.currentPhase !== 'development') return false;

      // Show when starting a session or asking what to do
      const prompt = ctx.currentPrompt?.toLowerCase() || '';
      const isAskingWhatsNext = prompt.includes('what') && (
        prompt.includes('next') ||
        prompt.includes('should') ||
        prompt.includes('work on')
      );

      // Or at start of conversation
      const isSessionStart = ctx.conversationLength <= 3;

      if (!isAskingWhatsNext && !isSessionStart) return false;

      const ready = getReadyFeatures(orchCtx.featureList);
      return ready.length > 0;
    },
    suggestion: (orchCtx) => {
      const ready = orchCtx.featureList ? getReadyFeatures(orchCtx.featureList) : [];
      const featureNames = ready.slice(0, 3).map(f => f.name).join(', ');
      return `Ready to work on: ${featureNames}${ready.length > 3 ? ` (+${ready.length - 3} more)` : ''}`;
    },
    reasoning: 'Showing available features helps maintain development momentum',
    priority: 'low',
  },

  // Sprint complete - suggest moving to next sprint or verification
  {
    id: 'orch-sprint-complete',
    category: 'orchestrator',
    level: 'info',
    condition: (ctx, orchCtx) => {
      if (!orchCtx.enabled || !orchCtx.state || !orchCtx.featureList) return false;
      if (orchCtx.state.currentPhase !== 'development') return false;

      const progress = orchCtx.sprintProgress;
      return progress !== null && progress.percentage === 100;
    },
    suggestion: (orchCtx) => {
      const nextSprint = (orchCtx.state?.currentSprint || 1) + 1;
      const hasMoreSprints = orchCtx.featureList?.sprints.some(s => s.number === nextSprint);

      if (hasMoreSprints) {
        return `Sprint ${orchCtx.state?.currentSprint} complete! Ready to advance to Sprint ${nextSprint}.`;
      }
      return 'All sprints complete! Consider moving to verification phase.';
    },
    reasoning: 'Completing a sprint is a milestone - celebrate and plan next steps',
    priority: 'medium',
  },

  // Phase transition suggestion
  {
    id: 'orch-phase-transition',
    category: 'orchestrator',
    level: 'info',
    condition: (ctx, orchCtx) => {
      if (!orchCtx.enabled || !orchCtx.state) return false;

      const phase = orchCtx.state.currentPhase;

      // Suggest transitions based on conditions
      switch (phase) {
        case 'onboarding':
          // Suggest moving to setup after initial discussion
          return ctx.conversationLength >= 5;

        case 'setup':
          // Suggest moving to planning after project setup
          return ctx.recentToolUses.some(t =>
            t.toolName === 'Bash' &&
            String(t.toolInput?.command || '').includes('git init')
          );

        case 'planning':
          // Suggest moving to development after feature list created
          return orchCtx.featureList !== null;

        case 'verification':
          // Suggest moving to production if all verified
          if (!orchCtx.featureList) return false;
          return orchCtx.featureList.features.every(f => f.passes);

        default:
          return false;
      }
    },
    suggestion: (orchCtx) => {
      const phase = orchCtx.state?.currentPhase;
      const transitions: Record<string, string> = {
        onboarding: 'Ready to move to setup phase? Let\'s scaffold the project.',
        setup: 'Project initialized. Ready to move to planning phase?',
        planning: 'Feature list created. Ready to start development?',
        verification: 'All features verified! Ready for production readiness checks?',
      };
      return transitions[phase || 'onboarding'] || 'Consider transitioning to the next phase.';
    },
    reasoning: 'Phase transitions keep the project moving forward systematically',
    priority: 'medium',
  },
];

/**
 * Evaluate orchestrator rules against the current context
 */
export function evaluateOrchestratorRules(context: AnalysisContext): RuleSuggestion[] {
  const orchCtx = getOrchestratorContext();

  if (!orchCtx.enabled) {
    return [];
  }

  const suggestions: RuleSuggestion[] = [];

  for (const rule of orchestratorRules) {
    try {
      if (rule.condition(context, orchCtx)) {
        const suggestion = typeof rule.suggestion === 'function'
          ? rule.suggestion(orchCtx)
          : rule.suggestion;

        const reasoning = typeof rule.reasoning === 'function'
          ? rule.reasoning(orchCtx)
          : rule.reasoning;

        suggestions.push({
          type: rule.category,
          suggestion,
          reasoning,
          priority: rule.priority,
          source: 'rule',
          level: rule.level,
          ruleId: rule.id,
        });
      }
    } catch {
      // Skip rules that error
      continue;
    }
  }

  return suggestions;
}

/**
 * Get all orchestrator rule IDs (for testing/inspection)
 */
export function getOrchestratorRuleIds(): string[] {
  return orchestratorRules.map(r => r.id);
}
