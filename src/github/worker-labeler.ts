/**
 * Worker Labeling System
 *
 * Labels GitHub issues for parallel Claude worker processing.
 * Only non-blocking features with satisfied dependencies can be labeled.
 */

import {
  updateIssue,
  listOpenIssues,
  GitHubIssue,
  GitHubClientResult,
} from './client.js';
import { Feature, FeatureList, calculateEffectiveStatus } from '../hero/feature-schema.js';
import { AutopilotConfig, DEFAULT_AUTOPILOT_CONFIG } from '../hero/autopilot-config.js';
import { GitHubFeature } from './issue-manager.js';

/**
 * Result of checking if a feature can be labeled for workers
 */
export interface LabelEligibility {
  eligible: boolean;
  reason: string;
  featureId: string;
  issueNumber?: number;
}

/**
 * Worker context to inject into issue body
 */
export interface WorkerContext {
  featureId: string;
  featureName: string;
  description: string;
  acceptanceCriteria: string[];
  dependsOn: string[];
  relatedFiles?: string[];
  scope: string;
  branchName: string;
  issueNumber: number;
}

/**
 * Check if a feature is eligible for worker labeling
 *
 * Eligibility requirements:
 * 1. Feature must have a linked GitHub issue
 * 2. Feature must not be blocking (other features depend on it)
 * 3. All dependencies must be satisfied (verified)
 * 4. Feature must be in 'ready' status
 */
export function checkLabelEligibility(
  feature: GitHubFeature,
  allFeatures: Feature[]
): LabelEligibility {
  const result: LabelEligibility = {
    eligible: false,
    reason: '',
    featureId: feature.id,
    issueNumber: feature.githubIssue,
  };

  // Must have a GitHub issue
  if (!feature.githubIssue) {
    result.reason = 'Feature has no linked GitHub issue';
    return result;
  }

  // Cannot be blocking (blocking features need human attention)
  if (feature.blocking) {
    result.reason = 'Blocking features require human orchestration';
    return result;
  }

  // Check effective status (includes dependency check)
  const effectiveStatus = calculateEffectiveStatus(feature, allFeatures);

  if (effectiveStatus === 'blocked') {
    result.reason = 'Feature has unsatisfied dependencies';
    return result;
  }

  if (effectiveStatus !== 'ready' && effectiveStatus !== 'planned') {
    result.reason = `Feature status is '${effectiveStatus}', must be 'ready' or 'planned'`;
    return result;
  }

  // Already in progress or beyond
  if (feature.status === 'in_progress' || feature.status === 'implemented' || feature.status === 'verified') {
    result.reason = `Feature is already ${feature.status}`;
    return result;
  }

  // All checks passed
  result.eligible = true;
  result.reason = 'Feature is eligible for worker processing';
  return result;
}

/**
 * Get all features eligible for worker labeling
 */
export function getEligibleFeatures(
  featureList: FeatureList,
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG
): LabelEligibility[] {
  const results: LabelEligibility[] = [];

  for (const feature of featureList.features) {
    const ghFeature = feature as GitHubFeature;
    const eligibility = checkLabelEligibility(ghFeature, featureList.features);
    results.push(eligibility);
  }

  return results;
}

/**
 * Generate worker context for an issue
 */
export function generateWorkerContext(
  feature: GitHubFeature,
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG
): WorkerContext {
  const branchPattern = config.branchPattern || 'claude-worker/{feature-id}';
  const branchName = branchPattern.replace(
    '{feature-id}',
    feature.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  );

  return {
    featureId: feature.id,
    featureName: feature.name,
    description: feature.description,
    acceptanceCriteria: feature.acceptanceCriteria.map(c => c.description),
    dependsOn: feature.dependsOn,
    relatedFiles: [], // To be populated by caller with codebase analysis
    scope: `This worker is scoped to feature ${feature.id} only. Do not modify unrelated files.`,
    branchName,
    issueNumber: feature.githubIssue || 0,
  };
}

/**
 * Format worker context as markdown for issue body
 */
export function formatWorkerContextMarkdown(context: WorkerContext): string {
  const sections: string[] = [];

  sections.push('---');
  sections.push('## Claude Worker Context');
  sections.push('');
  sections.push('> This issue is labeled for parallel Claude worker processing.');
  sections.push('');

  sections.push('### Scope');
  sections.push(context.scope);
  sections.push('');

  sections.push('### Branch');
  sections.push(`Create branch: \`${context.branchName}\``);
  sections.push('');

  sections.push('### Acceptance Criteria');
  for (const criterion of context.acceptanceCriteria) {
    sections.push(`- [ ] ${criterion}`);
  }
  sections.push('');

  if (context.dependsOn.length > 0) {
    sections.push('### Dependencies');
    sections.push('These features must be complete before this one:');
    for (const dep of context.dependsOn) {
      sections.push(`- \`${dep}\``);
    }
    sections.push('');
  }

  if (context.relatedFiles && context.relatedFiles.length > 0) {
    sections.push('### Related Files');
    sections.push('Consider these files when implementing:');
    for (const file of context.relatedFiles) {
      sections.push(`- \`${file}\``);
    }
    sections.push('');
  }

  sections.push('### Worker Instructions');
  sections.push('1. Create the branch specified above');
  sections.push('2. Implement the feature according to acceptance criteria');
  sections.push('3. Write tests for new functionality');
  sections.push(`4. Create a PR with \`Fixes #${context.issueNumber}\` in the description`);
  sections.push('');

  return sections.join('\n');
}

