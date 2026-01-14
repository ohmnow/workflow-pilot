/**
 * Development Phases for Orchestrator Mode
 *
 * Defines the lifecycle phases a project goes through from idea to production.
 * Based on Anthropic's proven development patterns.
 */

/**
 * Development phases from idea to production
 */
export type DevelopmentPhase =
  | 'onboarding'      // Initial setup, asking what to build
  | 'setup'           // git init, scaffold, initial commit
  | 'planning'        // Generate feature_list.json from PRD
  | 'development'     // Sprint cycles with blocking deps
  | 'verification'    // Tests pass, features marked verified
  | 'production'      // Production readiness checks
  | 'shipped';        // Deployment complete

/**
 * Phase metadata with descriptions and allowed transitions
 */
export interface PhaseInfo {
  name: DevelopmentPhase;
  description: string;
  nextPhases: DevelopmentPhase[];
  isTerminal: boolean;
}

/**
 * Phase definitions with transition rules
 */
export const PHASES: Record<DevelopmentPhase, PhaseInfo> = {
  onboarding: {
    name: 'onboarding',
    description: 'Initial setup - understanding what to build',
    nextPhases: ['setup'],
    isTerminal: false,
  },
  setup: {
    name: 'setup',
    description: 'Project scaffolding - git, structure, dependencies',
    nextPhases: ['planning'],
    isTerminal: false,
  },
  planning: {
    name: 'planning',
    description: 'Feature planning - creating feature_list.json',
    nextPhases: ['development'],
    isTerminal: false,
  },
  development: {
    name: 'development',
    description: 'Active development - implementing features in sprints',
    nextPhases: ['verification', 'development'], // Can loop back
    isTerminal: false,
  },
  verification: {
    name: 'verification',
    description: 'Testing and verification - ensuring features work',
    nextPhases: ['development', 'production'], // Can go back or forward
    isTerminal: false,
  },
  production: {
    name: 'production',
    description: 'Production readiness - security, UX, performance checks',
    nextPhases: ['development', 'shipped'], // Can go back or deploy
    isTerminal: false,
  },
  shipped: {
    name: 'shipped',
    description: 'Deployed to production',
    nextPhases: ['development'], // Can start new features
    isTerminal: true,
  },
};

/**
 * Check if a phase transition is valid
 */
export function canTransitionTo(
  currentPhase: DevelopmentPhase,
  targetPhase: DevelopmentPhase
): boolean {
  const current = PHASES[currentPhase];
  return current.nextPhases.includes(targetPhase);
}

/**
 * Get the next recommended phase based on current state
 */
export function getRecommendedNextPhase(
  currentPhase: DevelopmentPhase,
  context: {
    hasFeatureList?: boolean;
    allFeaturesVerified?: boolean;
    productionChecksPass?: boolean;
  }
): DevelopmentPhase | null {
  switch (currentPhase) {
    case 'onboarding':
      return 'setup';

    case 'setup':
      return 'planning';

    case 'planning':
      return context.hasFeatureList ? 'development' : null;

    case 'development':
      return 'verification';

    case 'verification':
      return context.allFeaturesVerified ? 'production' : 'development';

    case 'production':
      return context.productionChecksPass ? 'shipped' : null;

    case 'shipped':
      return null; // Terminal state (or start new cycle)

    default:
      return null;
  }
}

/**
 * Get human-readable phase progress indicator
 */
export function getPhaseProgress(phase: DevelopmentPhase): string {
  const phaseOrder: DevelopmentPhase[] = [
    'onboarding',
    'setup',
    'planning',
    'development',
    'verification',
    'production',
    'shipped',
  ];

  const currentIndex = phaseOrder.indexOf(phase);
  const total = phaseOrder.length;

  return `${currentIndex + 1}/${total}`;
}

/**
 * Get emoji indicator for phase
 */
export function getPhaseEmoji(phase: DevelopmentPhase): string {
  const emojis: Record<DevelopmentPhase, string> = {
    onboarding: '🎯',
    setup: '🔧',
    planning: '📋',
    development: '⚡',
    verification: '✅',
    production: '🚀',
    shipped: '🎉',
  };

  return emojis[phase] || '📦';
}
