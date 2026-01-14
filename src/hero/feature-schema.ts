/**
 * Feature Schema for Orchestrator Mode
 *
 * Defines the structure for feature_list.json with enhanced support for:
 * - Blocking dependencies between features
 * - Sprint assignments
 * - Verification status tracking
 * - Acceptance criteria
 *
 * Inspired by Anthropic's feature_list.json pattern.
 */

/**
 * Feature status lifecycle
 */
export type FeatureStatus =
  | 'planned'       // Defined but not started
  | 'ready'         // Dependencies met, can start
  | 'in_progress'   // Currently being worked on
  | 'blocked'       // Waiting on dependencies
  | 'implemented'   // Code complete, needs verification
  | 'verified';     // Tests pass, acceptance criteria met

/**
 * Individual step within a feature
 */
export interface FeatureStep {
  id: string;
  description: string;
  completed: boolean;
  notes?: string;
}

/**
 * Acceptance criterion for verification
 */
export interface AcceptanceCriterion {
  id: string;
  description: string;
  verified: boolean;
  verifiedAt?: string;  // ISO timestamp
  notes?: string;
}

/**
 * Enhanced Feature with blocking dependencies
 */
export interface Feature {
  id: string;
  name: string;
  description: string;

  /** If true, dependent features cannot start until this passes */
  blocking: boolean;

  /** Feature IDs this depends on */
  dependsOn: string[];

  /** Current status */
  status: FeatureStatus;

  /** Only true after verification passes */
  passes: boolean;

  /** Sprint assignment (1-based) */
  sprint: number;

  /** Implementation steps */
  steps: FeatureStep[];

  /** Acceptance criteria for verification */
  acceptanceCriteria: AcceptanceCriterion[];

  /** Optional priority within sprint (lower = higher priority) */
  priority?: number;

  /** Timestamps */
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  verifiedAt?: string;

  /** Notes from development */
  notes?: string;

  // GitHub integration (optional)
  /** Linked GitHub issue number */
  githubIssue?: number;
  /** Linked GitHub PR number */
  githubPR?: number;
  /** Feature branch name */
  githubBranch?: string;
}

/**
 * Sprint definition
 */
export interface Sprint {
  number: number;
  name?: string;
  goal?: string;
  status: 'planned' | 'active' | 'completed';
  startedAt?: string;
  completedAt?: string;
}

/**
 * Complete feature list file structure
 */
export interface FeatureList {
  /** Schema version for future migrations */
  version: string;

  /** Project metadata */
  project: {
    name: string;
    description: string;
    createdAt: string;
  };

  /** Sprint definitions */
  sprints: Sprint[];

  /** All features */
  features: Feature[];

  /** Metadata */
  metadata?: {
    generatedFrom?: string;  // e.g., 'PRD', 'manual'
    lastUpdated: string;
  };
}

/**
 * Create a new empty feature list
 */
export function createEmptyFeatureList(projectName: string, description: string): FeatureList {
  return {
    version: '1.0.0',
    project: {
      name: projectName,
      description,
      createdAt: new Date().toISOString(),
    },
    sprints: [
      {
        number: 1,
        name: 'Initial Development',
        status: 'planned',
      },
    ],
    features: [],
    metadata: {
      generatedFrom: 'manual',
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Create a new feature with defaults
 */
export function createFeature(
  id: string,
  name: string,
  description: string,
  options: Partial<Feature> = {}
): Feature {
  return {
    id,
    name,
    description,
    blocking: false,
    dependsOn: [],
    status: 'planned',
    passes: false,
    sprint: 1,
    steps: [],
    acceptanceCriteria: [],
    createdAt: new Date().toISOString(),
    ...options,
  };
}

/**
 * Calculate effective status based on dependencies
 */
export function calculateEffectiveStatus(
  feature: Feature,
  allFeatures: Feature[]
): FeatureStatus {
  // If already verified, stay verified
  if (feature.status === 'verified') {
    return 'verified';
  }

  // If in progress, check if it should be blocked
  if (feature.dependsOn.length > 0) {
    const dependencies = feature.dependsOn.map(depId =>
      allFeatures.find(f => f.id === depId)
    );

    // Check if any blocking dependencies are not verified
    const hasUnmetBlockingDeps = dependencies.some(dep => {
      if (!dep) return true; // Missing dependency counts as blocking
      if (dep.blocking && !dep.passes) return true;
      return false;
    });

    if (hasUnmetBlockingDeps) {
      return 'blocked';
    }
  }

  // If planned with no unmet deps, it's ready
  if (feature.status === 'planned') {
    return 'ready';
  }

  return feature.status;
}

/**
 * Get features that are ready to work on
 */
export function getReadyFeatures(featureList: FeatureList): Feature[] {
  return featureList.features.filter(feature => {
    const effectiveStatus = calculateEffectiveStatus(feature, featureList.features);
    return effectiveStatus === 'ready';
  });
}

/**
 * Get features that can be worked on in parallel (non-blocking, same sprint)
 */
export function getParallelizableFeatures(
  featureList: FeatureList,
  currentSprint: number
): Feature[] {
  return featureList.features.filter(feature => {
    if (feature.sprint !== currentSprint) return false;
    if (feature.blocking) return false;
    const effectiveStatus = calculateEffectiveStatus(feature, featureList.features);
    return effectiveStatus === 'ready';
  });
}

/**
 * Calculate sprint progress
 */
export function getSprintProgress(
  featureList: FeatureList,
  sprintNumber: number
): { total: number; completed: number; verified: number; percentage: number } {
  const sprintFeatures = featureList.features.filter(f => f.sprint === sprintNumber);
  const total = sprintFeatures.length;
  const completed = sprintFeatures.filter(f =>
    f.status === 'implemented' || f.status === 'verified'
  ).length;
  const verified = sprintFeatures.filter(f => f.status === 'verified').length;

  return {
    total,
    completed,
    verified,
    percentage: total > 0 ? Math.round((verified / total) * 100) : 0,
  };
}