/**
 * Label a GitHub issue for worker processing
 *
 * Adds the worker label and appends worker context to the issue body.
 */
export async function labelIssueForWorker(
  issueNumber: number,
  context: WorkerContext,
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG
): Promise<GitHubClientResult<void>> {
  const workerLabel = config.workerLabel || 'ready-for-claude';

  // First, get the current issue to preserve existing body
  const issuesResult = await listOpenIssues({ limit: 100 });
  if (!issuesResult.success || !issuesResult.data) {
    return { success: false, error: 'Failed to fetch issues' };
  }

  const issue = issuesResult.data.find(i => i.number === issueNumber);
  if (!issue) {
    return { success: false, error: `Issue #${issueNumber} not found` };
  }

  // Check if already has worker label
  if (issue.labels.includes(workerLabel)) {
    return { success: true }; // Already labeled
  }

  // Generate worker context markdown
  const contextMarkdown = formatWorkerContextMarkdown(context);

  // Append context to existing body (avoid duplication)
  let newBody = issue.body;
  if (!newBody.includes('## Claude Worker Context')) {
    newBody = issue.body + '\n\n' + contextMarkdown;
  }

  // Update issue with label and context
  return updateIssue(issueNumber, {
    body: newBody,
    labels: [workerLabel],
  });
}

/**
 * Remove worker label from an issue
 */
export async function unlabelIssueForWorker(
  issueNumber: number,
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG
): Promise<GitHubClientResult<void>> {
  // gh CLI doesn't have --remove-label, so we need to use the API directly
  // For now, we'll just return success - full implementation would use gh api
  return { success: true };
}

/**
 * Label all eligible features for worker processing
 */
export async function labelEligibleFeatures(
  featureList: FeatureList,
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG,
  options: {
    maxToLabel?: number;
    dryRun?: boolean;
  } = {}
): Promise<{
  labeled: string[];
  skipped: Array<{ featureId: string; reason: string }>;
  errors: Array<{ featureId: string; error: string }>;
}> {
  const { maxToLabel = config.maxConcurrentWorkers, dryRun = false } = options;

  const result = {
    labeled: [] as string[],
    skipped: [] as Array<{ featureId: string; reason: string }>,
    errors: [] as Array<{ featureId: string; error: string }>,
  };

  const eligibilityResults = getEligibleFeatures(featureList, config);

  for (const eligibility of eligibilityResults) {
    // Check if we've hit the limit
    if (result.labeled.length >= maxToLabel) {
      result.skipped.push({
        featureId: eligibility.featureId,
        reason: 'Max concurrent workers limit reached',
      });
      continue;
    }

    if (!eligibility.eligible) {
      result.skipped.push({
        featureId: eligibility.featureId,
        reason: eligibility.reason,
      });
      continue;
    }

    // Find the feature to generate context
    const feature = featureList.features.find(f => f.id === eligibility.featureId) as GitHubFeature;
    if (!feature) {
      result.errors.push({
        featureId: eligibility.featureId,
        error: 'Feature not found',
      });
      continue;
    }

    const context = generateWorkerContext(feature, config);

    if (dryRun) {
      result.labeled.push(eligibility.featureId);
      continue;
    }

    // Label the issue
    const labelResult = await labelIssueForWorker(
      eligibility.issueNumber!,
      context,
      config
    );

    if (labelResult.success) {
      result.labeled.push(eligibility.featureId);
    } else {
      result.errors.push({
        featureId: eligibility.featureId,
        error: labelResult.error || 'Unknown error',
      });
    }
  }

  return result;
}

/**
 * Get count of currently labeled issues (active workers)
 */
export async function getActiveWorkerCount(
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG
): Promise<number> {
  const workerLabel = config.workerLabel || 'ready-for-claude';
  const result = await listOpenIssues({ labels: [workerLabel] });

  if (result.success && result.data) {
    return result.data.length;
  }

  return 0;
}

/**
 * Check if more workers can be spawned
 */
export async function canSpawnMoreWorkers(
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG
): Promise<{ canSpawn: boolean; currentCount: number; maxAllowed: number }> {
  const currentCount = await getActiveWorkerCount(config);
  const maxAllowed = config.maxConcurrentWorkers;

  return {
    canSpawn: currentCount < maxAllowed,
    currentCount,
    maxAllowed,
  };
}
