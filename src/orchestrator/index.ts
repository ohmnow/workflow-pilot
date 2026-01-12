/**
 * Orchestrator Mode - Main Entry Point
 *
 * The orchestrator mode acts as a "10X Pair Programmer" that guides users
 * from idea to production-ready app using Anthropic's proven patterns:
 *
 * - Feature list with pass/fail tracking
 * - Ralph Wiggum technique for persistent iteration
 * - Two-agent pattern (initializer + coder)
 * - Sprint-like development cycles
 *
 * @module orchestrator
 */

// Re-export types and utilities
export * from './phases.js';
export * from './feature-schema.js';
export * from './state.js';
export * from './autopilot-config.js';

import { getMode } from '../config/loader.js';
import {
  loadState,
  initializeState,
  hasOrchestratorState,
  loadFeatureList,
  OrchestratorState,
} from './state.js';
import {
  DevelopmentPhase,
  getPhaseEmoji,
  getPhaseProgress,
} from './phases.js';
import { FeatureList, getSprintProgress } from './feature-schema.js';

/**
 * Check if orchestrator mode is currently active
 */
export function isOrchestratorMode(): boolean {
  const mode = getMode();
  return mode === 'orchestrator';
}

/**
 * Get orchestrator context for hook processing
 */
export interface OrchestratorContext {
  enabled: boolean;
  state: OrchestratorState | null;
  featureList: FeatureList | null;
  needsOnboarding: boolean;
  phaseEmoji: string;
  phaseProgress: string;
  sprintProgress: {
    total: number;
    completed: number;
    verified: number;
    percentage: number;
  } | null;
}

/**
 * Get the current orchestrator context
 */
export function getOrchestratorContext(
  projectDir: string = process.cwd()
): OrchestratorContext {
  const enabled = isOrchestratorMode();

  if (!enabled) {
    return {
      enabled: false,
      state: null,
      featureList: null,
      needsOnboarding: false,
      phaseEmoji: '',
      phaseProgress: '',
      sprintProgress: null,
    };
  }

  // Check if this is a new project needing onboarding
  const hasState = hasOrchestratorState(projectDir);

  if (!hasState) {
    return {
      enabled: true,
      state: null,
      featureList: null,
      needsOnboarding: true,
      phaseEmoji: getPhaseEmoji('onboarding'),
      phaseProgress: getPhaseProgress('onboarding'),
      sprintProgress: null,
    };
  }

  // Load existing state
  const state = loadState(projectDir);

  if (!state) {
    return {
      enabled: true,
      state: null,
      featureList: null,
      needsOnboarding: true,
      phaseEmoji: getPhaseEmoji('onboarding'),
      phaseProgress: getPhaseProgress('onboarding'),
      sprintProgress: null,
    };
  }

  // Load feature list if available
  const featureList = loadFeatureList(state, projectDir);

  // Calculate sprint progress
  const sprintProgress = featureList
    ? getSprintProgress(featureList, state.currentSprint)
    : null;

  return {
    enabled: true,
    state,
    featureList,
    needsOnboarding: state.currentPhase === 'onboarding',
    phaseEmoji: getPhaseEmoji(state.currentPhase),
    phaseProgress: getPhaseProgress(state.currentPhase),
    sprintProgress,
  };
}

/**
 * Initialize orchestrator for a new project
 */
export function initializeOrchestrator(
  projectDir: string = process.cwd()
): OrchestratorState {
  return initializeState(projectDir);
}

/**
 * Generate status summary for display
 */
export function getStatusSummary(
  context: OrchestratorContext
): string {
  if (!context.enabled) {
    return '';
  }

  if (context.needsOnboarding) {
    return `${context.phaseEmoji} Orchestrator: Ready to start`;
  }

  if (!context.state) {
    return `${context.phaseEmoji} Orchestrator: Initializing...`;
  }

  const parts: string[] = [
    `${context.phaseEmoji} ${context.state.currentPhase}`,
    `Sprint ${context.state.currentSprint}`,
  ];

  if (context.sprintProgress) {
    parts.push(`${context.sprintProgress.percentage}% verified`);
  }

  return parts.join(' | ');
}

/**
 * Get phase-specific guidance message
 */
export function getPhaseGuidance(phase: DevelopmentPhase): string {
  const guidance: Record<DevelopmentPhase, string> = {
    onboarding: 'Tell me what you want to build, and I\'ll help you plan it out.',
    setup: 'Let\'s set up your project structure, initialize git, and get the foundation ready.',
    planning: 'Creating your feature list with dependencies and sprints.',
    development: 'Working through features. I\'ll track progress and handle blocking dependencies.',
    verification: 'Testing and verifying features. All acceptance criteria must pass.',
    production: 'Running production readiness checks: security, UX, UI, performance.',
    shipped: 'Deployed! Ready to start the next development cycle when you are.',
  };

  return guidance[phase] || 'Ready to continue development.';
}
