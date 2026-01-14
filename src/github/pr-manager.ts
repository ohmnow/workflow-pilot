/**
 * GitHub Pull Request Manager
 *
 * Creates and manages pull requests for completed features.
 * Links PRs to issues and tracks CI status.
 */

import {
  createPR,
  listOpenPRs,
  GitHubPR,
  GitHubClientResult,
} from './client.js';
import { Feature, AcceptanceCriterion } from '../hero/feature-schema.js';
import { GitHubFeature } from './issue-manager.js';
import { getCurrentBranch, pushBranch } from './repo-manager.js';

/**
 * Create a PR for a completed feature
 */
export async function createPRForFeature(
  feature: GitHubFeature,
  options: {
    baseBranch?: string;
    draft?: boolean;
    projectDir?: string;
  } = {}
): Promise<GitHubClientResult<GitHubPR>> {
  const projectDir = options.projectDir || process.cwd();

  // Ensure we're on the feature branch
  const currentBranch = await getCurrentBranch(projectDir);
  const expectedBranch = feature.githubBranch || `feature/${feature.id}`;

  if (currentBranch !== expectedBranch) {
    return {
      success: false,
      error: `Expected to be on branch "${expectedBranch}" but on "${currentBranch}"`,
    };
  }

  // Push the branch first
  const pushResult = await pushBranch(projectDir, { setUpstream: true });
  if (!pushResult.success) {
    return {
      success: false,
      error: `Failed to push branch: ${pushResult.error}`,
    };
  }

  // Format PR content
  const title = formatPRTitle(feature);
  const body = formatPRBody(feature);

  return createPR(title, body, {
    base: options.baseBranch || 'main',
    draft: options.draft,
  });
}

/**
 * Get all open PRs for features
 */
export async function getOpenFeaturePRs(): Promise<GitHubClientResult<GitHubPR[]>> {
  const result = await listOpenPRs({ limit: 50 });

  if (!result.success || !result.data) {
    return result;
  }

  // Filter to feature branches
  const featurePRs = result.data.filter(
    pr => pr.headBranch.startsWith('feature/')
  );

  return { success: true, data: featurePRs };
}

/**
 * Format PR title from feature
 */
function formatPRTitle(feature: Feature): string {
  // Clean up feature name for title
  let title = feature.name;

  // Add prefix based on feature type
  if (feature.blocking) {
    title = `feat: ${title}`;
  } else {
    title = `feat: ${title}`;
  }

  return title;
}

/**
 * Format PR body from feature
 */
function formatPRBody(feature: GitHubFeature): string {
  const sections: string[] = [];

  // Link to issue if exists
  if (feature.githubIssue) {
    sections.push(`Closes #${feature.githubIssue}`);
    sections.push('');
  }

  // Summary
  sections.push(`## Summary\n\n${feature.description}`);

  // Implementation steps completed
  if (feature.steps.length > 0) {
    const completedSteps = feature.steps.filter(s => s.completed);
    if (completedSteps.length > 0) {
      const stepsText = completedSteps
        .map(s => `- ${s.description}`)
        .join('\n');
      sections.push(`## Changes\n\n${stepsText}`);
    }
  }

  // Test plan from acceptance criteria
  if (feature.acceptanceCriteria.length > 0) {
    const testPlan = feature.acceptanceCriteria
      .map(c => formatTestItem(c))
      .join('\n');
    sections.push(`## Test Plan\n\n${testPlan}`);
  }

  // Notes
  if (feature.notes) {
    sections.push(`## Notes\n\n${feature.notes}`);
  }

  // Footer
  sections.push('---');
  sections.push(`*Sprint ${feature.sprint} | Feature ID: \`${feature.id}\`*`);
  sections.push('');
  sections.push('*Created with [Claude Hero](https://github.com/ohmnow/claude-hero)*');

  return sections.join('\n\n');
}

/**
 * Format acceptance criterion as test item
 */
function formatTestItem(criterion: AcceptanceCriterion): string {
  const checked = criterion.verified ? 'x' : ' ';
  return `- [${checked}] ${criterion.description}`;
}

/**
 * Generate PR summary for multiple features
 */
export function generatePRSummary(features: GitHubFeature[]): string {
  const withPR = features.filter(f => f.githubPR);
  const withoutPR = features.filter(f => !f.githubPR && f.status === 'implemented');

  const lines: string[] = [];

  if (withPR.length > 0) {
    lines.push(`PRs Created: ${withPR.length}`);
    for (const f of withPR) {
      lines.push(`  - #${f.githubPR}: ${f.name}`);
    }
  }

  if (withoutPR.length > 0) {
    lines.push(`\nReady for PR: ${withoutPR.length}`);
    for (const f of withoutPR) {
      lines.push(`  - ${f.name} (${f.id})`);
    }
  }

  return lines.join('\n');
}

/**
 * Check if a feature is ready for a PR
 */
export function isReadyForPR(feature: Feature): boolean {
  // Must be implemented or verified
  if (feature.status !== 'implemented' && feature.status !== 'verified') {
    return false;
  }

  // Should have at least some steps completed
  const completedSteps = feature.steps.filter(s => s.completed).length;
  if (feature.steps.length > 0 && completedSteps === 0) {
    return false;
  }

  return true;
}

/**
 * Get context about open PRs for injection into prompts
 */
export async function getPRContext(): Promise<string> {
  const result = await getOpenFeaturePRs();

  if (!result.success || !result.data || result.data.length === 0) {
    return '';
  }

  const lines = ['## Open Pull Requests', ''];

  for (const pr of result.data) {
    const draftLabel = pr.draft ? ' [DRAFT]' : '';
    lines.push(`- #${pr.number}: ${pr.title}${draftLabel}`);
    lines.push(`  Branch: ${pr.headBranch} → ${pr.baseBranch}`);
  }

  return lines.join('\n');
}
