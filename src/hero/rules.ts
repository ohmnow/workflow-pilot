/**
 * Hero Mode Rules
 *
 * Rules that only apply when hero mode is active.
 * These enforce the development workflow and provide proactive guidance.
 */

import { AnalysisContext } from '../analyzer/context-builder.js';
import { RuleSuggestion } from '../rules/index.js';
import {
  getHeroContext,
  HeroContext,
} from './index.js';
import {
  calculateEffectiveStatus,
  getReadyFeatures,
  getParallelizableFeatures,
  getSprintProgress,
} from './feature-schema.js';

/**
 * Rule definition for hero mode
 */
interface HeroRule {
  id: string;
  category: string;
  level: 'critical' | 'warning' | 'info';
  condition: (ctx: AnalysisContext, heroCtx: HeroContext) => boolean;
  suggestion: string | ((heroCtx: HeroContext) => string);
  reasoning: string | ((heroCtx: HeroContext) => string);
  priority: 'low' | 'medium' | 'high';
}

/**
 * Hero mode rules
 */
const heroRules: HeroRule[] = [
  // Feature list missing - critical for development phase
  {
    id: 'orch-missing-feature-list',
    category: 'hero',
    level: 'warning',
    condition: (ctx, heroCtx) => {
      if (!heroCtx.enabled) return false;
      if (!heroCtx.state) return false;
      // Only warn during development/verification phases
      const phase = heroCtx.state.currentPhase;
      return (phase === 'development' || phase === 'verification') && !heroCtx.featureList;
    },
    suggestion: 'Create a feature_list.json to track your development progress',
    reasoning: 'Hero mode works best with a feature list to track blocking dependencies and sprint progress',
    priority: 'high',
  },

  // Blocked feature warning - prevent work on blocked features
  {
    id: 'orch-blocked-feature',
    category: 'hero',
    level: 'warning',
    condition: (ctx, heroCtx) => {
      if (!heroCtx.enabled || !heroCtx.state || !heroCtx.featureList) return false;
      if (heroCtx.state.currentPhase !== 'development') return false;

      const { currentFeatureId } = heroCtx.state;
      if (!currentFeatureId) return false;

      const feature = heroCtx.featureList.features.find(f => f.id === currentFeatureId);
      if (!feature) return false;

      const effectiveStatus = calculateEffectiveStatus(feature, heroCtx.featureList.features);
      return effectiveStatus === 'blocked';
    },
    suggestion: (heroCtx) => {
      const feature = heroCtx.featureList?.features.find(
        f => f.id === heroCtx.state?.currentFeatureId
      );
      if (!feature) return 'Current feature is blocked by dependencies';

      const blockedBy = feature.dependsOn
        .filter(depId => {
          const dep = heroCtx.featureList?.features.find(f => f.id === depId);
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
    category: 'hero',
    level: 'info',
    condition: (ctx, heroCtx) => {
      if (!heroCtx.enabled || !heroCtx.state || !heroCtx.featureList) return false;
      if (heroCtx.state.currentPhase !== 'development') return false;

      const currentSprint = heroCtx.state.currentSprint;
      const sprintProgress = getSprintProgress(heroCtx.featureList, currentSprint);

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
    suggestion: (heroCtx) => {
      const progress = heroCtx.sprintProgress;
      return `Current sprint is ${progress?.percentage}% complete. Consider finishing current features before moving on.`;
    },
    reasoning: 'Focused sprints lead to better completion rates and cleaner code',
    priority: 'low',
  },

  // Verification reminder - prompt tests before marking complete
  {
    id: 'orch-verification-reminder',
    category: 'hero',
    level: 'warning',
    condition: (ctx, heroCtx) => {
      if (!heroCtx.enabled || !heroCtx.state || !heroCtx.featureList) return false;

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
    category: 'hero',
    level: 'info',
    condition: (ctx, heroCtx) => {
      if (!heroCtx.enabled || !heroCtx.state || !heroCtx.featureList) return false;
      if (heroCtx.state.currentPhase !== 'development') return false;

      const parallelizable = getParallelizableFeatures(
        heroCtx.featureList,
        heroCtx.state.currentSprint
      );

      // Only suggest if multiple parallelizable features exist
      return parallelizable.length >= 2;
    },
    suggestion: (heroCtx) => {
      const parallelizable = heroCtx.featureList
        ? getParallelizableFeatures(heroCtx.featureList, heroCtx.state?.currentSprint || 1)
        : [];
      return `${parallelizable.length} non-blocking features can be worked on in parallel using subagents.`;
    },
    reasoning: 'Non-blocking features in the same sprint can be developed simultaneously for faster progress',
    priority: 'low',
  },

  // Production gate - require all checks before deploy
  {
    id: 'orch-production-gate',
    category: 'hero',
    level: 'critical',
    condition: (ctx, heroCtx) => {
      if (!heroCtx.enabled || !heroCtx.state) return false;
      if (heroCtx.state.currentPhase !== 'production') return false;

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
      if (heroCtx.featureList) {
        const unverified = heroCtx.featureList.features.filter(f => !f.passes);
        return unverified.length > 0;
      }

      return false;
    },
    suggestion: (heroCtx) => {
      const unverified = heroCtx.featureList?.features.filter(f => !f.passes) || [];
      return `Cannot deploy: ${unverified.length} feature(s) not verified. Complete verification first.`;
    },
    reasoning: 'Production deployments require all features to pass verification',
    priority: 'high',
  },

  // Ready features available - show what can be worked on
  {
    id: 'orch-ready-features',
    category: 'hero',
    level: 'info',
    condition: (ctx, heroCtx) => {
      if (!heroCtx.enabled || !heroCtx.state || !heroCtx.featureList) return false;
      if (heroCtx.state.currentPhase !== 'development') return false;

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

      const ready = getReadyFeatures(heroCtx.featureList);
      return ready.length > 0;
    },
    suggestion: (heroCtx) => {
      const ready = heroCtx.featureList ? getReadyFeatures(heroCtx.featureList) : [];
      const featureNames = ready.slice(0, 3).map(f => f.name).join(', ');
      return `Ready to work on: ${featureNames}${ready.length > 3 ? ` (+${ready.length - 3} more)` : ''}`;
    },
    reasoning: 'Showing available features helps maintain development momentum',
    priority: 'low',
  },

  // Sprint complete - suggest moving to next sprint or verification
  {
    id: 'orch-sprint-complete',
    category: 'hero',
    level: 'info',
    condition: (ctx, heroCtx) => {
      if (!heroCtx.enabled || !heroCtx.state || !heroCtx.featureList) return false;
      if (heroCtx.state.currentPhase !== 'development') return false;

      const progress = heroCtx.sprintProgress;
      return progress !== null && progress.percentage === 100;
    },
    suggestion: (heroCtx) => {
      const nextSprint = (heroCtx.state?.currentSprint || 1) + 1;
      const hasMoreSprints = heroCtx.featureList?.sprints.some(s => s.number === nextSprint);

      if (hasMoreSprints) {
        return `Sprint ${heroCtx.state?.currentSprint} complete! Ready to advance to Sprint ${nextSprint}.`;
      }
      return 'All sprints complete! Consider moving to verification phase.';
    },
    reasoning: 'Completing a sprint is a milestone - celebrate and plan next steps',
    priority: 'medium',
  },

  // Phase transition suggestion
  {
    id: 'orch-phase-transition',
    category: 'hero',
    level: 'info',
    condition: (ctx, heroCtx) => {
      if (!heroCtx.enabled || !heroCtx.state) return false;

      const phase = heroCtx.state.currentPhase;

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
          return heroCtx.featureList !== null;

        case 'verification':
          // Suggest moving to production if all verified
          if (!heroCtx.featureList) return false;
          return heroCtx.featureList.features.every(f => f.passes);

        default:
          return false;
      }
    },
    suggestion: (heroCtx) => {
      const phase = heroCtx.state?.currentPhase;
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
 * Evaluate hero rules against the current context
 */
export function evaluateHeroRules(context: AnalysisContext): RuleSuggestion[] {
  const heroCtx = getHeroContext();

  if (!heroCtx.enabled) {
    return [];
  }

  const suggestions: RuleSuggestion[] = [];

  for (const rule of heroRules) {
    try {
      if (rule.condition(context, heroCtx)) {
        const suggestion = typeof rule.suggestion === 'function'
          ? rule.suggestion(heroCtx)
          : rule.suggestion;

        const reasoning = typeof rule.reasoning === 'function'
          ? rule.reasoning(heroCtx)
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
 * Get all hero rule IDs (for testing/inspection)
 */
export function getHeroRuleIds(): string[] {
  return heroRules.map(r => r.id);
}

// Backwards compatibility aliases
/** @deprecated Use evaluateHeroRules instead */
export const evaluateOrchestratorRules = evaluateHeroRules;
/** @deprecated Use getHeroRuleIds instead */
export const getOrchestratorRuleIds = getHeroRuleIds;
